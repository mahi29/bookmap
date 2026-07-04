import { ReadingSource, ResolutionMethod } from "../shared/constants";
import { prisma } from "../../infrastructure/db/prisma";
import { persistResolution } from "../../infrastructure/db/prisma-author-resolution-repository";
import { resolveAuthorNationality } from "../nationality-resolution/wikidata-resolver";
import type { ReadingInput } from "./normalize-reading";

// Add-reading application service: persist a reading, creating the book/authors as
// needed and resolving any brand-new authors through the same Wikidata pipeline the
// seed uses. See normalize-reading.ts for the pure input validation this consumes.

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
