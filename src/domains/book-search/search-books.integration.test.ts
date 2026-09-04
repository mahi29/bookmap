import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BookSearchHit } from "./search-books";

interface FakeLibraryBook {
  title: string;
  isbn: string | null;
  authors: { author: { name: string } }[];
}

let library: FakeLibraryBook[];

vi.mock("../../infrastructure/db/prisma", () => ({
  prisma: {
    book: {
      findMany: vi.fn(
        async (args: {
          where?: {
            OR?: unknown[];
            title?: { contains: string; mode: string };
            isbn?: string | { in: string[] };
          };
        }) => {
          const titleContains =
            args.where?.title?.contains ??
            (
              args.where?.OR as { title?: { contains: string } }[] | undefined
            )?.find((c) => c.title)?.title?.contains;
          const isbnEquals =
            typeof args.where?.isbn === "string"
              ? args.where.isbn
              : args.where?.isbn && "in" in args.where.isbn
                ? args.where.isbn.in
                : (
                    args.where?.OR as
                      { isbn?: string | { in: string[] } }[] | undefined
                  )?.find((c) => c.isbn)?.isbn;

          return library.filter((b) => {
            if (titleContains) {
              return b.title
                .toLowerCase()
                .includes(titleContains.toLowerCase());
            }
            if (typeof isbnEquals === "string") {
              return b.isbn === isbnEquals;
            }
            if (Array.isArray(isbnEquals)) {
              return b.isbn !== null && isbnEquals.includes(b.isbn);
            }
            return false;
          });
        },
      ),
    },
  },
}));

const googleSearch = vi.fn();
vi.mock("./google-books", () => ({
  searchGoogleBooks: (...args: unknown[]) => googleSearch(...args),
}));

const { searchBooks } = await import("./search-books");

describe("searchBooks", () => {
  beforeEach(() => {
    library = [
      {
        title: "Man's Search for Meaning",
        isbn: "9780807014271",
        authors: [{ author: { name: "Viktor E. Frankl" } }],
      },
      {
        title: "Homegoing",
        isbn: null,
        authors: [{ author: { name: "Yaa Gyasi" } }],
      },
    ];
    googleSearch.mockReset();
    googleSearch.mockResolvedValue([
      {
        title: "Night",
        authors: ["Elie Wiesel"],
        isbn: "9780374500016",
        year: "2006",
        source: "google",
      } satisfies BookSearchHit,
    ]);
  });

  it("returns [] for a query that is too short", async () => {
    expect(await searchBooks("M")).toEqual([]);
    expect(googleSearch).not.toHaveBeenCalled();
  });

  it("lists matching library books first, then Google Books hits", async () => {
    const hits = await searchBooks("Man's Search");
    expect(hits[0]).toMatchObject({
      title: "Man's Search for Meaning",
      source: "library",
      authors: ["Viktor E. Frankl"],
    });
    expect(hits[1]).toMatchObject({ title: "Night", source: "google" });
    expect(hits).toHaveLength(2);
  });

  it("looks up library books by ISBN as well as title", async () => {
    googleSearch.mockResolvedValue([]);
    const hits = await searchBooks("978-0-8070-1427-1");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.isbn).toBe("9780807014271");
    expect(hits[0]?.source).toBe("library");
  });

  it("still returns library hits when Google Books fails", async () => {
    googleSearch.mockRejectedValue(new Error("network"));
    const hits = await searchBooks("Homegoing");
    expect(hits).toEqual([
      {
        title: "Homegoing",
        authors: ["Yaa Gyasi"],
        isbn: null,
        year: null,
        source: "library",
      },
    ]);
  });
});
