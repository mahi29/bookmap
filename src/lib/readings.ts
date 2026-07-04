import { ReadingSource, ResolutionMethod } from "../domains/shared/constants";
import { prisma } from "../infrastructure/db/prisma";
import { persistResolution } from "./nationality/persist";
import { resolveAuthorNationality } from "./nationality/wikidata";

// Add-reading domain: normalize form input (pure/tested) and persist a reading, resolving
// any brand-new authors through the same Wikidata pipeline the seed uses.

export interface ReadingInput {
  title: string;
  authors: string[];
  dateRead: Date | null;
  rating: number | null;
}

export interface RawReadingInput {
  title: string;
  authors: string;
  dateRead?: string;
  rating?: string;
}

export type NormalizeResult =
  { ok: true; value: ReadingInput } | { ok: false; error: string };

/** Pure: validate + normalize the raw form fields into a ReadingInput. */
export function normalizeReadingInput(raw: RawReadingInput): NormalizeResult {
  const title = raw.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const authors = raw.authors
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (authors.length === 0)
    return { ok: false, error: "At least one author is required." };

  let dateRead: Date | null = null;
  const dateStr = raw.dateRead?.trim();
  if (dateStr) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return { ok: false, error: "Date must be YYYY-MM-DD." };
    const [, y, m, d] = match;
    dateRead = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    const rolledOver =
      dateRead.getUTCFullYear() !== Number(y) ||
      dateRead.getUTCMonth() !== Number(m) - 1 ||
      dateRead.getUTCDate() !== Number(d);
    if (Number.isNaN(dateRead.getTime()) || rolledOver)
      return { ok: false, error: "Invalid date." };
  }

  let rating: number | null = null;
  const ratingStr = raw.rating?.trim();
  if (ratingStr) {
    const value = Number(ratingStr);
    if (!Number.isFinite(value) || value < 0 || value > 5) {
      return { ok: false, error: "Rating must be between 0 and 5." };
    }
    rating = value;
  }

  return { ok: true, value: { title, authors, dateRead, rating } };
}

/** Persist a reading, creating the book/authors as needed and resolving new authors. */
export async function addReading(
  input: ReadingInput,
): Promise<{ countries: string[] }> {
  // Reuse an existing book only when both the title AND its author set match (a
  // re-read) — titles alone collide across unrelated works (e.g. "Hunger" by Knut
  // Hamsun vs. Roxane Gay), and reusing on title alone would wrongly attribute one
  // book to both authors' countries.
  const inputAuthorSet = new Set(input.authors);
  const candidate = await prisma.book.findFirst({
    where: { title: input.title },
    include: { authors: { include: { author: true } } },
  });
  const candidateAuthorSet = candidate
    ? new Set(candidate.authors.map((ba) => ba.author.name))
    : null;
  const sameAuthors =
    candidateAuthorSet !== null &&
    candidateAuthorSet.size === inputAuthorSet.size &&
    [...inputAuthorSet].every((name) => candidateAuthorSet.has(name));

  const book =
    candidate && sameAuthors
      ? candidate
      : await prisma.book.create({ data: { title: input.title } });

  const countries = new Set<string>();
  for (const name of new Set(input.authors)) {
    const author = await prisma.author.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.bookAuthor.upsert({
      where: { bookId_authorId: { bookId: book.id, authorId: author.id } },
      create: { bookId: book.id, authorId: author.id },
      update: {},
    });

    const current = await prisma.author.findUnique({
      where: { id: author.id },
      select: { resolutionMethod: true, countries: { select: { iso3: true } } },
    });

    if (current?.resolutionMethod === ResolutionMethod.Unresolved) {
      // Best-effort: resolve a brand-new author now so the map updates immediately.
      try {
        const r = await resolveAuthorNationality(name);
        await persistResolution(author.id, r);
        r.iso3s.forEach((c) => countries.add(c));
      } catch {
        // Leave the author unresolved; it can be resolved later via db:resolve.
      }
    } else {
      current?.countries.forEach((c) => countries.add(c.iso3));
    }
  }

  await prisma.reading.create({
    data: {
      bookId: book.id,
      dateRead: input.dateRead,
      rating: input.rating,
      source: ReadingSource.Manual,
    },
  });

  return { countries: [...countries] };
}
