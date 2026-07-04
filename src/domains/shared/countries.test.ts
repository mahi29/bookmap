import { describe, it, expect } from "vitest";
import {
  isValidMapCountry,
  countryName,
  resolveToMapCountry,
  resolveToMapCountries,
} from "./countries";

describe("isValidMapCountry", () => {
  it("accepts modern ISO 3166-1 alpha-3 codes", () => {
    expect(isValidMapCountry("USA")).toBe(true);
    expect(isValidMapCountry("DEU")).toBe(true);
    expect(isValidMapCountry("JPN")).toBe(true);
  });

  it("rejects unknown or malformed codes", () => {
    expect(isValidMapCountry("XXX")).toBe(false);
    expect(isValidMapCountry("US")).toBe(false);
    expect(isValidMapCountry("")).toBe(false);
  });
});

describe("countryName", () => {
  it("returns the common name for a valid code", () => {
    expect(countryName("JPN")).toBe("Japan");
    expect(countryName("USA")).toBe("United States");
  });

  it("returns undefined for an invalid code", () => {
    expect(countryName("XXX")).toBeUndefined();
  });
});

describe("resolveToMapCountry", () => {
  it("passes through valid modern codes, case-insensitively", () => {
    expect(resolveToMapCountry("USA")).toBe("USA");
    expect(resolveToMapCountry("usa")).toBe("USA");
    expect(resolveToMapCountry(" Deu ")).toBe("DEU");
  });

  it("resolves modern country names to codes", () => {
    expect(resolveToMapCountry("Japan")).toBe("JPN");
    expect(resolveToMapCountry("United States")).toBe("USA");
    expect(resolveToMapCountry("United Kingdom")).toBe("GBR");
  });

  it("maps common name aliases", () => {
    expect(resolveToMapCountry("UK")).toBe("GBR");
    expect(resolveToMapCountry("England")).toBe("GBR");
    expect(resolveToMapCountry("USA")).toBe("USA");
  });

  it("maps defunct countries to a modern successor (pragmatic default)", () => {
    expect(resolveToMapCountry("Soviet Union")).toBe("RUS");
    expect(resolveToMapCountry("USSR")).toBe("RUS");
    expect(resolveToMapCountry("Ottoman Empire")).toBe("TUR");
    expect(resolveToMapCountry("Czechoslovakia")).toBe("CZE");
    expect(resolveToMapCountry("Yugoslavia")).toBe("SRB");
    expect(resolveToMapCountry("Burma")).toBe("MMR");
    expect(resolveToMapCountry("Persia")).toBe("IRN");
  });

  it("returns null for unknown input", () => {
    expect(resolveToMapCountry("Narnia")).toBeNull();
    expect(resolveToMapCountry("")).toBeNull();
  });
});

describe("resolveToMapCountries", () => {
  it("maps each input and drops unresolvable ones", () => {
    expect(resolveToMapCountries(["Japan", "Narnia", "USA"])).toEqual([
      "JPN",
      "USA",
    ]);
  });

  it("dedupes repeats and aliases of the same country", () => {
    expect(resolveToMapCountries(["UK", "England", "GBR"])).toEqual(["GBR"]);
  });

  it("returns an empty array when nothing resolves", () => {
    expect(resolveToMapCountries(["Narnia", ""])).toEqual([]);
  });

  it("returns an empty array for an empty input list", () => {
    expect(resolveToMapCountries([])).toEqual([]);
  });
});
