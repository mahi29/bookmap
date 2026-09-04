import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResolutionMethod } from "../shared/constants";
import { canonicalizeIsbn } from "../shared/isbn";
import { normalizeReadingInput } from "./normalize-reading";

// In-memory fake Prisma, scoped to what addReading touches. Models Book/Author/
// BookAuthor/Reading rows so reuse-vs-create assertions are about real identity,
// not call-order stubs.

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

interface BookWhere {
  id?: string;
  isbn?: string;
  title?: string;
}
interface BookInclude {
  authors?: unknown;
}

let books: FakeBook[];
let authors: FakeAuthor[];
let bookAuthors: FakeBookAuthor[];
let readings: {
  id: string;
  userId: string;
  bookId: string;
  dateRead: Date | null;
  rating: number | null;
  source: string;
}[];
let nextId: number;
let authorUpsertCalls: number;
let bookAuthorUpsertCalls: number;
let bookAuthorCreateCalls: number;

function resetFakeDb() {
  books = [];
  authors = [];
  bookAuthors = [];
  readings = [];
  nextId = 1;
  authorUpsertCalls = 0;
  bookAuthorUpsertCalls = 0;
  bookAuthorCreateCalls = 0;
}

function genId(prefix: string) {
  return `${prefix}${nextId++}`;
}

function withAuthors(book: FakeBook) {
  return {
    ...book,
    authors: bookAuthors
      .filter((ba) => ba.bookId === book.id)
      .map((ba) => ({
        author: authors.find((a) => a.id === ba.authorId),
      })),
  };
}

vi.mock("../../infrastructure/db/prisma", () => ({
  prisma: {
    book: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: BookWhere;
          include?: BookInclude;
        }) => {
          const book = where.id
            ? books.find((b) => b.id === where.id)
            : where.isbn
              ? books.find((b) => b.isbn === where.isbn)
              : undefined;
          if (!book) return null;
          return include?.authors ? withAuthors(book) : book;
        },
      ),
      findMany: vi.fn(
        async ({
          where,
          include,
        }: {
          where: BookWhere;
          include?: BookInclude;
        }) => {
          const matches = books.filter((b) => b.title === where.title);
          return include?.authors ? matches.map(withAuthors) : matches;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: BookWhere;
          include?: BookInclude;
        }) => {
          const matches = books.filter((b) => b.title === where.title);
          const book = matches[0];
          if (!book) return null;
          return include?.authors ? withAuthors(book) : book;
        },
      ),
      create: vi.fn(
        async ({ data }: { data: { title: string; isbn?: string | null } }) => {
          if (data.isbn && books.some((b) => b.isbn === data.isbn)) {
            const err = new Error(
              "Unique constraint failed on the fields: (`isbn`)",
            ) as Error & {
              code: string;
            };
            err.code = "P2002";
            throw err;
          }
          const book: FakeBook = {
            id: genId("book"),
            title: data.title,
            isbn: data.isbn ?? null,
          };
          books.push(book);
          return book;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { isbn?: string | null };
        }) => {
          const book = books.find((b) => b.id === where.id);
          if (!book) throw new Error("book not found");
          if (data.isbn !== undefined) {
            if (
              data.isbn &&
              books.some((b) => b.isbn === data.isbn && b.id !== book.id)
            ) {
              const err = new Error(
                "Unique constraint failed on the fields: (`isbn`)",
              ) as Error & { code: string };
              err.code = "P2002";
              throw err;
            }
            book.isbn = data.isbn;
          }
          return book;
        },
      ),
    },
    author: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { name: string };
          create: { name: string };
        }) => {
          authorUpsertCalls += 1;
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
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const author = authors.find((a) => a.id === where.id);
        if (!author) return null;
        return {
          resolutionMethod: author.resolutionMethod,
          countries: author.countries,
        };
      }),
    },
    bookAuthor: {
      upsert: vi.fn(async ({ create }: { create: FakeBookAuthor }) => {
        bookAuthorUpsertCalls += 1;
        const exists = bookAuthors.some(
          (ba) =>
            ba.bookId === create.bookId && ba.authorId === create.authorId,
        );
        if (!exists) bookAuthors.push(create);
        return create;
      }),
      create: vi.fn(async ({ data }: { data: FakeBookAuthor }) => {
        bookAuthorCreateCalls += 1;
        bookAuthors.push(data);
        return data;
      }),
    },
    reading: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            bookId: string;
            dateRead: Date | null;
            rating: number | null;
            source: string;
          };
        }) => {
          const reading = { id: genId("reading"), ...data };
          readings.push(reading);
          return reading;
        },
      ),
    },
  },
}));

