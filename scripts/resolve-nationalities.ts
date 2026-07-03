import { prisma } from "../src/lib/db";
import { resolveAuthorNationality } from "../src/lib/nationality/wikidata";

// Resolve seeded authors to a map country via Wikidata, caching the result on each
// Author. Polite + rate-limited; safe to re-run (only touches unresolved authors unless
// you pass --all). Ambiguous/unknown authors are flagged needsReview for the PR4 queue.
//
//   npm run db:resolve            resolve authors not yet resolved
//   npm run db:resolve -- --all   re-resolve every author
//   npm run db:resolve -- 10      cap to the first 10 (handy for a quick check)

const DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const all = process.argv.includes("--all");
  const limitArg = process.argv.find((a) => /^\d+$/.test(a));
  const take = limitArg ? Number(limitArg) : undefined;

  const authors = await prisma.author.findMany({
    where: all ? undefined : { resolutionMethod: "unresolved" },
    orderBy: { name: "asc" },
    take,
  });

  console.log(`Resolving ${authors.length} author(s)...`);
  let resolved = 0;
  let review = 0;

  for (const [i, author] of authors.entries()) {
    try {
      const r = await resolveAuthorNationality(author.name);
      await prisma.author.update({
        where: { id: author.id },
        data: {
          resolvedCountryIso3: r.iso3,
          resolutionMethod: r.method,
          confidence: r.confidence,
          reasoning: r.reasoning,
          needsReview: r.needsReview,
          wikidataId: r.wikidataId,
          resolvedAt: new Date(),
        },
      });
      if (r.iso3 && !r.needsReview) resolved += 1;
      if (r.needsReview) review += 1;
    } catch (error) {
      console.warn(`  ! ${author.name}: ${(error as Error).message}`);
    }

    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${authors.length}`);
    await sleep(DELAY_MS);
  }

  console.log(
    `Done. ${resolved} resolved, ${review} need review, ` +
      `${authors.length - resolved - review} unresolved.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
