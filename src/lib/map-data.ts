import { prisma } from "./db";
import type { DetailEntry } from "./coverage";

// Server data access: flatten readings -> books -> each author's map countries into
// per-(book, country) entries, enriched with the book title and author name so the client
// can both aggregate (coverage/intensity) and list a country's books in the detail pane.
// An author with several citizenships contributes one entry per country; unread books and
// unresolved authors contribute nothing.
export async function getMapEntries(): Promise<DetailEntry[]> {
  const readings = await prisma.reading.findMany({
    select: {
      bookId: true,
      dateRead: true,
      book: {
        select: {
          title: true,
          authors: {
            select: {
              author: {
                select: { name: true, countries: { select: { iso3: true } } },
              },
            },
          },
        },
      },
    },
  });

  const entries: DetailEntry[] = [];
  for (const reading of readings) {
    for (const { author } of reading.book.authors) {
      for (const { iso3 } of author.countries) {
        entries.push({
          bookId: reading.bookId,
          iso3,
          dateRead: reading.dateRead,
          title: reading.book.title,
          author: author.name,
        });
      }
    }
  }
  return entries;
}

/** Number of authors still in the review queue (unresolved map country). */
export async function getNeedsReviewCount(): Promise<number> {
  return prisma.author.count({ where: { needsReview: true } });
}
