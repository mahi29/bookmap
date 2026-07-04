"use server";

import { revalidatePath } from "next/cache";
import { countryName } from "@/domains/shared/countries";
import { normalizeReadingInput } from "@/domains/reading-log/normalize-reading";
import { addReading } from "@/domains/reading-log/reading-service";
import { verifySession } from "@/infrastructure/auth/dal";

export interface AddReadingState {
  ok: boolean;
  message: string;
}

// Server action: log a reading from the form. New authors are resolved on the way in so
// the map reflects the addition immediately.
export async function createReading(
  _prev: AddReadingState,
  formData: FormData,
): Promise<AddReadingState> {
  // The real auth check (the proxy redirect is only optimistic).
  const session = await verifySession();

  const parsed = normalizeReadingInput({
    title: String(formData.get("title") ?? ""),
    authors: String(formData.get("authors") ?? ""),
    dateRead: String(formData.get("dateRead") ?? ""),
    rating: String(formData.get("rating") ?? ""),
  });

  if (!parsed.ok) {
    return { ok: false, message: parsed.error };
  }

  const { countries } = await addReading(parsed.value, session.userId);
  revalidatePath("/");

  const where =
    countries.length > 0
      ? ` — ${countries.map((c) => countryName(c) ?? c).join(", ")}`
      : " — author not resolved yet";
  return { ok: true, message: `Added “${parsed.value.title}”${where}.` };
}
