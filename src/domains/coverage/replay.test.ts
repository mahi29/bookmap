import { describe, it, expect } from "vitest";
import { computeCoverage, type CoverageEntry } from "./coverage-service";
import {
  listReplayMonths,
  rangeThroughMonth,
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

describe("replayStepMs", () => {
  it("slows short replays and caps long ones around 16 seconds", () => {
    expect(replayStepMs(2)).toBe(900); // 2 × 900ms = 1.8s, not a blink
    expect(replayStepMs(12)).toBe(900); // a year of months: ~11s
    expect(replayStepMs(20)).toBe(800); // 16s / 20
    expect(replayStepMs(50)).toBe(450); // floor so a long library still moves
  });

  it("treats a single frame as a short pause, not zero", () => {
    expect(replayStepMs(1)).toBe(900);
    expect(replayStepMs(0)).toBe(900);
  });
});