vi.mock("../nationality-resolution/wikidata-resolver", () => ({
  resolveAuthorNationality: vi.fn(async (name: string) => ({
    method: ResolutionMethod.Wikidata,
    confidence: 1,
    reasoning: "mock",
    needsReview: false,
    iso3s:
      name === "Knut Hamsun" ? ["NOR"] : name === "Roxane Gay" ? ["USA"] : [],
  })),
}));

vi.mock("../../infrastructure/db/prisma-author-resolution-repository", () => ({
  persistResolution: vi.fn(async (authorId: string, r: { iso3s: string[] }) => {
    const author = authors.find((a) => a.id === authorId);
    if (!author) return true;
    author.resolutionMethod = ResolutionMethod.Wikidata;
    author.countries = r.iso3s.map((iso3) => ({ iso3 }));
    return true;
  }),
}));

const { addReading } = await import("./reading-service");
const { resolveAuthorNationality } =
  await import("../nationality-resolution/wikidata-resolver");

const HUNGER_ISBN = canonicalizeIsbn("9780374531102")!;

function seedBook(opts: {
  title: string;
  isbn?: string | null;
  authors: { name: string; iso3s?: string[] }[];
}): FakeBook {
  const book: FakeBook = {
    id: genId("book"),
    title: opts.title,
    isbn: opts.isbn ?? null,
  };
  books.push(book);
  for (const a of opts.authors) {
    let author = authors.find((x) => x.name === a.name);
    if (!author) {
      author = {
        id: genId("author"),
        name: a.name,
        resolutionMethod: a.iso3s?.length
          ? ResolutionMethod.Wikidata
          : ResolutionMethod.Unresolved,
        countries: (a.iso3s ?? []).map((iso3) => ({ iso3 })),
      };
      authors.push(author);
    }
    bookAuthors.push({ bookId: book.id, authorId: author.id });
  }
  return book;
}

async function log(raw: {
  title: string;
  authors: string;
  isbn?: string;
  bookId?: string;
}) {
  const parsed = normalizeReadingInput(raw);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("normalize failed");
  return addReading(parsed.value, "user1");
}

