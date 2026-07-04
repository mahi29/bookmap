import { prisma } from "../src/infrastructure/db/prisma";
import { resolveAuthorNationalityLLM } from "../src/lib/nationality/llm";
import { persistResolution } from "../src/lib/nationality/persist";
import { createLlmClient, MAX_TITLES, runScript, sleep } from "./shared";

// Second-pass resolution: hand every review-queue author to Claude, using their book
// titles as context. Confident answers resolve the author (method "llm"); anything
// uncertain stays in the queue for manual review.
//
//   set ANTHROPIC_API_KEY in .env (or the environment), then: npm run db:resolve-llm

const DELAY_MS = 200;

async function main() {
  const client = createLlmClient();

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
    await persistResolution(author.id, r);
    if (r.iso3s.length > 0 && !r.needsReview) resolved += 1;

    if ((i + 1) % 10 === 0) console.log(`  ...${i + 1}/${authors.length}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `Done. ${resolved} newly resolved, ${authors.length - resolved} still need review.`,
  );
}

runScript(main);
