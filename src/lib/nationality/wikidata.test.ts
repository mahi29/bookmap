import { describe, it, expect } from "vitest";
import {
  parseHumanCitizenships,
  parseCountryAlpha3,
  resolveAuthorNationality,
  type WikidataEntity,
} from "./wikidata";

const humanEntity: WikidataEntity = {
  id: "Q42",
  claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } }, rank: "normal" }],
    P27: [
      {
        mainsnak: { snaktype: "value", datavalue: { value: { id: "Q145" } } },
        rank: "preferred",
      },
      {
        mainsnak: { snaktype: "value", datavalue: { value: { id: "Q30" } } },
        rank: "deprecated",
      },
    ],
  },
};

const ukCountry: WikidataEntity = {
  id: "Q145",
  labels: { en: { value: "United Kingdom" } },
  claims: { P298: [{ mainsnak: { datavalue: { value: "GBR" } } }] },
};

describe("parseHumanCitizenships", () => {
  it("detects humans and extracts citizenship QIDs with ranks", () => {
    const result = parseHumanCitizenships(humanEntity);
    expect(result.isHuman).toBe(true);
    expect(result.citizenships).toEqual([
      { qid: "Q145", rank: "preferred" },
      { qid: "Q30", rank: "deprecated" },
    ]);
  });

  it("reports non-humans", () => {
    const org: WikidataEntity = {
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q43229" } } } }],
      },
    };
    expect(parseHumanCitizenships(org).isHuman).toBe(false);
  });
});

describe("parseCountryAlpha3", () => {
  it("reads the ISO alpha-3 code and label", () => {
    expect(parseCountryAlpha3(ukCountry)).toEqual({
      label: "United Kingdom",
      alpha3: "GBR",
    });
  });

  it("returns null alpha-3 when P298 is absent", () => {
    expect(
      parseCountryAlpha3({ id: "Q1", labels: { en: { value: "X" } } }).alpha3,
    ).toBeNull();
  });
});

describe("resolveAuthorNationality", () => {
  // A fetch stub that answers based on the Wikidata action + ids in the URL.
  const stubFetch = (async (input: string | URL) => {
    const url = new URL(input.toString());
    const action = url.searchParams.get("action");
    const body =
      action === "wbsearchentities"
        ? { search: [{ id: "Q42" }] }
        : url.searchParams.get("ids") === "Q42"
          ? { entities: { Q42: humanEntity } }
          : { entities: { Q145: ukCountry } };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;

  it("resolves an author to their map country/countries end to end", async () => {
    const result = await resolveAuthorNationality("Douglas Adams", stubFetch);
    expect(result.iso3s).toEqual(["GBR"]);
    expect(result.wikidataId).toBe("Q42");
    expect(result.needsReview).toBe(false);
    expect(result.method).toBe("wikidata");
  });

  it("flags an unknown author for review", async () => {
    const emptyFetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ search: [] }),
      }) as Response) as unknown as typeof fetch;
    const result = await resolveAuthorNationality("Nobody At All", emptyFetch);
    expect(result.iso3s).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(result.method).toBe("unresolved");
  });
});
