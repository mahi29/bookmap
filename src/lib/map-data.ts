import { prisma } from "./db";
import type { CoverageEntry } from "./coverage";

// Server data access: flatten readings -> books -> each author's map countries into the
// per-(book, country) entries the aggregation consumes. An author with several
// citizenships contributes one entry per country; unread books and unresolved authors
// contribute nothing.
export async function getCoverageEntries(): Promise<CoverageEntry[]> {
  const readings = await prisma.reading.findMany({
    select: {
      bookId: true,
      dateRead: true,
      book: {
        select: {
          authors: {
            select: {
              author: { select: { countries: { select: { iso3: true } } } },
            },
          },
        },
      },
    },
  });

  const entries: CoverageEntry[] = [];
  for (const reading of readings) {
    for (const { author } of reading.book.authors) {
      for (const { iso3 } of author.countries) {
        entries.push({
          bookId: reading.bookId,
          iso3,
          dateRead: reading.dateRead,
        });
      }
    }
  }
  return entries;
}
