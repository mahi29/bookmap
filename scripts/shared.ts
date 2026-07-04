import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/lib/db";
import type { LlmClient } from "../src/lib/nationality/llm";

// Small shared infrastructure for the db:* scripts. Deliberately a couple of functions,
// not a base-class hierarchy — the scripts are thin orchestration and don't need one.

export const MAX_TITLES = 8;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a script's main function with consistent error handling + DB disconnect. */
export function runScript(main: () => Promise<void>): void {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

/**
 * Build the Anthropic client for the LLM scripts: load ANTHROPIC_API_KEY from a gitignored
 * .env if present, fail loudly if it's missing, and return it typed as our minimal
 * LlmClient (the one place the SDK↔LlmClient cast lives).
 */
export function createLlmClient(): LlmClient {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — put it in .env or the environment.",
    );
  }
  return new Anthropic() as unknown as LlmClient;
}
