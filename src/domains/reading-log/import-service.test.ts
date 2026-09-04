import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReadingSource } from "../shared/constants";

interface FakeAuthor {
  id: string;
  name: string;
}
interface FakeBook {
  id: string;
  title: string;
  isbn: string | null;
}
interface FakeBookAuthor {
  bookId: string;
  authorId: string;
}
interface FakeReading {
  id: string;
  userId: string;
  bookId: string;
  dateRead: Date | null;
  source: string;
  importId: string | null;
  rawRow: string | null;
}
interface FakeImport {
  id: string;
  userId: string;
  source: string;
  filename: string;
  rowCount: number;
}

let authors: FakeAuthor[];
let books: FakeBook[];
let bookAuthors: FakeBookAuthor[];
let readings: FakeReading[];
let imports: FakeImport[];
let nextId: number;

function reset() {
  authors = [];
  books = [];
  bookAuthors = [];
  readings = [];
  imports = [];
  nextId = 1;
}

function gen(prefix: string) {
  return `${prefix}${nextId++}`;
}

const fake = {
  book: {
    findMany: vi.fn(
      async (args: {
        where?: { title?: { equals: string; mode?: string } };
        select?: {
          authors?: { select?: { author?: unknown; authorId?: unknown } };
        };
      }) => {
        let list = books;
        if (args.where?.title?.equals) {
          const needle = args.where.title.equals.toLowerCase();
          list = list.filter((b) => b.title.toLowerCase() === needle);
        }
        return list.map((book) => {
          const links = bookAuthors.filter((ba) => ba.bookId === book.id);
          if (args.select?.authors?.select?.author) {
            return {
              ...book,
              authors: links.map((ba) => ({
                author: authors.find((a) => a.id === ba.authorId)!,
              })),
            };
          }
          return {
            id: book.id,
            authors: links.map((ba) => ({ authorId: ba.authorId })),
          };
        });
      },
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const book = books.find((b) => b.id === where.id);
      return book ? { id: book.id } : null;
    }),
    create: vi.fn(
      async ({ data }: { data: { title: string; isbn: string | null } }) => {
        const book: FakeBook = { id: gen("book"), ...data };
        books.push(book);
        return book;
      },
    ),
  },
  author: {
    findMany: vi.fn(async () =>
      authors.map((a) => ({ id: a.id, name: a.name })),
    ),
    findUnique: vi.fn(
      async ({ where }: { where: { id?: string; name?: string } }) => {
        const author = where.id
          ? authors.find((a) => a.id === where.id)
          : authors.find((a) => a.name === where.name);
        return author ? { id: author.id } : null;
      },
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { name: string };
        create: { name: string };
      }) => {
        let author = authors.find((a) => a.name === where.name);
        if (!author) {
          author = { id: gen("author"), name: create.name };
          authors.push(author);
        }
        return author;
      },
    ),
  },
  bookAuthor: {
    upsert: vi.fn(async ({ create }: { create: FakeBookAuthor }) => {
      const exists = bookAuthors.some(
        (ba) => ba.bookId === create.bookId && ba.authorId === create.authorId,
      );
      if (!exists) bookAuthors.push(create);
      return create;
    }),
  },
  reading: {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      readings
        .filter((r) => r.userId === where.userId)
        .map((r) => ({ bookId: r.bookId, dateRead: r.dateRead })),
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { userId: string; bookId: string; dateRead: Date | null };
      }) => {
        const found = readings.find(
          (r) =>
            r.userId === where.userId &&
            r.bookId === where.bookId &&
            (r.dateRead?.toISOString() ?? null) ===
              (where.dateRead?.toISOString() ?? null),
        );
        return found ? { id: found.id } : null;
      },
    ),
    create: vi.fn(async ({ data }: { data: Omit<FakeReading, "id"> }) => {
      const reading = { id: gen("reading"), ...data };
      readings.push(reading);
      return reading;
    }),
  },
  import: {
    create: vi.fn(async ({ data }: { data: Omit<FakeImport, "id"> }) => {
      const record = { id: gen("import"), ...data };
      imports.push(record);
      return record;
    }),
  },
  $transaction: vi.fn(async (fn: (tx: typeof fake) => Promise<unknown>) =>
    fn(fake),
  ),
};

