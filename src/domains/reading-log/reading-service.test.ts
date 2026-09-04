import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResolutionMethod } from "../shared/constants";
import { normalizeReadingInput } from "./normalize-reading";

// --- In-memory fake Prisma, scoped to exactly what addReading touches. ---
// Bug A2's fix depends on the real relational shape (book -> authors -> author.name),
// so a hand-rolled fake that models Book/Author/BookAuthor rows is more trustworthy
// here than a jest.fn()-per-call stub.
interface FakeBook {
  id: string;
  title: string;
  isbn: string | null;
}
interface FakeAuthor {
  id: string;
  name: string;
  resolutionMethod: string;
  countries: { iso3: string }[];
}
interface FakeBookAuthor {
  bookId: string;
  authorId: string;
}

interface BookFindFirstArgs {
  where: { title?: string; isbn?: string };
  include?: { authors?: unknown };
}
interface BookCreateArgs {
  data: { title: string; isbn?: string | null };
}
interface BookUpdateArgs {
  where: { id: string };
  data: { isbn?: string | null };
}
interface AuthorUpsertArgs {
  where: { name: string };
  create: { name: string };
}
interface AuthorFindUniqueArgs {
  where: { id: string };
}
interface BookAuthorUpsertArgs {
  create: FakeBookAuthor;
}
interface ReadingCreateArgs {
  data: {
    userId: string;
    bookId: string;
    dateRead: Date | null;
    rating: number | null;
    source: string;
  };
}

let books: FakeBook[];
let authors: FakeAuthor[];
let bookAuthors: FakeBookAuthor[];
let readings: (ReadingCreateArgs["data"] & { id: string })[];
let nextId: number;

function resetFakeDb() {
  books = [];
  authors = [];
  bookAuthors = [];
  readings = [];
  nextId = 1;
}

function genId(prefix: string) {
  return `${prefix}${nextId++}`;
}

vi.mock("../../infrastructure/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(async ({ where, include }: BookFindFirstArgs) => {
        const candidates = books.filter((b) => {
          if (where.isbn) return b.isbn === where.isbn;
          if (where.title) return b.title === where.title;
          return false;
        });
        if (candidates.length === 0) return null;
        const book = candidates[0];
        if (include?.authors) {
          return {
            ...book,
            authors: bookAuthors
              .filter((ba) => ba.bookId === book.id)
              .map((ba) => ({
                author: authors.find((a) => a.id === ba.authorId),
              })),
          };
        }
        return book;
      }),
      create: vi.fn(async ({ data }: BookCreateArgs) => {
        const book: FakeBook = {
          id: genId("book"),
          title: data.title,
          isbn: data.isbn ?? null,
        };
        books.push(book);
        return book;
      }),
      update: vi.fn(async ({ where, data }: BookUpdateArgs) => {
        const book = books.find((b) => b.id === where.id);
        if (!book) throw new Error(`book ${where.id} not found`);
        if (data.isbn !== undefined) book.isbn = data.isbn;
        return book;
      }),
    },
    author: {
      upsert: vi.fn(async ({ where, create }: AuthorUpsertArgs) => {
        let author = authors.find((a) => a.name === where.name);
        if (!author) {
          author = {
            id: genId("author"),
            name: create.name,
            resolutionMethod: ResolutionMethod.Unresolved,
            countries: [],
          };
          authors.push(author);
        }
        return author;
      }),
      findUnique: vi.fn(async ({ where }: AuthorFindUniqueArgs) => {
        const author = authors.find((a) => a.id === where.id);
        if (!author) return null;
        return {
          resolutionMethod: author.resolutionMethod,
          countries: author.countries,
        };
      }),
    },
    bookAuthor: {
      upsert: vi.fn(async ({ create }: BookAuthorUpsertArgs) => {
        const exists = bookAuthors.some(
          (ba) =>
            ba.bookId === create.bookId && ba.authorId === create.authorId,
        );
        if (!exists) bookAuthors.push(create);
        return create;
      }),
    },
    reading: {
      create: vi.fn(async ({ data }: ReadingCreateArgs) => {
        const reading = { id: genId("reading"), ...data };
        readings.push(reading);
        return reading;
      }),
    },
  },
}));

