import { ResolutionMethod } from "../shared/constants";
import { countryName, resolveToMapCountry } from "../shared/countries";

export type { ResolutionMethod };

// Pure mapping: given the citizenship claims scraped from a structured source (Wikidata
// P27), map them to the set of modern map countries an author belongs to. Authors can
// hold several citizenships and we keep them all — no single-country tiebreak. An author
// is only flagged for review when nothing maps. No network here — see wikidata.ts.

export type CitizenshipRank = "preferred" | "normal" | "deprecated";

export interface RawCitizenship {
  /** Country label from the source, e.g. "United States of America". */
  label: string;
  /** ISO 3166-1 alpha-3 from the source (Wikidata P298), if present. */
  isoAlpha3: string | null;
  rank: CitizenshipRank;
}

export interface ResolutionResult {
  /** Every modern map country the author belongs to (may be empty). */
  iso3s: string[];
  method: ResolutionMethod;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
}

function unresolved(reasoning: string): ResolutionResult {
  return {
    iso3s: [],
    method: ResolutionMethod.Unresolved,
    confidence: 0,
    reasoning,
    needsReview: true,
  };
}

/** Map a source's citizenship claims to the set of modern map countries. */
export function chooseMapCountry(
  citizenships: RawCitizenship[],
  source: ResolutionMethod = ResolutionMethod.Wikidata,
): ResolutionResult {
  const active = citizenships.filter((c) => c.rank !== "deprecated");

  const iso3s = [
    ...new Set(
      active
        .map((c) => resolveToMapCountry(c.isoAlpha3 ?? c.label))
        .filter((iso): iso is string => iso !== null),
    ),
  ];

  if (iso3s.length === 0) {
    return unresolved(
      active.length > 0
        ? `Could not map citizenship(s): ${active.map((c) => c.label).join(", ")}`
        : "No citizenship data found",
    );
  }

  return {
    iso3s,
    method: source,
    confidence: 0.9,
    needsReview: false,
    reasoning: `Countries of citizenship: ${iso3s.map((c) => countryName(c) ?? c).join(", ")}`,
  };
}
