import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/lib/db";
import {
  resolveAuthorNationalityLLM,
  type LlmClient,
} from "../src/lib/nationality/llm";

// Second-pass resolution: hand every review-queue author to Claude, using their book
// titles as context. Requires ANTHROPIC_API_KEY. Confident answers resolve the author
// (method "llm"); anything uncertain stays in the queue for manual review.
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run db:resolve-llm

const DELAY_MS = 200;
const MAX_TITLES = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — export it before running db:resolve-llm.",
    );
  }
  const client = new Anthropic() as unknown as LlmClient;

  const authors = await prisma.author.findMany({
    where: { needsReview: true },
    select: {
      id: true,
      name: true,
      books: { select: { book: { select: { title: true } } } },
    },
    orderBy: { name: "asc" },
  });

  console.log(`Resolving ${authors.length} review-queue author(s) via LLM...`);
  let resolved = 0;

  for (const [i, author] of authors.entries()) {
    const bookTitles = author.books
      .map((b) => b.book.title)
      .slice(0, MAX_TITLES);
    const r = await resolveAuthorNationalityLLM(
      { name: author.name, bookTitles },
      client,
    );

    await prisma.author.update({
      where: { id: author.id },
      data: {
        resolvedCountryIso3: r.iso3,
        resolutionMethod: r.method,
        confidence: r.confidence,
        reasoning: r.reasoning,
        needsReview: r.needsReview,
        resolvedAt: new Date(),
      },
    });
    if (r.iso3 && !r.needsReview) resolved += 1;

    if ((i + 1) % 10 === 0) console.log(`  ...${i + 1}/${authors.length}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `Done. ${resolved} newly resolved, ${authors.length - resolved} still need review.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