vi.mock("../../infrastructure/db/prisma", () => ({
  prisma: fake,
}));

const { previewCsvImport, commitCsvImport } = await import("./import-service");

function seedHemingwayBook() {
  authors.push({ id: "a-hem", name: "Ernest Hemingway" });
  books.push({
    id: "b-sun",
    title: "The Sun Also Rises",
    isbn: "9780743297332",
  });
  bookAuthors.push({ bookId: "b-sun", authorId: "a-hem" });
}

describe("previewCsvImport", () => {
  beforeEach(() => {
    reset();
  });

  it("returns a file-level error for a CSV with no title or isbn column", async () => {
    const result = await previewCsvImport("foo,bar\na,b\n", "user1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/title or isbn/i);
  });

  it("classifies a new title with no author as incomplete", async () => {
    const result = await previewCsvImport("title\nNeverwhere\n", "user1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.incomplete).toHaveLength(1);
    expect(result.preview.ready).toHaveLength(0);
  });

  it("binds an ISBN-only row to the catalog book", async () => {
    seedHemingwayBook();
    const result = await previewCsvImport("isbn\n9780743297332\n", "user1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.ready).toHaveLength(1);
    expect(result.preview.ready[0].plan).toMatchObject({
      kind: "existing",
      bookId: "b-sun",
    });
  });
});

describe("commitCsvImport", () => {
  beforeEach(() => {
    reset();
  });

  it("reuses an existing author (same name = same person) and does not call Wikidata", async () => {
    authors.push({ id: "a-jd", name: "John Doe" });
    const result = await commitCsvImport("user1", "books.csv", [
      {
        row: {
          line: 2,
          title: "Some Novel",
          isbn: null,
          authors: ["John Doe"],
          dateRead: "2024-01-10",
          raw: { title: "Some Novel", author: "John Doe" },
        },
        plan: {
          kind: "create",
          title: "Some Novel",
          isbn: null,
          authors: [
            {
              kind: "existing",
              authorId: "a-jd",
              csvName: "John Doe",
              matchedName: "John Doe",
            },
          ],
          warnings: [],
        },
      },
    ]);

    expect(result.imported).toBe(1);
    expect(authors).toHaveLength(1);
    expect(authors[0].id).toBe("a-jd");
    expect(readings[0].source).toBe(ReadingSource.Csv);
    expect(readings[0].userId).toBe("user1");
    expect(imports[0].source).toBe(ReadingSource.Csv);
  });

  it("creates a new unresolved author without a Wikidata lookup", async () => {
    const result = await commitCsvImport("user1", "books.csv", [
      {
        row: {
          line: 2,
          title: "Neverwhere",
          isbn: null,
          authors: ["Neil Gaiman"],
          dateRead: null,
          raw: { title: "Neverwhere" },
        },
        plan: {
          kind: "create",
          title: "Neverwhere",
          isbn: null,
          authors: [{ kind: "new", name: "Neil Gaiman" }],
          warnings: [],
        },
      },
    ]);

    expect(result.imported).toBe(1);
    expect(authors).toHaveLength(1);
    expect(authors[0].name).toBe("Neil Gaiman");
    expect(books[0].title).toBe("Neverwhere");
  });

  it("skips a duplicate reading of the same book on the same date", async () => {
    seedHemingwayBook();
    readings.push({
      id: "r1",
      userId: "user1",
      bookId: "b-sun",
      dateRead: new Date("2024-01-10T00:00:00.000Z"),
      source: ReadingSource.Manual,
      importId: null,
      rawRow: null,
    });

    const result = await commitCsvImport("user1", "books.csv", [
      {
        row: {
          line: 2,
          title: "The Sun Also Rises",
          isbn: "9780743297332",
          authors: [],
          dateRead: "2024-01-10",
          raw: {},
        },
        plan: { kind: "existing", bookId: "b-sun", warnings: [] },
      },
    ]);

    expect(result.imported).toBe(0);
    expect(result.skippedDup).toBe(1);
    expect(readings).toHaveLength(1);
  });
});
