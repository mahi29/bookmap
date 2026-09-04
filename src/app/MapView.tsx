"use client";

import { useEffect, useMemo, useState } from "react";
import { countryName } from "@/domains/shared/countries";
import {
  booksForCountry,
  computeCoverage,
  type DetailEntry,
} from "@/domains/coverage/coverage-service";
import {
  listReplayMonths,
  rangeThroughMonth,
  replayStepMs,
} from "@/domains/coverage/replay";
import Choropleth from "./Choropleth";
import CountryPanel from "./CountryPanel";
import ReplayControls, { formatMonthFrame } from "./ReplayControls";
import styles from "./MapView.module.css";

interface Props {
  entries: DetailEntry[];
  needsReviewCount: number;
}

const ALL_TIME = "all";

export default function MapView({ entries, needsReviewCount }: Props) {
  const [period, setPeriod] = useState<string>(ALL_TIME);
  const [selected, setSelected] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  // Years present in the data, newest first, for the period selector.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      if (e.dateRead) set.add(e.dateRead.getUTCFullYear());
    }
    return [...set].sort((a, b) => b - a);
  }, [entries]);

  // Distinct undated entries (no dateRead), hidden from any bounded year view — surfaced
  // as a hint so the count change isn't a mystery when a specific year is selected.
  const undatedCount = useMemo(() => {
    const bookIds = new Set<string>();
    for (const e of entries) {
      if (e.dateRead === null) bookIds.add(e.bookId);
    }
    return bookIds.size;
  }, [entries]);

  const frames = useMemo(() => listReplayMonths(entries), [entries]);
  const canReplay = frames.length >= 2;
  const lastIndex = Math.max(frames.length - 1, 0);
  const clampedIndex = Math.min(frameIndex, lastIndex);
  const frame = frames[clampedIndex];
  const atEnd = frames.length > 0 && clampedIndex >= lastIndex;
  // Derive "is playing" so landing on the last frame flips Pause→Play without
  // a setState-in-effect, and so we never schedule a tick that walks off the end
  // (which would fall back to frames[0] and look like a random restart).
  const isPlaying = playing && !atEnd;
  const stepMs = replayStepMs(frames.length);

  const range = useMemo(() => {
    if (replay && frame) return rangeThroughMonth(frame);
    if (period === ALL_TIME) return {};
    const y = Number(period);
    return {
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y + 1, 0, 1)), // exclusive: start of next year
    };
  }, [period, replay, frame]);

  // Same pure aggregation the server used — re-run in the browser as the period
  // (or replay month) changes.
  const { byCountry, coverage, totalBooks } = useMemo(
    () => computeCoverage(entries, range),
    [entries, range],
  );

  // Lock the shading ramp to the last replay frame so countries only get darker
  // as months advance — a per-frame max would wash early countries back out.
  const shadeMax = useMemo(() => {
    if (!replay || frames.length === 0) return undefined;
    const last = computeCoverage(
      entries,
      rangeThroughMonth(frames[frames.length - 1]),
    );
    return Math.max(1, ...Object.values(last.byCountry));
  }, [replay, entries, frames]);

  const detail = useMemo(
    () =>
      selected
        ? {
            iso3: selected,
            name: countryName(selected) ?? selected,
            books: booksForCountry(entries, selected, range),
          }
        : null,
    [selected, entries, range],
  );

  useEffect(() => {
    // Keep exactly one ticker on `window` so Fast Refresh / Strict Mode remounts
    // cannot leave a stray interval advancing frames in the background.
    const w = window as Window & { __bookmapReplayTick?: number };
    if (w.__bookmapReplayTick != null) {
      window.clearInterval(w.__bookmapReplayTick);
      w.__bookmapReplayTick = undefined;
    }
    if (!isPlaying) return;
    w.__bookmapReplayTick = window.setInterval(() => {
      setFrameIndex((i) => Math.min(i + 1, lastIndex));
    }, stepMs);
    return () => {
      if (w.__bookmapReplayTick != null) {
        window.clearInterval(w.__bookmapReplayTick);
        w.__bookmapReplayTick = undefined;
      }
    };
  }, [isPlaying, stepMs, lastIndex]);

  function startReplay() {
    setSelected(null);
    setFrameIndex(0);
    setReplay(true);
    setPlaying(true);
  }

  function exitReplay() {
    setPlaying(false);
    setReplay(false);
  }

  function togglePlay() {
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (atEnd) setFrameIndex(0);
    setPlaying(true);
  }

  function selectCountry(iso3: string) {
    if (isPlaying) setPlaying(false);
    setSelected((cur) => (cur === iso3 ? null : iso3));
  }

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.statsGroup}>
          <div className={styles.stats}>
            <span className={styles.big}>{coverage}</span>
            <span className={styles.label}>countries · {totalBooks} books</span>
          </div>
          {replay && frame ? (
            <span className={styles.hint} aria-live="polite">
              as of {formatMonthFrame(frame)}
            </span>
          ) : needsReviewCount > 0 ? (
            <span className={styles.hint}>
              {needsReviewCount} author{needsReviewCount === 1 ? "" : "s"} need
              {needsReviewCount === 1 ? "s" : ""} a country
            </span>
          ) : null}
        </div>
        <div className={styles.filterGroup}>
          {replay && frame ? (
            <ReplayControls
              playing={isPlaying}
              frame={frame}
              frameIndex={clampedIndex}
              frameCount={frames.length}
              stepMs={stepMs}
              onTogglePlay={togglePlay}
              onScrub={(index) => {
                setPlaying(false);
                setFrameIndex(index);
              }}
              onExit={exitReplay}
            />
          ) : (
            <>
              <div className={styles.filterRow}>
                <label className={styles.filter}>
                  <span className={styles.filterLabel}>Period</span>
                  <select
                    className={styles.select}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value={ALL_TIME}>All time</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                {canReplay && (
                  <button
                    type="button"
                    className={styles.replayStart}
                    onClick={startReplay}
                  >
                    Replay
                  </button>
                )}
              </div>
              {period !== ALL_TIME && undatedCount > 0 && (
                <span className={styles.hint}>
                  +{undatedCount} undated book{undatedCount === 1 ? "" : "s"}{" "}
                  not shown
                </span>
              )}
            </>
          )}
        </div>
      </header>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>Fewer</span>
        <span className={styles.legendBar} aria-hidden="true" />
        <span className={styles.legendLabel}>More books</span>
      </div>

      <Choropleth
        byCountry={byCountry}
        selectedIso3={selected}
        shadeMax={shadeMax}
        onSelect={selectCountry}
      />

      <CountryPanel country={detail} onClose={() => setSelected(null)} />
    </section>
  );
}
