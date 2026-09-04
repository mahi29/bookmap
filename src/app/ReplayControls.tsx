"use client";

import type { MonthFrame } from "@/domains/coverage/replay";
import styles from "./MapView.module.css";

interface Props {
  playing: boolean;
  frame: MonthFrame;
  frameIndex: number;
  frameCount: number;
  onTogglePlay: () => void;
  onScrub: (index: number) => void;
  onExit: () => void;
}

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMonthFrame(frame: MonthFrame): string {
  return monthFormatter.format(new Date(Date.UTC(frame.year, frame.month, 1)));
}

export default function ReplayControls({
  playing,
  frame,
  frameIndex,
  frameCount,
  onTogglePlay,
  onScrub,
  onExit,
}: Props) {
  const label = formatMonthFrame(frame);
  const playLabel = playing ? "Pause" : "Play";

  return (
    <div className={styles.replay}>
      <div className={styles.replayButtons}>
        <button
          type="button"
          className={styles.replayPlay}
          onClick={onTogglePlay}
          aria-label={`${playLabel} map replay`}
          aria-pressed={playing}
        >
          {playLabel}
        </button>
        <button type="button" className={styles.replayExit} onClick={onExit}>
          Exit
        </button>
      </div>
      <label className={styles.scrubberLabel}>
        <span className={styles.monthLabel}>{label}</span>
        <input
          className={styles.scrubber}
          type="range"
          min={0}
          max={frameCount - 1}
          step={1}
          value={frameIndex}
          aria-valuetext={label}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
