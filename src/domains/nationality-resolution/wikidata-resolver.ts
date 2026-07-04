import { ResolutionMethod } from "../shared/constants";
import {
  chooseMapCountry,
  unresolved,
  type CitizenshipRank,
  type RawCitizenship,
  type ResolutionResult,
} from "./resolve-country";

// I/O layer: look an author up on Wikidata and read their country-of-citizenship (P27)
// claims. The JSON-shaping helpers are pure and unit-tested; only fetchJson touches the
// network. See resolve.ts for the (pure) tiebreak that turns claims into a map country.

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "BookMap/0.1 (https://github.com/mahi29/bookmap; personal reading tracker)";

const INSTANCE_OF = "P31";
const HUMAN = "Q5";
const CITIZENSHIP = "P27";
const ISO_ALPHA3 = "P298";

// Minimal shapes for the bits of the Wikidata JSON we read.
interface Snak {
  snaktype?: string;
  datavalue?: { value?: { id?: string } | string };
}
interface Statement {
  mainsnak?: Snak;
  rank?: string;
}
export interface WikidataEntity {
  id?: string;
  labels?: { en?: { value?: string } };
  claims?: Record<string, Statement[]>;
}
interface SearchHit {
  id: string;
  label?: string;
  description?: string;
}

export interface AuthorResolution extends ResolutionResult {
  wikidataId: string | null;
}

/** Pure: extract whether an entity is a human and its citizenship (country QID + rank). */
export function parseHumanCitizenships(entity: WikidataEntity): {
  isHuman: boolean;
  citizenships: { qid: string; rank: CitizenshipRank }[];
} {
  const claims = entity.claims ?? {};
  const isHuman = (claims[INSTANCE_OF] ?? []).some((s) => {
    const value = s.mainsnak?.datavalue?.value;
    return typeof value === "object" && value?.id === HUMAN;
  });

  const citizenships = (claims[CITIZENSHIP] ?? [])
    .filter((s) => s.mainsnak?.snaktype === "value")
    .map((s) => {
      const value = s.mainsnak?.datavalue?.value;
      const qid = typeof value === "object" ? value?.id : undefined;
      return qid
        ? { qid, rank: (s.rank ?? "normal") as CitizenshipRank }
        : null;
    })
    .filter((c): c is { qid: string; rank: CitizenshipRank } => c !== null);

  return { isHuman, citizenships };
}

/** Pure: extract a country's English label and ISO alpha-3 (P298) from its entity. */
export function parseCountryAlpha3(entity: WikidataEntity): {
  label: string;
  alpha3: string | null;
} {
  const label = entity.labels?.en?.value ?? entity.id ?? "";
  const statement = (entity.claims?.[ISO_ALPHA3] ?? []).find(
    (s) => typeof s.mainsnak?.datavalue?.value === "string",
  );
  const value = statement?.mainsnak?.datavalue?.value;
  return { label, alpha3: typeof value === "string" ? value : null };
}

type FetchFn = typeof fetch;

async function fetchJson(
  params: Record<string, string>,
  fetchFn: FetchFn,
): Promise<unknown> {
  const url = `${WIKIDATA_API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetchFn(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status} for ${params.action}`);
  return res.json();
}

async function searchEntities(
  name: string,
  fetchFn: FetchFn,
  limit = 5,
): Promise<SearchHit[]> {
  const data = (await fetchJson(
    {
      action: "wbsearchentities",
      search: name,
      language: "en",
      type: "item",
      limit: String(limit),
    },
    fetchFn,
  )) as { search?: SearchHit[] };
  return data.search ?? [];
}

async function getEntities(
  ids: string[],
  fetchFn: FetchFn,
): Promise<Record<string, WikidataEntity>> {
  if (ids.length === 0) return {};
  const data = (await fetchJson(
    { action: "wbgetentities", ids: ids.join("|"), props: "claims|labels" },
    fetchFn,
  )) as { entities?: Record<string, WikidataEntity> };
  return data.entities ?? {};
}

/**
 * Resolve an author name to their map country/countries via Wikidata. Takes the first
 * search hit that is a human, and keeps every non-deprecated country of citizenship (dual
 * nationals get all of them); missing matches are flagged for review rather than guessed at.
 */
export async function resolveAuthorNationality(
  name: string,
  fetchFn: FetchFn = fetch,
): Promise<AuthorResolution> {
  const hits = await searchEntities(name, fetchFn);

  if (hits.length === 0)
    return {
      ...unresolved("No Wikidata match for author name"),
      wikidataId: null,
    };

  const entities = await getEntities(
    hits.map((h) => h.id),
    fetchFn,
  );

  for (const hit of hits) {
    const entity = entities[hit.id];
    if (!entity) continue;
    const { isHuman, citizenships } = parseHumanCitizenships(entity);
    if (!isHuman) continue;

    // First matching human wins; don't keep searching and risk a different person.
    if (citizenships.length === 0) {
      return {
        ...unresolved("Matched author has no citizenship on Wikidata"),
        wikidataId: hit.id,
      };
    }

    const countryEntities = await getEntities(
      [...new Set(citizenships.map((c) => c.qid))],
      fetchFn,
    );
    const raws: RawCitizenship[] = citizenships.map((c) => {
      const { label, alpha3 } = parseCountryAlpha3(
        countryEntities[c.qid] ?? {},
      );
      return { label, isoAlpha3: alpha3, rank: c.rank };
    });

    return {
      ...chooseMapCountry(raws, ResolutionMethod.Wikidata),
      wikidataId: hit.id,
    };
  }

  return {
    ...unresolved("No matching person found on Wikidata"),
    wikidataId: null,
  };
}
