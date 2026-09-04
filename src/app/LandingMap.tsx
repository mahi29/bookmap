"use client";

import Choropleth from "./Choropleth";
import MapLegend from "./MapLegend";
import { SAMPLE_BY_COUNTRY, sampleCountryRows } from "./landing-preview";
import styles from "./Landing.module.css";

const coverage = Object.keys(SAMPLE_BY_COUNTRY).length;
const sampleRows = sampleCountryRows();

const SAMPLE_MAP_LABEL =
  "Sample world map. Countries are shaded by how many books an illustrative library has from authors of that nationality, not a real account.";

export default function LandingMap() {
  return (
    <section className={styles.mapPanel} aria-labelledby="sample-map-heading">
      <header className={styles.mapHeader}>
        <div>
          <p className={styles.sampleLabel} id="sample-map-heading">
            A sample map
          </p>
          <p className={styles.mapStats}>
            <span className={styles.big}>{coverage}</span>
            <span className={styles.mapLabel}>countries in this sample</span>
          </p>
        </div>
        <p className={styles.mapCaption} id="sample-map-caption">
          Darker countries have more books from authors of that nationality. Tap
          or hover a country to see its count. The list below is the same data
          in text.
        </p>
      </header>

      <MapLegend />

      <Choropleth
        byCountry={SAMPLE_BY_COUNTRY}
        ariaLabel={SAMPLE_MAP_LABEL}
        describedBy="sample-map-caption"
      />

      <details className={styles.sampleList}>
        <summary>Countries in this sample</summary>
        <ol>
          {sampleRows.map((row) => (
            <li key={row.iso3}>
              {row.name} — {row.count} {row.count === 1 ? "book" : "books"}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
