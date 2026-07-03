import { countryName, resolveToMapCountry } from "../countries";

// Pure tiebreak: given the citizenship claims scraped from a structured source
// (Wikidata P27), collapse them down to a single modern map country, or flag the
// author for review. No network here — see wikidata.ts for the I/O.

export type CitizenshipRank = "preferred" | "normal" | "deprecated";

export interface RawCitizenship {
  /** Country label from the source, e.g. "United States of America". */
  label: string;
  /** ISO 3166-1 alpha-3 from the source (Wikidata P298), if present. */
  isoAlpha3: string | null;
  rank: CitizenshipRank;
}

export type ResolutionMethod =
  "wikidata" | "openlibrary" | "llm" | "manual" | "unresolved";

export interface ResolutionResult {
  iso3: string | null;
  method: ResolutionMethod;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
}

function unresolved(reasoning: string): ResolutionResult {
  return {
    iso3: null,
    method: "unresolved",
    confidence: 0,
    reasoning,
    needsReview: true,
  };
}

/**
 * Choose one map country from a source's citizenship claims.
 *
 * Tiebreak: drop deprecated ranks; if any citizenship is preferred-rank, only those
 * count; map each to a modern country and — if they collapse to exactly one — resolve
 * it. Zero mappable countries is unresolved; more than one distinct country is genuinely
 * ambiguous and handed to the review queue (later, the LLM).
 */
export function chooseMapCountry(
  citizenships: RawCitizenship[],
  source: ResolutionMethod = "wikidata",
): ResolutionResult {
  const active = citizenships.filter((c) => c.rank !== "deprecated");
  if (active.length === 0) {
    return unresolved("No citizenship data found");
  }

  const preferred = active.filter((c) => c.rank === "preferred");
  const group = preferred.length > 0 ? preferred : active;

  const iso3s = new Set<string>();
  for (const c of group) {
    const iso = resolveToMapCountry(c.isoAlpha3 ?? c.label);
    if (iso) iso3s.add(iso);
  }

  if (iso3s.size === 1) {
    const [iso3] = [...iso3s];
    return {
      iso3,
      method: source,
      confidence: preferred.length > 0 ? 0.95 : 0.85,
      needsReview: false,
      reasoning: `Country of citizenship: ${countryName(iso3) ?? iso3}`,
    };
  }

  if (iso3s.size === 0) {
    return unresolved(
      `Could not map citizenship(s): ${group.map((g) => g.label).join(", ")}`,
    );
  }

  return {
    iso3: null,
    method: source,
    confidence: 0.3,
    needsReview: true,
    reasoning: `Multiple citizenships (${[...iso3s].join(", ")}); needs review`,
  };
}
