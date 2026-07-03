import { describe, it, expect } from "vitest";
import { computeCoverage, type CoverageEntry } from "./coverage";

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
