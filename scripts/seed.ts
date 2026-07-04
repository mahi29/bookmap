import { readFileSync } from "node:fs";
import { ReadingSource, ResolutionMethod } from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { setManualCountries } from "../src/lib/nationality/persist";
import { parseStoryGraphCsv } from "../src/lib/storygraph";
import { runScript } from "./shared";

// Seed the DB from a StoryGraph CSV export. This is a dev convenience for single-user
// BookMap: it CLEARS existing data and reloads, so it stays idempotent across runs.
// (A real, dedup-aware importer arrives in a later PR.)
//
//   npm run db:seed [path/to/export.csv]   (defaults to data/storygraph-export.csv)

const DEFAULT_CSV = "data/storygraph-export.csv";

async function main() {
  const path = process.argv[2] ?? DEFAULT_CSV;
  const csv = readFileSync(path, "utf8");
  const books = parseStoryGraphCsv(csv);

  // Preserve manual nationality picks (keyed by author name) across the reset, so
  // hand-corrected authors survive a re-seed. Everything else is re-derived.
  const manualPicks = await prisma.author.findMany({
    where: { resolutionMethod: ResolutionMethod.Manual },
    select: {
      name: true,
      confidence: true,
      reasoning: true,
      countries: { select: { iso3: true } },
    },
  });

  // Reset in FK-safe order.
  await prisma.reading.deleteMany();
  await prisma.bookAuthor.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.import.deleteMany();

  const importRecord = await prisma.import.create({
    data: {
      source: "storygraph",
      filename: path.split("/").pop() ?? path,
      rowCount: books.length,
    },
  });

  // Cache authors by name so co-authored books reuse the same Author row.
  const authorIds = new Map<string, string>();
  async function authorId(name: string): Promise<string> {
    const cached = authorIds.get(name);
    if (cached) return cached;
    const author = await prisma.author.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    authorIds.set(name, author.id);
    return author.id;
  }

  let readingCount = 0;
  for (const book of books) {
    const created = await prisma.book.create({
      data: { title: book.title, isbn: book.isbn },
    });

    // A book can list the same author twice in the export; dedupe per book.
    for (const name of new Set(book.authors)) {
      await prisma.bookAuthor.create({
        data: { bookId: created.id, authorId: await authorId(name) },
      });
    }

    for (const reading of book.readings) {
      await prisma.reading.create({
        data: {
          bookId: created.id,
          dateRead: reading.dateRead,
          dateStarted: reading.dateStarted,
          rating: reading.rating,
          source: ReadingSource.StoryGraph,
          importId: importRecord.id,
          rawRow: JSON.stringify(book.raw),
        },
      });
      readingCount += 1;
    }
  }

  // Re-apply preserved manual picks to any author still present in the new data.
  let restored = 0;
  for (const pick of manualPicks) {
    const id = authorIds.get(pick.name);
    if (!id) continue; // author no longer in the library
    await setManualCountries(
      id,
      pick.countries.map((c) => c.iso3),
      { confidence: pick.confidence, reasoning: pick.reasoning },
    );
    restored += 1;
  }

  console.log(
    `Seeded ${books.length} books, ${authorIds.size} authors, ${readingCount} readings ` +
      `from ${path} (restored ${restored} manual pick(s)).`,
  );
}

runScript(main);
