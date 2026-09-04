import { ReadingSource, ResolutionMethod } from "../shared/constants";
import { canonicalizeIsbn } from "../shared/isbn";
import { prisma } from "../../infrastructure/db/prisma";
import { persistResolution } from "../../infrastructure/db/prisma-author-resolution-repository";
import { resolveAuthorNationality } from "../nationality-resolution/wikidata-resolver";
import type { ReadingInput } from "./normalize-reading";

// Add-reading application service: persist a reading, creating the book/authors as
// needed and resolving any brand-new authors through the same Wikidata pipeline the
// seed uses. See normalize-reading.ts for the pure input validation this consumes.
//
// Reuse vs create (never "update authors"):
//   1. Canonicalize the submitted ISBN (or null).
//   2. Library pick sent bookId → reuse that row.
//   3. ISBN hits AND author set matches → reuse. Backfill isbn only if the row's
//      isbn is null (and the ISBN-13 is not taken — unique).
//   4. findMany by title, pick the row whose author set matches → reuse.
//      Backfill isbn only if null and that ISBN-13 is not already taken.
//   5. Else create { title, isbn } (isbn omitted if missing or taken). Only this
//      path creates authors and BookAuthor rows, then Wikidata-resolves new authors.
// Countries come from the book actually linked. Reuse does not change title or
// upsert BookAuthor.

const bookWithAuthors = {
  authors: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          resolutionMethod: true,
          countries: { select: { iso3: true } },
        },
      },
    },
  },
} as const;

type BookWithAuthors = {
  id: string;
  title: string;
  isbn: string | null;
  authors: {
    author: {
      id: string;
      name: string;
      resolutionMethod: string;
      countries: { iso3: string }[];
    };
  }[];
};

function authorNames(book: BookWithAuthors): string[] {
  return book.authors.map((ba) => ba.author.name);
}

function sameAuthorSet(
  left: Iterable<string>,
  right: Iterable<string>,
): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const name of a) {
    if (!b.has(name)) return false;
  }
  return true;
}

function countriesFromBook(book: BookWithAuthors): string[] {
  const countries = new Set<string>();
  for (const ba of book.authors) {
    for (const country of ba.author.countries) {
      countries.add(country.iso3);
    }
  }
  return [...countries];
}

function isUniqueIsbnViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

async function isbnTaken(isbn: string): Promise<boolean> {
  const existing = await prisma.book.findUnique({ where: { isbn } });
  return existing !== null;
}

async function backfillIsbnIfFree(
  book: { id: string; isbn: string | null },
  isbn: string | null,
): Promise<void> {
  if (!isbn || book.isbn) return;
  if (await isbnTaken(isbn)) return;
  try {
    await prisma.book.update({ where: { id: book.id }, data: { isbn } });
    book.isbn = isbn;
  } catch (err) {
    if (!isUniqueIsbnViolation(err)) throw err;
  }
}

async function createBook(title: string, isbn: string | null) {
  const data: { title: string; isbn?: string } = { title };
  if (isbn && !(await isbnTaken(isbn))) {
    data.isbn = isbn;
  }
  try {
    return await prisma.book.create({ data });
  } catch (err) {
    if (data.isbn && isUniqueIsbnViolation(err)) {
      return prisma.book.create({ data: { title } });
    }
    throw err;
  }
}

async function findExistingBook(
  input: ReadingInput,
  isbn: string | null,
): Promise<BookWithAuthors | null> {
  if (input.bookId) {
    const byId = await prisma.book.findUnique({
      where: { id: input.bookId },
      include: bookWithAuthors,
    });
    if (byId) return byId;
  }

  if (isbn) {
    const byIsbn = await prisma.book.findUnique({
      where: { isbn },
      include: bookWithAuthors,
    });
    if (byIsbn && sameAuthorSet(input.authors, authorNames(byIsbn))) {
      return byIsbn;
    }
  }

  const byTitle = await prisma.book.findMany({
    where: { title: input.title },
    include: bookWithAuthors,
    orderBy: { createdAt: "asc" },
  });
  return (
    byTitle.find((book) => sameAuthorSet(input.authors, authorNames(book))) ??
    null
  );
}

async function linkAuthorsAndResolve(
  bookId: string,
  names: string[],
): Promise<string[]> {
  const countries = new Set<string>();
  for (const name of new Set(names)) {
    const author = await prisma.author.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.bookAuthor.create({
      data: { bookId, authorId: author.id },
    });

    const current = await prisma.author.findUnique({
      where: { id: author.id },
      select: { resolutionMethod: true, countries: { select: { iso3: true } } },
    });

    if (current?.resolutionMethod === ResolutionMethod.Unresolved) {
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
  return [...countries];
}

/** Persist a reading for a user, creating the book/authors as needed and resolving new authors. */
export async function addReading(
  input: ReadingInput,
  userId: string,
): Promise<{ countries: string[] }> {
  const isbn = canonicalizeIsbn(input.isbn);

  const existing = await findExistingBook(input, isbn);
  let countries: string[];
  let bookId: string;

  if (existing) {
    await backfillIsbnIfFree(existing, isbn);
    countries = countriesFromBook(existing);
    bookId = existing.id;
  } else {
    const created = await createBook(input.title, isbn);
    countries = await linkAuthorsAndResolve(created.id, input.authors);
    bookId = created.id;
  }

  await prisma.reading.create({
    data: {
      userId,
      bookId,
      dateRead: input.dateRead,
      rating: input.rating,
      source: ReadingSource.Manual,
    },
  });

  return { countries };
}
