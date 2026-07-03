// Pure aggregation: turn per-book country entries into the map's two headline numbers —
// Intensity (books per country, drives shading) and Coverage (distinct countries). No DB
// or React here; the same function runs on the server (initial load) and the client (when
// the date range changes). See map-data.ts for the query that produces the entries.

export interface CoverageEntry {
  bookId: string;
  iso3: string;
  /** Finish date; null = undated (counted all-time, excluded from a date range). */
  dateRead: Date | null;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface CoverageResult {
  /** Intensity: distinct books attributable to each country. */
  byCountry: Record<string, number>;
  /** Coverage: number of distinct countries. */
  coverage: number;
  /** Distinct books that contributed. */
  totalBooks: number;
}

function inRange(dateRead: Date | null, range: DateRange): boolean {
  const bounded = range.from !== undefined || range.to !== undefined;
  if (!bounded) return true; // all-time includes undated readings
  if (dateRead === null) return false; // undated is excluded from a bounded range
  if (range.from && dateRead < range.from) return false;
  if (range.to && dateRead > range.to) return false;
  return true;
}

export function computeCoverage(
  entries: CoverageEntry[],
  range: DateRange = {},
): CoverageResult {
  // Dedupe to distinct (book, country): a book counts once per country regardless of
  // how many of its authors share that country.
  const pairs = new Set<string>();
  const books = new Set<string>();
  for (const entry of entries) {
    if (!inRange(entry.dateRead, range)) continue;
    pairs.add(`${entry.bookId}::${entry.iso3}`);
    books.add(entry.bookId);
  }

  const byCountry: Record<string, number> = {};
  for (const pair of pairs) {
    const iso3 = pair.slice(pair.indexOf("::") + 2);
    byCountry[iso3] = (byCountry[iso3] ?? 0) + 1;
  }

  return {
    byCountry,
    coverage: Object.keys(byCountry).length,
    totalBooks: books.size,
  };
}
