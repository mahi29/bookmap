// Add-reading domain: pure validation/normalization of the raw form fields into a
// ReadingInput. No I/O here — see reading-service.ts for persistence.

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
