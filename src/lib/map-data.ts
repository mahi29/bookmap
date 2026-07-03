import { prisma } from "./db";
import type { CoverageEntry } from "./coverage";

// Server data access: flatten readings -> books -> resolved author countries into the
// per-(book, country) entries the aggregation consumes. Only books with a reading and a
// resolved author country appear (unread books and unresolved authors contribute nothing).
export async function getCoverageEntries(): Promise<CoverageEntry[]> {
  const readings = await prisma.reading.findMany({
    select: {
      bookId: true,
      dateRead: true,
      book: {
        select: {
          authors: {
            select: { author: { select: { resolvedCountryIso3: true } } },
          },
        },
      },
    },
  });

  const entries: CoverageEntry[] = [];
  for (const reading of readings) {
    for (const { author } of reading.book.authors) {
      if (author.resolvedCountryIso3) {
        entries.push({
          bookId: reading.bookId,
          iso3: author.resolvedCountryIso3,
          dateRead: reading.dateRead,
        });
      }
    }
  }
  return entries;
}
