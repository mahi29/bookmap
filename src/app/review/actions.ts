"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isValidMapCountry } from "@/lib/countries";

// Server action: confirm/override an author's map country from the review queue. This is
// the manual-correction surface — it wins over any automated guess and clears the flag.
export async function saveAuthorCountry(authorId: string, iso3: string) {
  const code = iso3.toUpperCase();
  if (!isValidMapCountry(code)) {
    throw new Error(`Invalid country code: ${iso3}`);
  }

  await prisma.author.update({
    where: { id: authorId },
    data: {
      resolvedCountryIso3: code,
      resolutionMethod: "manual",
      confidence: 1,
      needsReview: false,
      reasoning: "Set manually in the review queue",
      resolvedAt: new Date(),
    },
  });

  // The map and the queue both change when an author is resolved.
  revalidatePath("/");
  revalidatePath("/review");
}
