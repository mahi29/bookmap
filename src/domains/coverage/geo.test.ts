import { describe, it, expect } from "vitest";
import { alpha3ForNumeric, getCountryShapes } from "./geo";

describe("alpha3ForNumeric", () => {
  it("bridges ISO numeric ids to alpha-3", () => {
    expect(alpha3ForNumeric("840")).toBe("USA");
    expect(alpha3ForNumeric("826")).toBe("GBR");
    expect(alpha3ForNumeric("392")).toBe("JPN");
  });

  it("returns null for an unknown numeric id", () => {
    expect(alpha3ForNumeric("000")).toBeNull();
  });
});

describe("getCountryShapes", () => {
  const shapes = getCountryShapes();

  it("returns geometry tagged with alpha-3 for real countries", () => {
    const usa = shapes.find((s) => s.iso3 === "USA");
    expect(usa).toBeDefined();
    expect(usa?.name).toBeTruthy();
    expect(usa?.geometry).toBeDefined();
  });

  it("returns a full world of shapes", () => {
    expect(shapes.length).toBeGreaterThan(150);
  });
});
