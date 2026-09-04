export type BookSearchSource = "library" | "google";

export interface BookSearchHit {
  title: string;
  authors: string[];
  isbn: string | null;
  year: string | null;
  source: BookSearchSource;
}

export const SEARCH_RESULT_LIMIT = 5;

export interface LibraryBookRecord {
  title: string;
  isbn: string | null;
  authors: { author: { name: string } }[];
}

/** Map a stored Book (with authors) into a typeahead hit. */
export function mapLibraryBook(book: LibraryBookRecord): BookSearchHit {
  return {
    title: book.title,
    authors: book.authors.map((ba) => ba.author.name),
    isbn: book.isbn,
    year: null,
    source: "library",
  };
}

function titleAuthorKey(hit: BookSearchHit): string {
  const authors = [...hit.authors]
    .map((a) => a.toLowerCase())
    .sort()
    .join("|");
  return `ta:${hit.title.trim().toLowerCase()}::${authors}`;
}

/** Library hits first; skip Google duplicates; cap at `limit`. */
export function mergeSearchHits(
  library: BookSearchHit[],
  remote: BookSearchHit[],
  limit = SEARCH_RESULT_LIMIT,
): BookSearchHit[] {
  const seen = new Set<string>();
  const out: BookSearchHit[] = [];

  const consider = (hit: BookSearchHit) => {
    if (out.length >= limit) return;
    const keys = [titleAuthorKey(hit)];
    if (hit.isbn) keys.push(`isbn:${hit.isbn}`);
    if (keys.some((k) => seen.has(k))) return;
    for (const k of keys) seen.add(k);
    out.push(hit);
  };

  for (const hit of library) consider(hit);
  for (const hit of remote) consider(hit);
  return out;
}

export interface SelectedSearchHit {
  title: string;
  authors: string[];
  isbn: string | null;
}

/**
 * After a typeahead pick, the ISBN only still identifies that volume if the user
 * hasn't edited the title or author list. An edit means we no longer know the
 * identifier is valid, so the add flow should drop it.
 */
export function isbnStillValid(
  selected: SelectedSearchHit,
  current: { title: string; authors: string[] },
): boolean {
  if (!selected.isbn) return false;
  if (selected.title.trim() !== current.title.trim()) return false;
  if (selected.authors.length !== current.authors.length) return false;
  return selected.authors.every((name, i) => name === current.authors[i]);
}
