import { prisma } from "../src/lib/db";
import { resolveAuthorNationalityLLM } from "../src/lib/nationality/llm";
import { NON_MANUAL, persistResolution } from "../src/lib/nationality/persist";
import { createLlmClient, MAX_TITLES, runScript, sleep } from "./shared";

// Verify (and correct) every non-manual author with Claude, using their book titles as
// context. This catches "wrong-but-confident" Wikidata matches — a common name that
// resolved to the wrong person (e.g. "Óscar Martínez" the Spanish TV presenter instead of
// the Salvadoran journalist). Manual picks are user truth and are left untouched.
//
//   set ANTHROPIC_API_KEY in .env (or the environment), then: npm run db:verify-llm
//   npm run db:verify-llm -- --dry-run   preview the same summary/corrections, write nothing

const DELAY_MS = 200;
const key = (iso3s: string[]) => [...iso3s].sort().join("+");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = createLlmClient();

  const authors = await prisma.author.findMany({
    where: NON_MANUAL,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      countries: { select: { iso3: true } },
      books: { select: { book: { select: { title: true } } } },
    },
  });

  const prefix = dryRun ? "[dry run] " : "";
  console.log(
    `${prefix}Verifying ${authors.length} non-manual author(s) with Claude...`,
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
      if (!dryRun) await persistResolution(author.id, r);
      const next = key(r.iso3s);
      if (next !== current)
        corrections.push(`${author.name}: ${current || "(none)"} → ${next}`);
      else confirmed += 1;
    } else if (author.countries.length === 0) {
      // The LLM couldn't resolve it and we had nothing anyway — leave it for review.
      if (!dryRun) await persistResolution(author.id, r);
      flagged += 1;
    }
    // Else: LLM unsure but Wikidata had a country — keep the existing answer, don't downgrade.

    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${authors.length}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `${prefix}Done. ${confirmed} confirmed, ${corrections.length} corrected, ${flagged} left for review.`,
  );
  if (corrections.length > 0) {
    console.log(`\n${prefix}Corrections:`);
    for (const c of corrections.sort()) console.log(`  ${c}`);
  }
}

runScript(main);
