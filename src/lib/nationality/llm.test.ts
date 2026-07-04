import { describe, it, expect } from "vitest";
import {
  interpretLlmResult,
  resolveAuthorNationalityLLM,
  type LlmClient,
} from "./llm";

describe("interpretLlmResult", () => {
  it("resolves a confident, valid country", () => {
    const r = interpretLlmResult({
      countryIso3: "GBR",
      confidence: 0.9,
      reasoning: "British novelist",
    });
    expect(r.iso3).toBe("GBR");
    expect(r.method).toBe("llm");
    expect(r.needsReview).toBe(false);
  });

  it("maps a country name or defunct country through the successor logic", () => {
    expect(
      interpretLlmResult({
        countryIso3: "Japan",
        confidence: 0.9,
        reasoning: "",
      }).iso3,
    ).toBe("JPN");
    expect(
      interpretLlmResult({
        countryIso3: "Soviet Union",
        confidence: 0.95,
        reasoning: "",
      }).iso3,
    ).toBe("RUS");
  });

  it("keeps a low-confidence guess out of the map and in review", () => {
    const r = interpretLlmResult({
      countryIso3: "GBR",
      confidence: 0.4,
      reasoning: "unsure",
    });
    expect(r.iso3).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.reasoning).toContain("United Kingdom"); // guess surfaced for the reviewer
  });

  it("treats UNKNOWN and unmappable answers as unresolved", () => {
    expect(
      interpretLlmResult({
        countryIso3: "UNKNOWN",
        confidence: 0.9,
        reasoning: "",
      }).method,
    ).toBe("unresolved");
    expect(
      interpretLlmResult({
        countryIso3: "Narnia",
        confidence: 0.9,
        reasoning: "",
      }).iso3,
    ).toBeNull();
  });

  it("clamps a malformed confidence to a valid range", () => {
    expect(
      interpretLlmResult({ countryIso3: "USA", confidence: 5, reasoning: "" })
        .confidence,
    ).toBe(1);
    expect(
      interpretLlmResult({
        countryIso3: "USA",
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
      countryIso3: "NGA",
      confidence: 0.92,
      reasoning: "Nigerian author",
    });
    const r = await resolveAuthorNationalityLLM(
      {
        name: "Chimamanda Ngozi Adichie",
        bookTitles: ["Half of a Yellow Sun"],
      },
      client,
    );
    expect(r.iso3).toBe("NGA");
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
    expect(r.iso3).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});
