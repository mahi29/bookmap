import { describe, it, expect } from "vitest";
import {
  booksForCountry,
  computeCoverage,
  type CoverageEntry,
  type DetailEntry,
} from "./coverage-service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// bookId/iso3/dateRead entries — one per (book, author-country).
const entries: CoverageEntry[] = [
  { bookId: "b1", iso3: "USA", dateRead: d("2024-03-01") },
  { bookId: "b1", iso3: "USA", dateRead: d("2024-03-01") }, // co-author, same country → dedupe
  { bookId: "b2", iso3: "USA", dateRead: d("2023-06-01") },
  { bookId: "b3", iso3: "GBR", dateRead: d("2024-07-01") },
  { bookId: "b4", iso3: "FRA", dateRead: null }, // undated
  { bookId: "b5", iso3: "JPN", dateRead: d("2024-01-01") }, // co-authored across countries
  { bookId: "b5", iso3: "USA", dateRead: d("2024-01-01") },
];

describe("computeCoverage (all-time)", () => {
  const result = computeCoverage(entries);

  it("counts distinct (book, country) pairs as intensity", () => {
    expect(result.byCountry).toEqual({ USA: 3, GBR: 1, FRA: 1, JPN: 1 });
  });

  it("counts distinct countries as coverage", () => {
    expect(result.coverage).toBe(4);
  });

  it("counts distinct contributing books", () => {
    expect(result.totalBooks).toBe(5);
  });

  it("counts a co-authored book once per country, not once total", () => {
    // b5 (JPN + USA) contributes to both countries.
    expect(result.byCountry.JPN).toBe(1);
    expect(result.byCountry.USA).toBe(3);
  });
});

describe("computeCoverage (date range)", () => {
  const result = computeCoverage(entries, {
    from: d("2024-01-01"),
    to: d("2024-12-31"),
  });

  it("excludes readings outside the range and undated readings", () => {
    expect(result.byCountry).toEqual({ USA: 2, GBR: 1, JPN: 1 });
    expect(result.coverage).toBe(3);
    expect(result.totalBooks).toBe(3);
  });
});

describe("computeCoverage (exclusive upper bound)", () => {
  it("excludes a reading dated exactly on `to`", () => {
    const onBoundary: CoverageEntry[] = [
      { bookId: "b1", iso3: "USA", dateRead: d("2025-01-01") },
    ];
    const result = computeCoverage(onBoundary, {
      from: d("2024-01-01"),
      to: d("2025-01-01"), // start of next year, as MapView constructs it
    });
    expect(result.byCountry).toEqual({});
  });

  it("includes a reading on the last instant of the final day of the range", () => {
    const lastDay: CoverageEntry[] = [
      { bookId: "b1", iso3: "USA", dateRead: new Date("2024-12-31T23:59:59Z") },
    ];
    const result = computeCoverage(lastDay, {
      from: d("2024-01-01"),
      to: d("2025-01-01"),
    });
    expect(result.byCountry).toEqual({ USA: 1 });
  });
});

describe("computeCoverage (edge cases)", () => {
  it("returns empty coverage for no entries", () => {
    expect(computeCoverage([])).toEqual({
      byCountry: {},
      coverage: 0,
      totalBooks: 0,
    });
  });

  it("includes undated readings in the all-time view", () => {
    expect(computeCoverage(entries).byCountry.FRA).toBe(1);
  });
});

const detail: DetailEntry[] = [
  {
    bookId: "b1",
    iso3: "USA",
    dateRead: d("2024-03-01"),
    title: "Book One",
    author: "Alice",
  },
  {
    bookId: "b1",
    iso3: "USA",
    dateRead: d("2024-03-01"),
    title: "Book One",
    author: "Bob",
  },
  {
    bookId: "b2",
    iso3: "USA",
    dateRead: d("2023-06-01"),
    title: "Book Two",
    author: "Carol",
  },
  {
    bookId: "b3",
    iso3: "USA",
    dateRead: null,
    title: "Book Three",
    author: "Eve",
  },
  {
    bookId: "b4",
    iso3: "GBR",
    dateRead: d("2024-07-01"),
    title: "Book Four",
    author: "Dan",
  },
];

describe("booksForCountry", () => {
  it("lists a country's distinct books, recent-first with undated last", () => {
    const books = booksForCountry(detail, "USA");
    expect(books.map((b) => b.title)).toEqual([
      "Book One",
      "Book Two",
      "Book Three",
    ]);
    expect(books[2].dateRead).toBeNull();
  });

  it("merges co-authors of the same book into one entry", () => {
    const [bookOne] = booksForCountry(detail, "USA");
    expect(bookOne.authors).toEqual(["Alice", "Bob"]);
  });

  it("respects the date range (and drops undated)", () => {
    const books = booksForCountry(detail, "USA", {
      from: d("2024-01-01"),
      to: d("2024-12-31"),
    });
    expect(books.map((b) => b.title)).toEqual(["Book One"]);
  });

  it("returns an empty list for a country with no books", () => {
    expect(booksForCountry(detail, "FRA")).toEqual([]);
  });
});
