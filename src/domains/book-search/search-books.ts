import { prisma } from "../../infrastructure/db/prisma";
import { looksLikeIsbnQuery, normalizeIsbn } from "./isbn";
import { searchGoogleBooks } from "./google-books";
import {
  SEARCH_RESULT_LIMIT,
  mapLibraryBook,
  mergeSearchHits,
  type BookSearchHit,
  type LibraryBookRecord,
} from "./hits";

export type { BookSearchHit } from "./hits";
export {
  isbnStillValid,
  mapLibraryBook,
  mergeSearchHits,
  SEARCH_RESULT_LIMIT,
} from "./hits";

const MIN_QUERY_LENGTH = 2;

const libraryInclude = {
  authors: { include: { author: { select: { name: true } } } },
} as const;

async function searchLibrary(query: string): Promise<BookSearchHit[]> {
  const isbn = normalizeIsbn(query);
  const books = await prisma.book.findMany({
    where:
      looksLikeIsbnQuery(query) && isbn
        ? { isbn }
        : { title: { contains: query, mode: "insensitive" } },
    include: libraryInclude,
    take: SEARCH_RESULT_LIMIT,
    orderBy: { title: "asc" },
  });
  return books.map((book) => mapLibraryBook(book as LibraryBookRecord));
}

/**
 * Typeahead search: matching books already in the library, then Google Books,
 * de-duplicated and capped at SEARCH_RESULT_LIMIT. Google failures are swallowed
 * so a downed API never hides local matches.
 */
export async function searchBooks(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<BookSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const [library, google] = await Promise.all([
    searchLibrary(trimmed),
    searchGoogleBooks(trimmed, fetchFn).catch(() => [] as BookSearchHit[]),
  ]);
  return mergeSearchHits(library, google, SEARCH_RESULT_LIMIT);
}