vi.mock("../nationality-resolution/wikidata-resolver", () => ({
  resolveAuthorNationality: vi.fn(async () => ({
    method: ResolutionMethod.Unresolved,
    confidence: null,
    reasoning: null,
    needsReview: true,
    iso3s: [],
  })),
}));

vi.mock("../../infrastructure/db/prisma-author-resolution-repository", () => ({
  persistResolution: vi.fn(async () => true),
}));

const { addReading } = await import("./reading-service");

describe("addReading", () => {
  beforeEach(() => {
    resetFakeDb();
  });

  it("creates a new book instead of reusing one with the same title but a different author", async () => {
    // Seed an existing book "Hunger" by Knut Hamsun.
    const first = normalizeReadingInput({
      title: "Hunger",
      authors: "Knut Hamsun",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await addReading(first.value, "user1");

    expect(books).toHaveLength(1);
    const originalBookId = books[0].id;

    // Now log a different book that happens to share the title "Hunger", by Roxane Gay.
    const second = normalizeReadingInput({
      title: "Hunger",
      authors: "Roxane Gay",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value, "user1");

    // A new Book row must be created — not the Hamsun book reused.
    expect(books).toHaveLength(2);
    const newBook = books.find((b) => b.id !== originalBookId);
    expect(newBook).toBeDefined();

    // The new book must be linked only to Roxane Gay, not Knut Hamsun.
    const roxane = authors.find((a) => a.name === "Roxane Gay")!;
    const hamsun = authors.find((a) => a.name === "Knut Hamsun")!;
    const newBookAuthorIds = bookAuthors
      .filter((ba) => ba.bookId === newBook!.id)
      .map((ba) => ba.authorId);
    expect(newBookAuthorIds).toEqual([roxane.id]);
    expect(newBookAuthorIds).not.toContain(hamsun.id);
  });

  it("still reuses the existing book when title and author set both match (a re-read)", async () => {
    const first = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await addReading(first.value, "user1");
    expect(books).toHaveLength(1);

    const second = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value, "user1");

    // Same book reused, not a duplicate.
    expect(books).toHaveLength(1);
  });

  it("stores the reading against the given user", async () => {
    const input = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
    });
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    await addReading(input.value, "user42");

    expect(readings).toHaveLength(1);
    expect(readings[0].userId).toBe("user42");
  });

  it("persists ISBN on a newly created book", async () => {
    const input = normalizeReadingInput({
      title: "Night",
      authors: "Elie Wiesel",
      isbn: "978-0-374-50001-6",
    });
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    await addReading(input.value, "user1");

    expect(books).toHaveLength(1);
    expect(books[0].isbn).toBe("9780374500016");
  });

  it("reuses an existing book when the ISBN matches", async () => {
    const first = normalizeReadingInput({
      title: "Night",
      authors: "Elie Wiesel",
      isbn: "9780374500016",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await addReading(first.value, "user1");
    const originalId = books[0].id;

    const second = normalizeReadingInput({
      title: "Night: A Memoir",
      authors: "Elie Wiesel",
      isbn: "9780374500016",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value, "user1");

    expect(books).toHaveLength(1);
    expect(books[0].id).toBe(originalId);
  });

  it("backfills ISBN onto an existing title+author match that has none", async () => {
    const first = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await addReading(first.value, "user1");
    expect(books[0].isbn).toBeNull();

    const second = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      isbn: "9781101947135",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value, "user1");

    expect(books).toHaveLength(1);
    expect(books[0].isbn).toBe("9781101947135");
  });

  it("does not overwrite an existing ISBN on a title+author re-read", async () => {
    const first = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      isbn: "9781101947135",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await addReading(first.value, "user1");

    const second = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      isbn: "9780000000000",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value, "user1");

    expect(books).toHaveLength(1);
    expect(books[0].isbn).toBe("9781101947135");
  });
});
