import { describe, expect, it } from "vitest";
import { isValidMapCountry } from "@/domains/shared/countries";
import { SAMPLE_BY_COUNTRY, sampleCountryRows } from "./landing-preview";

describe("landing sample map", () => {
  const counts = Object.values(SAMPLE_BY_COUNTRY);
  const codes = Object.keys(SAMPLE_BY_COUNTRY);

  it("only shades valid modern map countries", () => {
    expect(codes.length).toBeGreaterThan(0);
    for (const iso3 of codes) {
      expect(isValidMapCountry(iso3), iso3).toBe(true);
    }
  });

  it("uses a spread of intensities so the heatmap has range", () => {
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(new Set(counts).size).toBeGreaterThan(3);
  });

  it("spans several regions so the choropleth reads as a world map", () => {
    // A few anchors on each inhabited continent — enough that the sample
    // doesn't collapse into a US/UK blob.
    const expected = ["USA", "BRA", "GBR", "NGA", "IND", "JPN", "AUS"];
    for (const iso3 of expected) {
      expect(SAMPLE_BY_COUNTRY[iso3], iso3).toBeGreaterThan(0);
    }
  });

  it("lists countries by intensity for the accessible sample breakdown", () => {
    const rows = sampleCountryRows();
    expect(rows).toHaveLength(codes.length);
    expect(rows[0]).toMatchObject({ iso3: "USA", count: 48 });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count);
    }
  });
});
