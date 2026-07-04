import { countryName, resolveToMapCountry } from "../countries";
import type { ResolutionResult } from "./resolve";

// LLM fallback: for authors Wikidata couldn't resolve, ask Claude for the author's
// countries of citizenship (usually one, sometimes two), using their book titles as
// disambiguating context. The structured answer runs through the same country-mapping +
// a confidence gate. The interpret step is pure/tested; only the create call hits the API.

const MODEL = "claude-opus-4-8";
const CONFIDENCE_THRESHOLD = 0.7;

export interface LlmInput {
  name: string;
  bookTitles: string[];
}

export interface LlmRawResult {
  countryIso3s: string[]; // alpha-3 codes and/or country names; empty/"UNKNOWN" if unsure
  confidence: number; // 0..1
  reasoning: string;
}

// Structural type for the one SDK call we make, so tests can inject a fake.
export interface LlmClient {
  messages: {
    create(body: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    countryIso3s: {
      type: "array",
      items: { type: "string" },
      description:
        "ISO 3166-1 alpha-3 code(s) of the author's countries of citizenship — usually one, sometimes two for dual nationals. Empty if unsure.",
    },
    confidence: { type: "number", description: "Confidence from 0 to 1." },
    reasoning: {
      type: "string",
      description: "One sentence of justification.",
    },
  },
  required: ["countryIso3s", "confidence", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You determine an author's countries of citizenship — their "map countries" — for a reading-map app.
Given the author's name and some titles they wrote, respond with the ISO 3166-1 alpha-3 code(s) of every country the author holds citizenship in. Most authors have one; dual nationals (e.g. a Ghanaian-American novelist) have two — list all of them.
Use the book titles to disambiguate common names. If you cannot identify the author with reasonable confidence, return an empty list.`;

function mapCountries(raw: string[]): string[] {
  return [
    ...new Set(
      (raw ?? [])
        .map((c) => resolveToMapCountry(c))
        .filter((iso): iso is string => iso !== null),
    ),
  ];
}

/** Pure: turn the model's structured answer into a resolution, applying the confidence gate. */
export function interpretLlmResult(raw: LlmRawResult): ResolutionResult {
  const rawConfidence = Number.isFinite(raw.confidence) ? raw.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence));
  const iso3s = mapCountries(raw.countryIso3s);
  const names = iso3s.map((c) => countryName(c) ?? c).join(", ");

  if (iso3s.length > 0 && confidence >= CONFIDENCE_THRESHOLD) {
    return {
      iso3s,
      method: "llm",
      confidence,
      reasoning: `LLM: ${names} — ${raw.reasoning}`,
      needsReview: false,
    };
  }

  // Not confident enough (or unmappable): keep it out of the map, leave it for review.
  const guess =
    iso3s.length > 0 ? `${names} (low confidence ${confidence})` : "no country";
  return {
    iso3s: [],
    method: iso3s.length > 0 ? "llm" : "unresolved",
    confidence,
    reasoning: `LLM suggested ${guess}: ${raw.reasoning}`,
    needsReview: true,
  };
}

function parseResponse(message: {
  content: Array<{ type: string; text?: string }>;
}): LlmRawResult {
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as Partial<LlmRawResult>;
  return {
    countryIso3s: Array.isArray(parsed.countryIso3s)
      ? parsed.countryIso3s.map(String)
      : [],
    confidence: Number(parsed.confidence ?? 0),
    reasoning: String(parsed.reasoning ?? ""),
  };
}

/** Resolve one author via the LLM. Returns a review-flagged result on any failure. */
export async function resolveAuthorNationalityLLM(
  input: LlmInput,
  client: LlmClient,
): Promise<ResolutionResult> {
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Author: ${input.name}\nBooks: ${input.bookTitles.join("; ") || "(none listed)"}`,
        },
      ],
    });
    return interpretLlmResult(parseResponse(message));
  } catch (error) {
    return {
      iso3s: [],
      method: "unresolved",
      confidence: 0,
      reasoning: `LLM resolution failed: ${(error as Error).message}`,
      needsReview: true,
    };
  }
}
