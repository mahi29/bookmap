import { describe, it, expect } from "vitest";
import { chooseMapCountry, type RawCitizenship } from "./resolve";

const cit = (
  label: string,
  isoAlpha3: string | null,
  rank: RawCitizenship["rank"] = "normal",
): RawCitizenship => ({ label, isoAlpha3, rank });

describe("chooseMapCountry", () => {
  it("returns a single citizenship", () => {
    const result = chooseMapCountry([cit("United States", "USA")]);
    expect(result.iso3s).toEqual(["USA"]);
    expect(result.needsReview).toBe(false);
    expect(result.method).toBe("wikidata");
  });

  it("keeps ALL citizenships for a dual national", () => {
    const result = chooseMapCountry([
      cit("Japan", "JPN"),
      cit("United Kingdom", "GBR"),
    ]);
    expect(result.iso3s.sort()).toEqual(["GBR", "JPN"]);
    expect(result.needsReview).toBe(false);
  });

  it("dedupes label variants that map to the same country", () => {
    const result = chooseMapCountry([
      cit("United States", "USA"),
      cit("United States of America", null),
    ]);
    expect(result.iso3s).toEqual(["USA"]);
  });

  it("maps defunct countries to their modern successors", () => {
    const result = chooseMapCountry([
      cit("Soviet Union", null),
      cit("Czechoslovakia", null),
    ]);
    expect(result.iso3s.sort()).toEqual(["CZE", "RUS"]);
  });

  it("ignores deprecated-rank citizenships", () => {
    const result = chooseMapCountry([
      cit("United States", "USA", "deprecated"),
      cit("France", "FRA"),
    ]);
    expect(result.iso3s).toEqual(["FRA"]);
  });

  it("returns unresolved when there is no citizenship data", () => {
    const result = chooseMapCountry([]);
    expect(result.iso3s).toEqual([]);
    expect(result.method).toBe("unresolved");
    expect(result.needsReview).toBe(true);
  });

  it("returns unresolved when no citizenship can be mapped", () => {
    const result = chooseMapCountry([cit("Narnia", null)]);
    expect(result.iso3s).toEqual([]);
    expect(result.method).toBe("unresolved");
    expect(result.needsReview).toBe(true);
  });
});
