"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isValidMapCountry } from "@/lib/countries";

// Server action: confirm/override an author's map countries from the review queue. This
// is the manual-correction surface — it wins over any automated guess and clears the flag.
export async function saveAuthorCountries(authorId: string, iso3s: string[]) {
  const codes = [...new Set(iso3s.map((c) => c.toUpperCase()))].filter(
    isValidMapCountry,
  );
  if (codes.length === 0) {
    throw new Error("Select at least one valid country.");
  }

  await prisma.author.update({
    where: { id: authorId },
    data: {
      resolutionMethod: "manual",
      confidence: 1,
      needsReview: false,
      reasoning: "Set manually in the review queue",
      resolvedAt: new Date(),
      countries: { deleteMany: {}, create: codes.map((iso3) => ({ iso3 })) },
    },
  });

  // The map and the queue both change when an author is resolved.
  revalidatePath("/");
  revalidatePath("/review");
}
