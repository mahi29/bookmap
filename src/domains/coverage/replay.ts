// Replay helpers: turn dated coverage entries into a month-by-month cursor so the
// map can play a cumulative timelapse. Empty calendar months are skipped — the
// date label jumping is how gaps show up, so a sparse library doesn't stall on
// a frozen map. No DB or React here.

import type { CoverageEntry, DateRange } from "./coverage-service";

export interface MonthFrame {
  /** UTC calendar year. */
  year: number;
  /** UTC month, 0–11. */
  month: number;
}

/**
 * Unique UTC months that contain at least one dated reading, earliest first.
 * Undated readings have no place on the timeline and are omitted.
 */
export function listReplayMonths(entries: CoverageEntry[]): MonthFrame[] {
  const seen = new Set<number>();
  for (const entry of entries) {
    if (!entry.dateRead) continue;
    const t = entry.dateRead.getTime();
    if (Number.isNaN(t)) continue;
    seen.add(
      entry.dateRead.getUTCFullYear() * 12 + entry.dateRead.getUTCMonth(),
    );
  }

  return [...seen]
    .sort((a, b) => a - b)
    .map((key) => ({ year: Math.floor(key / 12), month: key % 12 }));
}

/** Milliseconds between the earliest and latest dated reading, or 0. */
export function readingSpanMs(entries: CoverageEntry[]): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (!entry.dateRead) continue;
    const t = entry.dateRead.getTime();
    if (Number.isNaN(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min) || max <= min) return 0;
  return max - min;
}

/**
 * Cumulative range: every dated reading strictly before the start of the month
 * after `frame`. Undated readings are excluded (the range is bounded).
 */
export function rangeThroughMonth(frame: MonthFrame): DateRange {
  return { to: new Date(Date.UTC(frame.year, frame.month + 1, 1)) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_SPAN_MS = 90 * DAY_MS;
const LONG_SPAN_MS = 3 * 365 * DAY_MS;
/** Slow end: each month holds at least this long when the library is young. */
const MIN_STEP_MS = 2_000;
/** Fast end: a long library still finishes in about this wall-clock time. */
const MAX_TOTAL_MS = 12_000;
const FLOOR_STEP_MS = 120;

function spanT(spanMs: number): number {
  const span = Math.max(0, spanMs);
  if (span <= SHORT_SPAN_MS) return 0;
  if (span >= LONG_SPAN_MS) return 1;
  return (span - SHORT_SPAN_MS) / (LONG_SPAN_MS - SHORT_SPAN_MS);
}

/**
 * Per-frame delay from the calendar span between first and last dated reading.
 * Short span: 2s per month so two or three months aren't a blink. Long span:
 * the whole replay is capped at ~12s, so a decade moves faster per month.
 */
export function replayStepMs(frameCount: number, spanMs: number): number {
  const n = Math.max(frameCount, 1);
  const slowStep = MIN_STEP_MS;
  const fastStep = Math.max(
    FLOOR_STEP_MS,
    Math.min(MIN_STEP_MS, MAX_TOTAL_MS / n),
  );
  return Math.round(slowStep + spanT(spanMs) * (fastStep - slowStep));
}
