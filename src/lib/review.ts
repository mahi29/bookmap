import { prisma } from "./db";

// Data access for the review queue: authors whose country couldn't be resolved
// confidently, with the books that point at them and whatever the resolvers suggested.

export interface ReviewAuthor {
  id: string;
  name: string;
  books: string[];
  reasoning: string | null;
  resolutionMethod: string;
}

export async function getReviewQueue(): Promise<ReviewAuthor[]> {
  const authors = await prisma.author.findMany({
    where: { needsReview: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      reasoning: true,
      resolutionMethod: true,
      books: { select: { book: { select: { title: true } } } },
    },
  });

  return authors.map((a) => ({
    id: a.id,
    name: a.name,
    reasoning: a.reasoning,
    resolutionMethod: a.resolutionMethod,
    books: a.books.map((b) => b.book.title),
  }));
}

export async function reviewQueueCount(): Promise<number> {
  return prisma.author.count({ where: { needsReview: true } });
}
