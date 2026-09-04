import { looksLikeIsbnQuery, normalizeIsbn } from "./isbn";
import { SEARCH_RESULT_LIMIT, type BookSearchHit } from "./hits";

// I/O layer: search Google Books (keyless v1) and map volumes to BookSearchHit.
// Parsing is pure and unit-tested; only searchGoogleBooks touches the network.
// TODO(plan): send a GOOGLE_BOOKS_API_KEY once we have one — keyless quota is tight.

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const USER_AGENT =
  "BookMap/0.1 (https://github.com/mahi29/bookmap; personal reading tracker)";

export interface GoogleBooksIdentifier {
  type?: string;
  identifier?: string;
}

export interface GoogleBooksVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    industryIdentifiers?: GoogleBooksIdentifier[];
  };
}

export interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
}

function yearFromPublishedDate(
  publishedDate: string | undefined,
): string | null {
  if (!publishedDate) return null;
  const match = publishedDate.match(/^(\d{4})/);
  return match ? match[1] : null;
}

function isbnFromVolume(info: GoogleBooksVolume["volumeInfo"]): string | null {
  const ids = info?.industryIdentifiers ?? [];
  const isbn13 = ids.find((id) => id.type === "ISBN_13")?.identifier;
  const isbn10 = ids.find((id) => id.type === "ISBN_10")?.identifier;
  return normalizeIsbn(isbn13 ?? isbn10 ?? "");
}

/** Pure: turn a Google Books volumes payload into at most `limit` search hits. */
export function parseGoogleBooksResponse(
  payload: GoogleBooksResponse,
  limit: number,
): BookSearchHit[] {
  const hits: BookSearchHit[] = [];
  for (const item of payload.items ?? []) {
    const info = item.volumeInfo;
    const title = info?.title?.trim() ?? "";
    const authors = (info?.authors ?? []).map((a) => a.trim()).filter(Boolean);
    if (!title || authors.length === 0) continue;
    hits.push({
      title,
      authors,
      isbn: isbnFromVolume(info),
      year: yearFromPublishedDate(info?.publishedDate),
      source: "google",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

function searchUrl(query: string): string {
  const trimmed = query.trim();
  const isbn = normalizeIsbn(trimmed);
  const q = looksLikeIsbnQuery(trimmed) && isbn ? `isbn:${isbn}` : trimmed;
  const params = new URLSearchParams({
    q,
    maxResults: String(SEARCH_RESULT_LIMIT),
  });
  return `${GOOGLE_BOOKS_API}?${params}`;
}

type FetchFn = typeof fetch;

/**
 * Search Google Books for a title or ISBN. Returns [] on HTTP/network failure so
 * the typeahead can still show library hits.
 */
export async function searchGoogleBooks(
  query: string,
  fetchFn: FetchFn = fetch,
): Promise<BookSearchHit[]> {
  try {
    const res = await fetchFn(searchUrl(query), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as GoogleBooksResponse;
    return parseGoogleBooksResponse(payload, SEARCH_RESULT_LIMIT);
  } catch {
    return [];
  }
}
