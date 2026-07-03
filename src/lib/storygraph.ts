import Papa from "papaparse";

// Domain module: parse a StoryGraph CSV export into normalized books + reading events.
// Pure and framework-free — no DB or React here. The seed script/importer maps these
// structures into Prisma rows.

export interface ParsedReading {
  dateStarted: Date | null;
  dateRead: Date | null;
  rating: number | null;
}

export interface ParsedBook {
  title: string;
  authors: string[];
  isbn: string | null;
  readStatus: string;
  readings: ParsedReading[];
  /** The original CSV row, for storage/debugging. */
  raw: Record<string, string>;
}

type Row = Record<string, string>;

/** Parse a `YYYY/MM/DD` StoryGraph date into a UTC Date, or null if absent/invalid. */
function parseDate(value: string | undefined): Date | null {
  const match = value?.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

function splitAuthors(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Derive reading events from a row. `Dates Read` holds one or more `start-end` ranges
 * (comma-separated on a re-read); we fall back to `Last Date Read`, and finally to a
 * single undated reading when a book is marked read but carries no dates.
 */
function parseReadings(row: Row): ParsedReading[] {
  const rating = row["Star Rating"] ? Number(row["Star Rating"]) : null;
  const ratingValue = rating !== null && Number.isFinite(rating) ? rating : null;

  const datesRead = (row["Dates Read"] ?? "").trim();
  if (datesRead) {
    return datesRead
      .split(",")
      .map((range) => range.trim())
      .filter(Boolean)
      .map((range) => {
        const [start, end] = range.split("-").map((p) => p.trim());
        const startDate = parseDate(start);
        const endDate = end ? parseDate(end) : null;
        return {
          // A lone date means a same-known-day finish; treat it as the read date.
          dateStarted: endDate ? startDate : null,
          dateRead: endDate ?? startDate,
          rating: ratingValue,
        };
      });
  }

  const lastRead = parseDate(row["Last Date Read"]);
  const status = (row["Read Status"] ?? "").trim().toLowerCase();
  if (lastRead || status === "read") {
    return [{ dateStarted: null, dateRead: lastRead, rating: ratingValue }];
  }

  return [];
}

/** Parse a StoryGraph CSV export string into normalized books. */
export function parseStoryGraphCsv(csv: string): ParsedBook[] {
  const { data } = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const books: ParsedBook[] = [];
  for (const row of data) {
    const title = (row["Title"] ?? "").trim();
    if (!title) continue;

    const isbn = (row["ISBN/UID"] ?? "").trim() || null;
    books.push({
      title,
      authors: splitAuthors(row["Authors"]),
      isbn,
      readStatus: (row["Read Status"] ?? "").trim().toLowerCase(),
      readings: parseReadings(row),
      raw: row,
    });
  }
  return books;
}
