import countries from "world-countries";

// Domain module: normalizes any country reference (modern code, modern name, or a
// historical/defunct country) down to a single modern ISO 3166-1 alpha-3 "map country".
// Pure and framework-free — the map only ever renders modern borders.

const CODE_TO_NAME = new Map<string, string>();
const NAME_TO_CODE = new Map<string, string>();

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

for (const country of countries) {
  const code = country.cca3;
  CODE_TO_NAME.set(code, country.name.common);
  NAME_TO_CODE.set(normalize(country.name.common), code);
  NAME_TO_CODE.set(normalize(country.name.official), code);
}

// Modern-name aliases whose common label differs from what sources sometimes emit.
const NAME_ALIASES: Record<string, string> = {
  USA: "USA",
  US: "USA",
  "UNITED STATES OF AMERICA": "USA",
  UK: "GBR",
  "GREAT BRITAIN": "GBR",
  ENGLAND: "GBR",
  SCOTLAND: "GBR",
  WALES: "GBR",
  "NORTHERN IRELAND": "GBR",
  "SOUTH KOREA": "KOR",
  "NORTH KOREA": "PRK",
};

// Defunct/historical countries → a single modern successor. These are pragmatic defaults
// (the dominant successor state); any specific case can be corrected in the review queue.
const HISTORICAL_SUCCESSORS: Record<string, string> = {
  "SOVIET UNION": "RUS",
  USSR: "RUS",
  SUN: "RUS",
  "RUSSIAN EMPIRE": "RUS",
  "OTTOMAN EMPIRE": "TUR",
  CZECHOSLOVAKIA: "CZE",
  CSK: "CZE",
  YUGOSLAVIA: "SRB",
  YUG: "SRB",
  "AUSTRIA-HUNGARY": "AUT",
  "EAST GERMANY": "DEU",
  "WEST GERMANY": "DEU",
  DDR: "DEU",
  PRUSSIA: "DEU",
  BURMA: "MMR",
  PERSIA: "IRN",
  SIAM: "THA",
  CEYLON: "LKA",
  ZAIRE: "COD",
  RHODESIA: "ZWE",
  ABYSSINIA: "ETH",
  "BRITISH RAJ": "IND",
};

/** True if `code` is a valid modern ISO 3166-1 alpha-3 country code. */
export function isValidMapCountry(code: string): boolean {
  return CODE_TO_NAME.has(code.toUpperCase());
}

/** Common English name for a valid map country code, or undefined. */
export function countryName(code: string): string | undefined {
  return CODE_TO_NAME.get(code.toUpperCase());
}

/**
 * Resolve any country reference — a modern alpha-3 code, a modern country name, or a
 * historical/defunct country — to a single modern map country (ISO alpha-3), or null.
 */
export function resolveToMapCountry(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (CODE_TO_NAME.has(upper)) return upper;

  const norm = normalize(trimmed);
  return (
    NAME_ALIASES[norm] ??
    HISTORICAL_SUCCESSORS[norm] ??
    NAME_TO_CODE.get(norm) ??
    null
  );
}

/** All modern map countries, sorted by name — for the review-queue dropdown. */
export function allMapCountries(): { iso3: string; name: string }[] {
  return [...CODE_TO_NAME.entries()]
    .map(([iso3, name]) => ({ iso3, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
