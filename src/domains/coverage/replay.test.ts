import { describe, it, expect } from "vitest";
import { computeCoverage, type CoverageEntry } from "./coverage-service";
import {
  listReplayMonths,
  rangeThroughMonth,
  readingSpanMs,
  replayStepMs,
} from "./replay";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const entries: CoverageEntry[] = [
  { bookId: "b1", iso3: "USA", dateRead: d("2024-03-15") },
  { bookId: "b1", iso3: "USA", dateRead: d("2024-03-15") }, // same month, same book
  { bookId: "b2", iso3: "USA", dateRead: d("2023-06-01") },
  { bookId: "b3", iso3: "GBR", dateRead: d("2024-07-01") },
  { bookId: "b4", iso3: "FRA", dateRead: null }, // undated — never a replay frame
  { bookId: "b5", iso3: "JPN", dateRead: d("2024-01-01") },
  { bookId: "b5", iso3: "USA", dateRead: d("2024-01-01") },
];

describe("listReplayMonths", () => {
  it("returns unique UTC months that have at least one dated reading, sorted", () => {
    expect(listReplayMonths(entries)).toEqual([
      { year: 2023, month: 5 }, // June
      { year: 2024, month: 0 }, // January
      { year: 2024, month: 2 }, // March
      { year: 2024, month: 6 }, // July
    ]);
  });

  it("ignores undated readings and empty input", () => {
    expect(
      listReplayMonths([{ bookId: "b", iso3: "FRA", dateRead: null }]),
    ).toEqual([]);
    expect(listReplayMonths([])).toEqual([]);
  });

  it("collapses several readings in the same month into one frame", () => {
    const sameMonth: CoverageEntry[] = [
      { bookId: "a", iso3: "USA", dateRead: d("2024-03-01") },
      { bookId: "b", iso3: "GBR", dateRead: d("2024-03-31") },
    ];
    expect(listReplayMonths(sameMonth)).toEqual([{ year: 2024, month: 2 }]);
  });

  it("includes December and the following January as separate frames", () => {
    const yearEnd: CoverageEntry[] = [
      { bookId: "a", iso3: "USA", dateRead: d("2023-12-20") },
      { bookId: "b", iso3: "GBR", dateRead: d("2024-01-02") },
    ];
    expect(listReplayMonths(yearEnd)).toEqual([
      { year: 2023, month: 11 },
      { year: 2024, month: 0 },
    ]);
  });
});

describe("rangeThroughMonth + computeCoverage (cumulative replay)", () => {
  it("includes every dated reading through the end of the frame month", () => {
    const frames = listReplayMonths(entries);
    const june = computeCoverage(entries, rangeThroughMonth(frames[0]));
    expect(june.byCountry).toEqual({ USA: 1 });
    expect(june.coverage).toBe(1);
    expect(june.totalBooks).toBe(1);

    const january = computeCoverage(entries, rangeThroughMonth(frames[1]));
    expect(january.byCountry).toEqual({ USA: 2, JPN: 1 });
    expect(january.totalBooks).toBe(2);

    const july = computeCoverage(
      entries,
      rangeThroughMonth(frames[frames.length - 1]),
    );
    expect(july.byCountry).toEqual({ USA: 3, JPN: 1, GBR: 1 });
    expect(july.coverage).toBe(3);
    expect(july.totalBooks).toBe(4); // undated FRA book excluded
  });

  it("excludes a reading dated on the first of the next month", () => {
    const onBoundary: CoverageEntry[] = [
      { bookId: "b1", iso3: "USA", dateRead: d("2024-04-01") },
    ];
    const march = computeCoverage(
      onBoundary,
      rangeThroughMonth({ year: 2024, month: 2 }),
    );
    expect(march.byCountry).toEqual({});
  });

  it("includes a reading on the last day of the frame month", () => {
    const lastDay: CoverageEntry[] = [
      { bookId: "b1", iso3: "USA", dateRead: d("2024-03-31") },
    ];
    const march = computeCoverage(
      lastDay,
      rangeThroughMonth({ year: 2024, month: 2 }),
    );
    expect(march.byCountry).toEqual({ USA: 1 });
  });
});

describe("readingSpanMs", () => {
  it("is the time between the earliest and latest dated reading", () => {
    expect(readingSpanMs(entries)).toBe(
      d("2024-07-01").getTime() - d("2023-06-01").getTime(),
    );
  });

  it("ignores undated readings and is 0 when there are not two dated readings", () => {
    expect(readingSpanMs([])).toBe(0);
    expect(
      readingSpanMs([{ bookId: "b", iso3: "FRA", dateRead: null }]),
    ).toBe(0);
    expect(
      readingSpanMs([{ bookId: "b", iso3: "USA", dateRead: d("2024-03-01") }]),
    ).toBe(0);
  });
});

describe("replayStepMs", () => {
  const day = 24 * 60 * 60 * 1000;
  const year = 365 * day;

  it("holds each month at least two seconds when the first-to-last span is short", () => {
    const twoMonths = 60 * day;
    const shortTwoFrames = replayStepMs(2, twoMonths);
    const shortThreeFrames = replayStepMs(3, twoMonths);
    expect(shortTwoFrames).toBe(2_000);
    expect(shortThreeFrames).toBe(2_000);
    expect(shortTwoFrames * 2).toBe(4_000);
  });

  it("plays faster per month when the span is long", () => {
    const decade = 10 * year;
    const longManyFrames = replayStepMs(40, decade);
    const shortManyFrames = replayStepMs(40, 60 * day);
    expect(longManyFrames).toBeLessThan(shortManyFrames);
    expect(longManyFrames * 40).toBeLessThanOrEqual(12_000);
  });

  it("is still slower overall for a short library than a long one with many months", () => {
    const short = replayStepMs(3, 90 * day);
    const long = replayStepMs(24, 3 * year);
    expect(short).toBeGreaterThan(long);
  });

  it("treats a single frame as a two-second linger, not zero", () => {
    expect(replayStepMs(1, 0)).toBe(2_000);
    expect(replayStepMs(0, 0)).toBe(2_000);
  });
});
