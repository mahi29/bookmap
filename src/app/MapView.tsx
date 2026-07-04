"use client";

import { useMemo, useState } from "react";
import { countryName } from "@/domains/shared/countries";
import {
  booksForCountry,
  computeCoverage,
  type DetailEntry,
} from "@/domains/coverage/coverage-service";
import Choropleth from "./Choropleth";
import CountryPanel from "./CountryPanel";
import styles from "./MapView.module.css";

interface Props {
  entries: DetailEntry[];
  needsReviewCount: number;
}

const ALL_TIME = "all";

export default function MapView({ entries, needsReviewCount }: Props) {
  const [period, setPeriod] = useState<string>(ALL_TIME);
  const [selected, setSelected] = useState<string | null>(null);

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

  const range = useMemo(() => {
    if (period === ALL_TIME) return {};
    const y = Number(period);
    return {
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y + 1, 0, 1)), // exclusive: start of next year
    };
  }, [period]);

  // Same pure aggregation the server used — re-run in the browser as the period changes.
  const { byCountry, coverage, totalBooks } = useMemo(
    () => computeCoverage(entries, range),
    [entries, range],
  );

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

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.statsGroup}>
          <div className={styles.stats}>
            <span className={styles.big}>{coverage}</span>
            <span className={styles.label}>countries · {totalBooks} books</span>
          </div>
          {needsReviewCount > 0 && (
            <span className={styles.hint}>
              {needsReviewCount} author{needsReviewCount === 1 ? "" : "s"} need
              {needsReviewCount === 1 ? "s" : ""} a country
            </span>
          )}
        </div>
        <div className={styles.filterGroup}>
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
          {period !== ALL_TIME && undatedCount > 0 && (
            <span className={styles.hint}>
              +{undatedCount} undated book{undatedCount === 1 ? "" : "s"} not
              shown
            </span>
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
        onSelect={(iso3) => setSelected((cur) => (cur === iso3 ? null : iso3))}
      />

      <CountryPanel country={detail} onClose={() => setSelected(null)} />
    </section>
  );
}
