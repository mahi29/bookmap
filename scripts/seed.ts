import { readFileSync } from "node:fs";
import {
  ReadingSource,
  ResolutionMethod,
} from "../src/domains/shared/constants";
import { prisma } from "../src/infrastructure/db/prisma";
import { setManualCountries } from "../src/infrastructure/db/prisma-author-resolution-repository";
import { parseStoryGraphCsv } from "../src/domains/reading-log/storygraph-import";
import { runScript } from "./shared";

// Seed the DB from a StoryGraph CSV export. This is a DEV-ONLY convenience: it CLEARS
// existing data — every user's readings and imports — and reloads the CSV as one user's
// library, so it stays idempotent across runs. (A real, dedup-aware importer arrives
// in a later PR.)
//
//   npm run db:seed [path/to/export.csv] [-- --user <username>]
//
// Defaults: data/storygraph-export.csv, user "mahith". The user is created if missing,
// with the LOCKED sentinel hash (claim it via `npm run db:set-password`).

const DEFAULT_CSV = "data/storygraph-export.csv";
const DEFAULT_USERNAME = "mahith";

function parseArgs(argv: string[]): { path: string; username: string } {
  const args = [...argv];
  let username = DEFAULT_USERNAME;
  const userFlag = args.indexOf("--user");
  if (userFlag !== -1) {
    const value = args[userFlag + 1];
    if (!value) throw new Error("--user requires a username.");
    username = value;
    args.splice(userFlag, 2);
  }
  return { path: args[0] ?? DEFAULT_CSV, username };
}

async function main() {
  const { path, username } = parseArgs(process.argv.slice(2));
  const csv = readFileSync(path, "utf8");
  const books = parseStoryGraphCsv(csv);

  // Reset + reload + restore run as one transaction: if anything throws mid-way (a bad
  // CSV row, a SQLite lock, Ctrl-C), the DB is rolled back to exactly its pre-seed state
  // instead of being left half-populated with manual picks gone. Every write below goes
  // through `tx`, never the module-level `prisma`, so nothing escapes the transaction.
  const { authorIds, readingCount, restored } = await prisma.$transaction(
    async (tx) => {
      // Preserve manual nationality picks (keyed by author name) across the reset, so
      // hand-corrected authors survive a re-seed. Everything else is re-derived.
      const manualPicks = await tx.author.findMany({
        where: { resolutionMethod: ResolutionMethod.Manual },
        select: {
          name: true,
          confidence: true,
          reasoning: true,
          countries: { select: { iso3: true } },
        },
      });

      // Reset in FK-safe order. (Users survive the reset; only their data is wiped.)
      await tx.reading.deleteMany();
      await tx.bookAuthor.deleteMany();
      await tx.book.deleteMany();
      await tx.author.deleteMany();
      await tx.import.deleteMany();

      // The user owning the seeded library; created LOCKED (no login) if missing.
      const user = await tx.user.upsert({
        where: { username },
        create: { username, passwordHash: "LOCKED" },
        update: {},
      });

      const importRecord = await tx.import.create({
        data: {
          userId: user.id,
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
        const author = await tx.author.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        authorIds.set(name, author.id);
        return author.id;
      }

      // Row-by-row create()s (not createMany) because each book needs its generated id
      // for the BookAuthor/Reading rows that follow it; batching would need pre-generated
      // cuids threaded through instead. Left as a perf opportunity (not correctness) if
      // this ever gets slow — see docs/REVIEW.md B3.
      let readingCount = 0;
      for (const book of books) {
        const created = await tx.book.create({
          data: { title: book.title, isbn: book.isbn },
        });

        // A book can list the same author twice in the export; dedupe per book.
        for (const name of new Set(book.authors)) {
          await tx.bookAuthor.create({
            data: { bookId: created.id, authorId: await authorId(name) },
          });
        }

        for (const reading of book.readings) {
          await tx.reading.create({
            data: {
              userId: user.id,
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
          tx,
        );
        restored += 1;
      }

      return { authorIds, readingCount, restored };
    },
    // Generous timeout: this loop is ~3 sequential statements per book (create + N
    // authors + N readings), so a large library can run long past Prisma's 5s default
    // even on fast local SQLite. Bump it rather than risk a spurious rollback.
    { timeout: 60_000 },
  );

  console.log(
    `Seeded ${books.length} books, ${authorIds.size} authors, ${readingCount} readings ` +
      `for ${username} from ${path} (restored ${restored} manual pick(s)).`,
  );
}

runScript(main);
