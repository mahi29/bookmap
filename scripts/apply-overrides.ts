import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { resolveToMapCountry } from "../src/lib/countries";

// Apply manual author→country overrides from a JSON file, then report which authors still
// need one. This replaces the old review UI: corrections live in a durable, re-appliable
// file rather than only in the local DB.
//
//   data/author-countries.json  =  { "Alex Michaelides": ["CYP", "GBR"], ... }
//   npm run db:overrides

const FILE = "data/author-countries.json";
const MAX_TITLES = 3;

async function main() {
  const overrides = JSON.parse(readFileSync(FILE, "utf8")) as Record<
    string,
    string[]
  >;

  let applied = 0;
  for (const [name, codes] of Object.entries(overrides)) {
    const iso3s = [
      ...new Set(
        codes
          .map((c) => resolveToMapCountry(c))
          .filter((x): x is string => x !== null),
      ),
    ];
    if (iso3s.length === 0) {
      console.warn(
        `  ! ${name}: no valid countries in ${JSON.stringify(codes)} — skipped`,
      );
      continue;
    }

    const author = await prisma.author.findUnique({ where: { name } });
    if (!author) {
      console.warn(`  ! ${name}: not in library — skipped`);
      continue;
    }

    await prisma.author.update({
      where: { id: author.id },
      data: {
        resolutionMethod: "manual",
        confidence: 1,
        needsReview: false,
        reasoning: `Set via ${FILE}`,
        resolvedAt: new Date(),
        countries: { deleteMany: {}, create: iso3s.map((iso3) => ({ iso3 })) },
      },
    });
    applied += 1;
  }
  console.log(`Applied ${applied} override(s) from ${FILE}.`);

  // Report the authors still without a country, as a paste-ready stub for the file.
  const pending = await prisma.author.findMany({
    where: { needsReview: true },
    orderBy: { name: "asc" },
    select: {
      name: true,
      reasoning: true,
      books: { select: { book: { select: { title: true } } } },
    },
  });

  if (pending.length === 0) {
    console.log("Nothing left to review — every author has a country.");
    return;
  }

  console.log(
    `\n${pending.length} author(s) still need a country. Fill these into ${FILE}:\n`,
  );
  for (const a of pending) {
    const books = a.books
      .map((b) => b.book.title)
      .slice(0, MAX_TITLES)
      .join("; ");
    console.log(
      `  ${a.name}  —  ${books || "(no books)"}${a.reasoning ? `  [${a.reasoning}]` : ""}`,
    );
  }

  const stub = Object.fromEntries(pending.map((a) => [a.name, []]));
  console.log(
    "\nPaste-ready stub (merge into the file, then fill the arrays):",
  );
  console.log(JSON.stringify(stub, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
