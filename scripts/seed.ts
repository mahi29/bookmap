import { readFileSync } from "node:fs";
import { parseStoryGraphCsv } from "../src/lib/storygraph";
import { prisma } from "../src/lib/db";

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
          source: "storygraph",
          importId: importRecord.id,
          rawRow: JSON.stringify(book.raw),
        },
      });
      readingCount += 1;
    }
  }

  console.log(
    `Seeded ${books.length} books, ${authorIds.size} authors, ${readingCount} readings from ${path}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
