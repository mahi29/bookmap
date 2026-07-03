import { describe, it, expect } from "vitest";
import { chooseMapCountry, type RawCitizenship } from "./resolve";

const cit = (
  label: string,
  isoAlpha3: string | null,
  rank: RawCitizenship["rank"] = "normal",
): RawCitizenship => ({ label, isoAlpha3, rank });

describe("chooseMapCountry", () => {
  it("resolves a single citizenship with high confidence", () => {
    const result = chooseMapCountry([cit("United States", "USA", "preferred")]);
    expect(result.iso3).toBe("USA");
    expect(result.needsReview).toBe(false);
    expect(result.method).toBe("wikidata");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("resolves a single normal-rank citizenship with lower confidence", () => {
    const result = chooseMapCountry([cit("France", "FRA")]);
    expect(result.iso3).toBe("FRA");
    expect(result.needsReview).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.confidence).toBeLessThan(0.95);
  });

  it("collapses label variants that map to the same country", () => {
    const result = chooseMapCountry([
      cit("United States", "USA"),
      cit("United States of America", null),
    ]);
    expect(result.iso3).toBe("USA");
    expect(result.needsReview).toBe(false);
  });

  it("prefers preferred-rank citizenship over normal ones", () => {
    const result = chooseMapCountry([
      cit("United Kingdom", "GBR", "normal"),
      cit("United States", "USA", "preferred"),
    ]);
    expect(result.iso3).toBe("USA");
    expect(result.needsReview).toBe(false);
  });

  it("maps a defunct country to its modern successor", () => {
    const result = chooseMapCountry([cit("Soviet Union", null, "preferred")]);
    expect(result.iso3).toBe("RUS");
    expect(result.needsReview).toBe(false);
  });

  it("ignores deprecated-rank citizenships", () => {
    const result = chooseMapCountry([
      cit("United States", "USA", "deprecated"),
      cit("France", "FRA", "normal"),
    ]);
    expect(result.iso3).toBe("FRA");
  });

  it("flags genuinely ambiguous multi-citizenship for review", () => {
    const result = chooseMapCountry([
      cit("United States", "USA"),
      cit("United Kingdom", "GBR"),
    ]);
    expect(result.iso3).toBeNull();
    expect(result.needsReview).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("returns unresolved when there is no citizenship data", () => {
    const result = chooseMapCountry([]);
    expect(result.iso3).toBeNull();
    expect(result.method).toBe("unresolved");
    expect(result.needsReview).toBe(true);
  });

  it("returns unresolved when the citizenship cannot be mapped", () => {
    const result = chooseMapCountry([cit("Narnia", null)]);
    expect(result.iso3).toBeNull();
    expect(result.method).toBe("unresolved");
    expect(result.needsReview).toBe(true);
  });
});
