import { countryName, resolveToMapCountry } from "../countries";
import type { ResolutionResult } from "./resolve";

// LLM fallback: for authors Wikidata couldn't resolve confidently, ask Claude to name the
// author's single country of citizenship, using their book titles as disambiguating
// context. The structured answer runs through the same country-mapping + a confidence
// gate. The interpret step is pure/tested; only callClaude touches the network.

const MODEL = "claude-opus-4-8";
const CONFIDENCE_THRESHOLD = 0.7;

export interface LlmInput {
  name: string;
  bookTitles: string[];
}

export interface LlmRawResult {
  countryIso3: string; // alpha-3, a country name, or "UNKNOWN"
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
    countryIso3: {
      type: "string",
      description:
        "ISO 3166-1 alpha-3 code of the author's country of citizenship, or 'UNKNOWN' if unsure.",
    },
    confidence: { type: "number", description: "Confidence from 0 to 1." },
    reasoning: {
      type: "string",
      description: "One sentence of justification.",
    },
  },
  required: ["countryIso3", "confidence", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You determine an author's country of citizenship — a single "map country" — for a reading-map app.
Given the author's name and some titles they wrote, respond with the ISO 3166-1 alpha-3 code of their country of citizenship.
Use the book titles to disambiguate common names. If the author held multiple citizenships, choose the single country they are most associated with as a writer. If you cannot identify the author with reasonable confidence, return "UNKNOWN".`;

/** Pure: turn the model's structured answer into a resolution, applying the confidence gate. */
export function interpretLlmResult(raw: LlmRawResult): ResolutionResult {
  const rawConfidence = Number.isFinite(raw.confidence) ? raw.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  const iso3 =
    raw.countryIso3 && raw.countryIso3.trim().toUpperCase() !== "UNKNOWN"
      ? resolveToMapCountry(raw.countryIso3)
      : null;

  if (iso3 && confidence >= CONFIDENCE_THRESHOLD) {
    return {
      iso3,
      method: "llm",
      confidence,
      reasoning: `LLM: ${countryName(iso3) ?? iso3} — ${raw.reasoning}`,
      needsReview: false,
    };
  }

  // Not confident enough (or unmappable): keep it out of the map, leave it for review.
  const guess = iso3
    ? `${countryName(iso3) ?? iso3} (low confidence ${confidence})`
    : "no country";
  return {
    iso3: null,
    method: iso3 ? "llm" : "unresolved",
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
    countryIso3: String(parsed.countryIso3 ?? ""),
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
      iso3: null,
      method: "unresolved",
      confidence: 0,
      reasoning: `LLM resolution failed: ${(error as Error).message}`,
      needsReview: true,
    };
  }
}
