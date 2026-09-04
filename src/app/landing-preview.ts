import { countryName } from "@/domains/shared/countries";

// Illustrative intensity for the public landing choropleth — not anyone's real
// readings. Counts are "books from authors of that nationality" so the heatmap
// has a visible spread: a few well-read countries, a long tail of ones and twos.

export const SAMPLE_BY_COUNTRY: Record<string, number> = {
  USA: 48,
  GBR: 22,
  FRA: 14,
  JPN: 11,
  DEU: 9,
  IND: 8,
  NGA: 7,
  RUS: 6,
  ITA: 6,
  ESP: 5,
  BRA: 5,
  CAN: 5,
  IRL: 4,
  AUS: 4,
  CHN: 4,
  KOR: 4,
  MEX: 3,
  ARG: 3,
  COL: 3,
  CHL: 3,
  ZAF: 3,
  EGY: 3,
  TUR: 3,
  POL: 3,
  SWE: 3,
  NOR: 2,
  DNK: 2,
  NLD: 2,
  PRT: 2,
  GRC: 2,
  IRN: 2,
  PAK: 2,
  BGD: 2,
  VNM: 2,
  THA: 2,
  IDN: 2,
  NZL: 2,
  KEN: 2,
  GHA: 2,
  ETH: 2,
  MAR: 2,
  PER: 2,
  CUB: 2,
  JAM: 1,
  HTI: 1,
  SEN: 1,
  ZWE: 1,
  UGA: 1,
  LBN: 1,
  ISR: 1,
  SAU: 1,
  AFG: 1,
  LKA: 1,
  PHL: 1,
  TWN: 1,
  FIN: 1,
  CZE: 1,
  HUN: 1,
  ROU: 1,
  UKR: 1,
  ISL: 1,
};

export interface SampleCountryRow {
  iso3: string;
  name: string;
  count: number;
}

/** Sample countries, darkest first — the text alternative to the landing choropleth. */
export function sampleCountryRows(): SampleCountryRow[] {
  return Object.entries(SAMPLE_BY_COUNTRY)
    .map(([iso3, count]) => ({
      iso3,
      name: countryName(iso3) ?? iso3,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
