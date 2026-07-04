import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/lib/db";
import {
  resolveAuthorNationalityLLM,
  type LlmClient,
} from "../src/lib/nationality/llm";

// Load ANTHROPIC_API_KEY from a gitignored .env if present.
if (existsSync(".env")) process.loadEnvFile(".env");

// Verify (and correct) every non-manual author with Claude, using their book titles as
// context. This catches "wrong-but-confident" Wikidata matches — a common name that
// resolved to the wrong person (e.g. "Óscar Martínez" the Spanish TV presenter instead of
// the Salvadoran journalist). Manual picks are user truth and are left untouched.
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run db:verify-llm

const DELAY_MS = 200;
const MAX_TITLES = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const key = (iso3s: string[]) => [...iso3s].sort().join("+");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — export it before running db:verify-llm.",
    );
  }
  const client = new Anthropic() as unknown as LlmClient;

  const authors = await prisma.author.findMany({
    where: { resolutionMethod: { not: "manual" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      countries: { select: { iso3: true } },
      books: { select: { book: { select: { title: true } } } },
    },
  });

  console.log(
    `Verifying ${authors.length} non-manual author(s) with Claude...`,
  );
  let confirmed = 0;
  let flagged = 0;
  const corrections: string[] = [];

  for (const [i, author] of authors.entries()) {
    const bookTitles = author.books
      .map((b) => b.book.title)
      .slice(0, MAX_TITLES);
    const current = key(author.countries.map((c) => c.iso3));
    const r = await resolveAuthorNationalityLLM(
      { name: author.name, bookTitles },
      client,
    );

    if (r.iso3s.length > 0 && !r.needsReview) {
      // Confident answer wins — it has the book-title context Wikidata lacked.
      await prisma.author.update({
        where: { id: author.id },
        data: {
          resolutionMethod: "llm",
          confidence: r.confidence,
          reasoning: r.reasoning,
          needsReview: false,
          resolvedAt: new Date(),
          countries: {
            deleteMany: {},
            create: r.iso3s.map((iso3) => ({ iso3 })),
          },
        },
      });
      const next = key(r.iso3s);
      if (next !== current)
        corrections.push(`${author.name}: ${current || "(none)"} → ${next}`);
      else confirmed += 1;
    } else if (author.countries.length === 0) {
      // The LLM couldn't resolve it and we had nothing anyway — leave it for review.
      await prisma.author.update({
        where: { id: author.id },
        data: { needsReview: true, reasoning: r.reasoning },
      });
      flagged += 1;
    }
    // Else: LLM unsure but Wikidata had a country — keep the existing answer, don't downgrade.

    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${authors.length}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `Done. ${confirmed} confirmed, ${corrections.length} corrected, ${flagged} left for review.`,
  );
  if (corrections.length > 0) {
    console.log("\nCorrections:");
    for (const c of corrections.sort()) console.log(`  ${c}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
