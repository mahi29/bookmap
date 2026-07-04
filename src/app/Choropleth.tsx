"use client";

import { useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { getCountryShapes } from "@/domains/coverage/geo";
import styles from "./Choropleth.module.css";

const WIDTH = 960;
const HEIGHT = 480;

// Shading ramp: a country with 1 book gets MIN_SHADE_PCT of the accent; the most-read
// country gets MAX_SHADE_PCT. Kept off 0/100 so the lightest shade still reads as "read"
// and the darkest still shows its border.
const MIN_SHADE_PCT = 15;
const MAX_SHADE_PCT = 85;

interface Props {
  byCountry: Record<string, number>;
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
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
  const pct = Math.round(MIN_SHADE_PCT + (MAX_SHADE_PCT - MIN_SHADE_PCT) * t);
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--map-empty))`;
}

export default function Choropleth({
  byCountry,
  selectedIso3,
  onSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Loaded client-side (not passed from the server) so the static geometry ships as part
  // of the cacheable client JS bundle instead of being re-serialized into the RSC payload
  // on every request.
  const shapes = useMemo(() => getCountryShapes(), []);

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
          const selected = shape.iso3 != null && shape.iso3 === selectedIso3;
          return (
            <path
              key={shape.iso3 ?? `shape-${i}`}
              d={d}
              className={`${styles.country} ${selected ? styles.selected : ""}`}
              style={{ fill: fillFor(count, max) }}
              onClick={() => shape.iso3 && onSelect(shape.iso3)}
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
