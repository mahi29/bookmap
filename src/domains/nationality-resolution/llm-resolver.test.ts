import { describe, it, expect } from "vitest";
import {
  interpretLlmResult,
  resolveAuthorNationalityLLM,
  type LlmClient,
} from "./llm-resolver";

describe("interpretLlmResult", () => {
  it("resolves a confident single country", () => {
    const r = interpretLlmResult({
      countryIso3s: ["GBR"],
      confidence: 0.9,
      reasoning: "British novelist",
    });
    expect(r.iso3s).toEqual(["GBR"]);
    expect(r.method).toBe("llm");
    expect(r.needsReview).toBe(false);
  });

  it("keeps both countries for a dual national", () => {
    const r = interpretLlmResult({
      countryIso3s: ["GHA", "USA"],
      confidence: 0.9,
      reasoning: "Ghanaian-American",
    });
    expect(r.iso3s.sort()).toEqual(["GHA", "USA"]);
    expect(r.needsReview).toBe(false);
  });

  it("maps names and defunct countries through the successor logic", () => {
    expect(
      interpretLlmResult({
        countryIso3s: ["Japan"],
        confidence: 0.9,
        reasoning: "",
      }).iso3s,
    ).toEqual(["JPN"]);
    expect(
      interpretLlmResult({
        countryIso3s: ["Soviet Union"],
        confidence: 0.95,
        reasoning: "",
      }).iso3s,
    ).toEqual(["RUS"]);
  });

  it("keeps a low-confidence guess out of the map and in review", () => {
    const r = interpretLlmResult({
      countryIso3s: ["GBR"],
      confidence: 0.4,
      reasoning: "unsure",
    });
    expect(r.iso3s).toEqual([]);
    expect(r.needsReview).toBe(true);
    expect(r.reasoning).toContain("United Kingdom"); // guess surfaced for the reviewer
  });

  it("treats an empty or unmappable answer as unresolved", () => {
    expect(
      interpretLlmResult({ countryIso3s: [], confidence: 0.9, reasoning: "" })
        .method,
    ).toBe("unresolved");
    expect(
      interpretLlmResult({
        countryIso3s: ["Narnia"],
        confidence: 0.9,
        reasoning: "",
      }).iso3s,
    ).toEqual([]);
  });

  it("clamps a malformed confidence to a valid range", () => {
    expect(
      interpretLlmResult({
        countryIso3s: ["USA"],
        confidence: 5,
        reasoning: "",
      }).confidence,
    ).toBe(1);
    expect(
      interpretLlmResult({
        countryIso3s: ["USA"],
        confidence: Number.NaN,
        reasoning: "",
      }).confidence,
    ).toBe(0);
  });
});

describe("resolveAuthorNationalityLLM", () => {
  const clientReturning = (payload: unknown): LlmClient => ({
    messages: {
      create: async () => ({
        content: [{ type: "text", text: JSON.stringify(payload) }],
      }),
    },
  });

  it("calls the model and interprets its structured answer", async () => {
    const client = clientReturning({
      countryIso3s: ["GHA", "USA"],
      confidence: 0.92,
      reasoning: "Ghanaian-American author",
    });
    const r = await resolveAuthorNationalityLLM(
      { name: "Yaa Gyasi", bookTitles: ["Homegoing"] },
      client,
    );
    expect(r.iso3s.sort()).toEqual(["GHA", "USA"]);
    expect(r.needsReview).toBe(false);
  });

  it("flags a malformed model response for review instead of throwing", async () => {
    const client: LlmClient = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "not json" }] }),
      },
    };
    const r = await resolveAuthorNationalityLLM(
      { name: "X", bookTitles: [] },
      client,
    );
    expect(r.iso3s).toEqual([]);
    expect(r.needsReview).toBe(true);
  });
});
