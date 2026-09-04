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

/**
 * Cumulative range: every dated reading strictly before the start of the month
 * after `frame`. Undated readings are excluded (the range is bounded).
 */
export function rangeThroughMonth(frame: MonthFrame): DateRange {
  return { to: new Date(Date.UTC(frame.year, frame.month + 1, 1)) };
}

const TARGET_MS = 14_000;
const MIN_MS = 200;
const MAX_MS = 750;

/** Per-frame delay so short replays aren't a blink and long ones finish ~14s. */
export function replayStepMs(frameCount: number): number {
  if (frameCount <= 1) return MAX_MS;
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, TARGET_MS / frameCount)));
}
