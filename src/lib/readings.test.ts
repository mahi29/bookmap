import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResolutionMethod } from "../domains/shared/constants";

// --- In-memory fake Prisma, scoped to exactly what addReading touches. ---
// Bug A2's fix depends on the real relational shape (book -> authors -> author.name),
// so a hand-rolled fake that models Book/Author/BookAuthor rows is more trustworthy
// here than a jest.fn()-per-call stub.
interface FakeBook {
  id: string;
  title: string;
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
  where: { title: string };
  include?: { authors?: unknown };
}
interface BookCreateArgs {
  data: { title: string };
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
    bookId: string;
    dateRead: Date | null;
    rating: number | null;
    source: string;
  };
}

let books: FakeBook[];
let authors: FakeAuthor[];
let bookAuthors: FakeBookAuthor[];
let nextId: number;

function resetFakeDb() {
  books = [];
  authors = [];
  bookAuthors = [];
  nextId = 1;
}

function genId(prefix: string) {
  return `${prefix}${nextId++}`;
}

vi.mock("../infrastructure/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(async ({ where, include }: BookFindFirstArgs) => {
        const candidates = books.filter((b) => b.title === where.title);
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
        const book: FakeBook = { id: genId("book"), title: data.title };
        books.push(book);
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
      create: vi.fn(async ({ data }: ReadingCreateArgs) => ({
        id: genId("reading"),
        ...data,
      })),
    },
  },
}));

vi.mock("../domains/nationality-resolution/wikidata-resolver", () => ({
  resolveAuthorNationality: vi.fn(async () => ({
    method: ResolutionMethod.Unresolved,
    confidence: null,
    reasoning: null,
    needsReview: true,
    iso3s: [],
  })),
}));

vi.mock("../infrastructure/db/prisma-author-resolution-repository", () => ({
  persistResolution: vi.fn(async () => true),
}));

const { normalizeReadingInput, addReading } = await import("./readings");

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("normalizeReadingInput", () => {
  it("normalizes a valid reading", () => {
    const r = normalizeReadingInput({
      title: "  Homegoing ",
      authors: "Yaa Gyasi",
      dateRead: "2026-03-01",
      rating: "4.5",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("Homegoing");
    expect(r.value.authors).toEqual(["Yaa Gyasi"]);
    expect(iso(r.value.dateRead)).toBe("2026-03-01");
    expect(r.value.rating).toBe(4.5);
  });

  it("splits and trims multiple authors", () => {
    const r = normalizeReadingInput({
      title: "Good Omens",
      authors: "Neil Gaiman, Terry Pratchett",
    });
    expect(r.ok && r.value.authors).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("treats empty date and rating as null", () => {
    const r = normalizeReadingInput({
      title: "X",
      authors: "A",
      dateRead: "",
      rating: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dateRead).toBeNull();
    expect(r.value.rating).toBeNull();
  });

  it("rejects a missing title", () => {
    const r = normalizeReadingInput({ title: "   ", authors: "A" });
    expect(r.ok).toBe(false);
  });

  it("rejects when no authors are given", () => {
    const r = normalizeReadingInput({ title: "X", authors: " , " });
    expect(r.ok).toBe(false);
  });

  it("rejects an out-of-range rating", () => {
    expect(
      normalizeReadingInput({ title: "X", authors: "A", rating: "9" }).ok,
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      normalizeReadingInput({
        title: "X",
        authors: "A",
        dateRead: "March 2026",
      }).ok,
    ).toBe(false);
  });

  it("rejects a date with an out-of-range month/day that JS Date rolls over", () => {
    const r = normalizeReadingInput({
      title: "X",
      authors: "A",
      dateRead: "2026-13-45",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("Invalid date.");
  });

  it("rejects a rolled-over day like Feb 30", () => {
    const r = normalizeReadingInput({
      title: "X",
      authors: "A",
      dateRead: "2026-02-30",
    });
    expect(r.ok).toBe(false);
  });
});

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
    await addReading(first.value);

    expect(books).toHaveLength(1);
    const originalBookId = books[0].id;

    // Now log a different book that happens to share the title "Hunger", by Roxane Gay.
    const second = normalizeReadingInput({
      title: "Hunger",
      authors: "Roxane Gay",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value);

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
    await addReading(first.value);
    expect(books).toHaveLength(1);

    const second = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await addReading(second.value);

    // Same book reused, not a duplicate.
    expect(books).toHaveLength(1);
  });
});