describe("addReading", () => {
  beforeEach(() => {
    resetFakeDb();
    vi.mocked(resolveAuthorNationality).mockClear();
  });

  it("creates a new book instead of reusing one with the same title but a different author", async () => {
    await log({ title: "Hunger", authors: "Knut Hamsun" });
    expect(books).toHaveLength(1);
    const originalBookId = books[0].id;

    await log({ title: "Hunger", authors: "Roxane Gay" });

    expect(books).toHaveLength(2);
    const newBook = books.find((b) => b.id !== originalBookId);
    expect(newBook).toBeDefined();

    const roxane = authors.find((a) => a.name === "Roxane Gay")!;
    const hamsun = authors.find((a) => a.name === "Knut Hamsun")!;
    const newBookAuthorIds = bookAuthors
      .filter((ba) => ba.bookId === newBook!.id)
      .map((ba) => ba.authorId);
    expect(newBookAuthorIds).toEqual([roxane.id]);
    expect(newBookAuthorIds).not.toContain(hamsun.id);
  });

  it("reuses Gay's Hunger on a re-read, not Hamsun's (findMany, not findFirst)", async () => {
    await log({ title: "Hunger", authors: "Knut Hamsun" });
    await log({ title: "Hunger", authors: "Roxane Gay" });
    expect(books).toHaveLength(2);
    const gayBook = books.find((b) =>
      bookAuthors.some(
        (ba) =>
          ba.bookId === b.id &&
          authors.find((a) => a.id === ba.authorId)?.name === "Roxane Gay",
      ),
    )!;

    authorUpsertCalls = 0;
    bookAuthorUpsertCalls = 0;
    bookAuthorCreateCalls = 0;
    vi.mocked(resolveAuthorNationality).mockClear();

    const result = await log({ title: "Hunger", authors: "Roxane Gay" });

    expect(books).toHaveLength(2);
    expect(readings).toHaveLength(3);
    expect(readings[2].bookId).toBe(gayBook.id);
    expect(authorUpsertCalls).toBe(0);
    expect(bookAuthorUpsertCalls).toBe(0);
    expect(bookAuthorCreateCalls).toBe(0);
    expect(resolveAuthorNationality).not.toHaveBeenCalled();
    expect(result.countries).toEqual(["USA"]);
  });

  it("still reuses the existing book when title and author set both match (a re-read)", async () => {
    await log({ title: "Homegoing", authors: "Yaa Gyasi" });
    expect(books).toHaveLength(1);

    await log({ title: "Homegoing", authors: "Yaa Gyasi" });

    expect(books).toHaveLength(1);
    expect(readings).toHaveLength(2);
    expect(readings[0].bookId).toBe(readings[1].bookId);
  });

  it("does not attach an extra author when an ISBN hits a book with a different author set", async () => {
    const existing = seedBook({
      title: "Hunger",
      isbn: HUNGER_ISBN,
      authors: [{ name: "Knut Hamsun", iso3s: ["NOR"] }],
    });
    const originalLinks = bookAuthors.length;

    await log({
      title: "Hunger",
      authors: "Knut Hamsun, Extra Person",
      isbn: HUNGER_ISBN,
    });

    expect(books).toHaveLength(2);
    const originalAuthors = bookAuthors
      .filter((ba) => ba.bookId === existing.id)
      .map((ba) => authors.find((a) => a.id === ba.authorId)?.name);
    expect(originalAuthors).toEqual(["Knut Hamsun"]);
    expect(bookAuthors.filter((ba) => ba.bookId === existing.id)).toHaveLength(
      1,
    );
    expect(bookAuthors.length).toBeGreaterThan(originalLinks);

    const created = books.find((b) => b.id !== existing.id)!;
    expect(created.isbn).toBeNull();
    expect(created.title).toBe("Hunger");
    const createdNames = bookAuthors
      .filter((ba) => ba.bookId === created.id)
      .map((ba) => authors.find((a) => a.id === ba.authorId)?.name)
      .sort();
    expect(createdNames).toEqual(["Extra Person", "Knut Hamsun"]);
    expect(existing.title).toBe("Hunger");
    expect(readings[0].bookId).toBe(created.id);
  });

  it("reuses on ISBN hit when the author set matches, without rewriting authors or title", async () => {
    const existing = seedBook({
      title: "Hunger",
      isbn: HUNGER_ISBN,
      authors: [{ name: "Knut Hamsun", iso3s: ["NOR"] }],
    });

    const result = await log({
      title: "Sult",
      authors: "Knut Hamsun",
      isbn: HUNGER_ISBN,
    });

    expect(books).toHaveLength(1);
    expect(existing.title).toBe("Hunger");
    expect(bookAuthors).toHaveLength(1);
    expect(readings[0].bookId).toBe(existing.id);
    expect(result.countries).toEqual(["NOR"]);
    expect(resolveAuthorNationality).not.toHaveBeenCalled();
  });

  it("backfills ISBN on title+author reuse only when the row is null and the ISBN-13 is free", async () => {
    const existing = seedBook({
      title: "Homegoing",
      isbn: null,
      authors: [{ name: "Yaa Gyasi", iso3s: ["GHA", "USA"] }],
    });

    await log({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      isbn: "978-0-306-40615-7",
    });

    expect(books).toHaveLength(1);
    expect(existing.isbn).toBe("9780306406157");
  });

  it("does not backfill ISBN on title+author reuse when that ISBN-13 is already taken", async () => {
    const homegoing = seedBook({
      title: "Homegoing",
      isbn: null,
      authors: [{ name: "Yaa Gyasi", iso3s: ["GHA"] }],
    });
    seedBook({
      title: "Other",
      isbn: "9780306406157",
      authors: [{ name: "Someone Else" }],
    });

    await log({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      isbn: "9780306406157",
    });

    expect(homegoing.isbn).toBeNull();
    expect(books).toHaveLength(2);
    expect(readings[0].bookId).toBe(homegoing.id);
  });

  it("creates without ISBN when the ISBN-13 is already taken by a different work", async () => {
    seedBook({
      title: "Hunger",
      isbn: HUNGER_ISBN,
      authors: [{ name: "Knut Hamsun", iso3s: ["NOR"] }],
    });

    await log({
      title: "Different Book",
      authors: "Someone New",
      isbn: HUNGER_ISBN,
    });

    expect(books).toHaveLength(2);
    const created = books.find((b) => b.title === "Different Book")!;
    expect(created.isbn).toBeNull();
  });

  it("reuses a library-pick bookId without changing title or authors", async () => {
    const existing = seedBook({
      title: "Homegoing",
      isbn: null,
      authors: [{ name: "Yaa Gyasi", iso3s: ["GHA"] }],
    });

    const result = await log({
      title: "Homecoming",
      authors: "Someone Else",
      bookId: existing.id,
      isbn: "978-0-306-40615-7",
    });

    expect(books).toHaveLength(1);
    expect(existing.title).toBe("Homegoing");
    expect(bookAuthors).toHaveLength(1);
    expect(authors.some((a) => a.name === "Someone Else")).toBe(false);
    expect(existing.isbn).toBe("9780306406157");
    expect(result.countries).toEqual(["GHA"]);
    expect(resolveAuthorNationality).not.toHaveBeenCalled();
  });

  it("falls through when bookId is unknown", async () => {
    await log({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      bookId: "does-not-exist",
    });

    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("Homegoing");
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
});
