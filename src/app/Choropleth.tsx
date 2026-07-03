"use client";

import { useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import type { CountryShape } from "@/lib/geo";
import styles from "./Choropleth.module.css";

const WIDTH = 960;
const HEIGHT = 480;

interface Props {
  shapes: CountryShape[];
  byCountry: Record<string, number>;
}

interface Hover {
  name: string;
  count: number;
  x: number;
  y: number;
}

// Shade from the empty-country color toward the accent. sqrt compresses the scale so a
// single dominant country (e.g. USA) doesn't wash everything else out to near-empty.
function fillFor(count: number, max: number): string {
  if (!count) return "var(--map-empty)";
  const t = Math.sqrt(count) / Math.sqrt(max);
  const pct = Math.round(15 + 70 * t);
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--map-empty))`;
}

export default function Choropleth({ shapes, byCountry }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const pathGen = useMemo(() => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: shapes.map((s) => ({
        type: "Feature",
        geometry: s.geometry,
        properties: {},
      })),
    };
    const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], collection);
    return geoPath(projection);
  }, [shapes]);

  const max = useMemo(
    () => Math.max(1, ...Object.values(byCountry)),
    [byCountry],
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.map}
        role="img"
        aria-label="World map shaded by number of books read per country"
      >
        {shapes.map((shape, i) => {
          const d = pathGen(shape.geometry);
          if (!d) return null;
          const count = shape.iso3 ? (byCountry[shape.iso3] ?? 0) : 0;
          return (
            <path
              key={shape.iso3 ?? `shape-${i}`}
              d={d}
              className={styles.country}
              style={{ fill: fillFor(count, max) }}
              onMouseMove={(e) => {
                const rect = wrapRef.current?.getBoundingClientRect();
                if (!rect) return;
                setHover({
                  name: shape.name,
                  count,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover && (
        <div className={styles.tooltip} style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.name}</strong>{" "}
          <span className={styles.count}>
            {hover.count} {hover.count === 1 ? "book" : "books"}
          </span>
        </div>
      )}
    </div>
  );
}
