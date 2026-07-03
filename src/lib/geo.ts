import type { Feature, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import { feature } from "topojson-client";
import countries from "world-countries";
import topologyJson from "world-atlas/countries-110m.json";

// Geometry join: world-atlas country shapes are keyed by ISO 3166-1 numeric ids; our
// coverage data is keyed by alpha-3. world-countries carries both (ccn3 + cca3), so we
// bridge the two here. Pure/serializable — shapes are computed on the server and handed
// to the client map.

const NUMERIC_TO_ALPHA3 = new Map<string, string>();
for (const c of countries) {
  if (c.ccn3) NUMERIC_TO_ALPHA3.set(c.ccn3, c.cca3);
}

export interface CountryShape {
  iso3: string | null;
  name: string;
  geometry: Geometry;
}

export function alpha3ForNumeric(numeric: string): string | null {
  return NUMERIC_TO_ALPHA3.get(numeric) ?? null;
}

/** All country shapes from world-atlas, tagged with their map country (alpha-3). */
export function getCountryShapes(): CountryShape[] {
  const topology = topologyJson as Topology;
  const collection = feature(topology, topology.objects.countries);
  const features = (collection as unknown as { features: Feature[] }).features;

  return features.map((f) => ({
    iso3: f.id != null ? alpha3ForNumeric(String(f.id)) : null,
    name: (f.properties?.name as string | undefined) ?? "",
    geometry: f.geometry,
  }));
}
