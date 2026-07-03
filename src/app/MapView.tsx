"use client";

import { useMemo, useState } from "react";
import type { CountryShape } from "@/lib/geo";
import { computeCoverage, type CoverageEntry } from "@/lib/coverage";
import Choropleth from "./Choropleth";
import styles from "./MapView.module.css";

interface Props {
  shapes: CountryShape[];
  entries: CoverageEntry[];
}

const ALL_TIME = "all";

export default function MapView({ shapes, entries }: Props) {
  const [period, setPeriod] = useState<string>(ALL_TIME);

  // Years present in the data, newest first, for the period selector.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      if (e.dateRead) set.add(e.dateRead.getUTCFullYear());
    }
    return [...set].sort((a, b) => b - a);
  }, [entries]);

  const range = useMemo(() => {
    if (period === ALL_TIME) return {};
    const y = Number(period);
    return {
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y, 11, 31, 23, 59, 59)),
    };
  }, [period]);

  // Same pure aggregation the server used — re-run in the browser as the period changes.
  const { byCountry, coverage, totalBooks } = useMemo(
    () => computeCoverage(entries, range),
    [entries, range],
  );

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.stats}>
          <span className={styles.big}>{coverage}</span>
          <span className={styles.label}>countries · {totalBooks} books</span>
        </div>
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
      </header>
      <Choropleth shapes={shapes} byCountry={byCountry} />
    </section>
  );
}
