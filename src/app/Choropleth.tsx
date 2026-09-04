"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  selectedIso3?: string | null;
  onSelect?: (iso3: string) => void;
  ariaLabel?: string;
  describedBy?: string;
  /** When set, the shading ramp uses this as max intensity so replay frames
   *  only get darker, never wash out as the running max grows. */
  shadeMax?: number;
}

interface Hover {
  iso3: string | null;
  name: string;
  count: number;
  x: number;
  y: number;
}

function tooltipFromEvent(
  wrap: HTMLDivElement | null,
  e: { clientX: number; clientY: number },
  shape: { iso3: string | null; name: string },
  count: number,
): Hover | null {
  const rect = wrap?.getBoundingClientRect();
  if (!rect) return null;
  return {
    iso3: shape.iso3,
    name: shape.name,
    count,
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
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
  selectedIso3 = null,
  onSelect,
  ariaLabel = "World map shaded by number of books read per country",
  describedBy,
  shadeMax,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState<Hover | null>(null);

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

  const max = useMemo(() => {
    const dataMax = Math.max(0, ...Object.values(byCountry));
    return Math.max(1, shadeMax ?? dataMax);
  }, [byCountry, shadeMax]);

  const tooltip = hover ?? pinned;

  useEffect(() => {
    if (!pinned) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.map}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
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
              className={`${styles.country} ${selected ? styles.selected : ""} ${styles.interactive}`}
              style={{ fill: fillFor(count, max) }}
              onClick={(e) => {
                if (onSelect) {
                  if (shape.iso3) onSelect(shape.iso3);
                  return;
                }
                const next = tooltipFromEvent(wrapRef.current, e, shape, count);
                if (!next) return;
                setPinned((cur) => (cur?.iso3 === next.iso3 ? null : next));
              }}
              onMouseMove={(e) => {
                const next = tooltipFromEvent(wrapRef.current, e, shape, count);
                if (next) setHover(next);
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden="true"
        >
          <strong>{tooltip.name}</strong>{" "}
          <span className={styles.count}>
            {tooltip.count} {tooltip.count === 1 ? "book" : "books"}
          </span>
        </div>
      )}
    </div>
  );
}
