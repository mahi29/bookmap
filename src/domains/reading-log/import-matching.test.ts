import { describe, it, expect } from "vitest";
import { matchImportRows, applyUserResolution } from "./import-matching";
import type { ImportCatalog, ParsedImportRow } from "./import-matching";

function row(
  partial: Partial<ParsedImportRow> & Pick<ParsedImportRow, "line">,
): ParsedImportRow {
  return {
    title: null,
    isbn: null,
    authors: [],
    dateRead: null,
    raw: {},
    ...partial,
  };
}

function catalog(overrides: Partial<ImportCatalog> = {}): ImportCatalog {
  return {
    books: [],
    authors: [],
    readings: [],
    ...overrides,
  };
}

const hemingway = { id: "a-hem", name: "Ernest Hemingway" };
const fitzgerald = { id: "a-fitz", name: "F. Scott Fitzgerald" };
const jeffrey = { id: "a-jw", name: "Jeffrey Wilson" };
const robert = { id: "a-rw", name: "Robert Wilson" };
const johnDoe = { id: "a-jd", name: "John Doe" };

const sun = {
  id: "b-sun",
  title: "The Sun Also Rises",
  isbn: "9780743297332",
  authors: [hemingway],
};
const gatsby = {
  id: "b-gatsby",
  title: "The Great Gatsby",
  isbn: null as string | null,
  authors: [fitzgerald],
};
const hungerHamsun = {
  id: "b-hunger-h",
  title: "Hunger",
  isbn: null as string | null,
  authors: [{ id: "a-hamsun", name: "Knut Hamsun" }],
};
const hungerGay = {
  id: "b-hunger-g",
  title: "Hunger",
  isbn: null as string | null,
  authors: [{ id: "a-gay", name: "Roxane Gay" }],
};

describe("matchImportRows", () => {
  it("binds an ISBN-only row to the catalog book with that ISBN", () => {
    const result = matchImportRows(
      [row({ line: 2, isbn: "978-0-7432-9733-2" })],
      catalog({ books: [sun, gatsby], authors: [hemingway, fitzgerald] }),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].plan).toMatchObject({
      kind: "existing",
      bookId: "b-sun",
    });
  });

  it("treats ISBN-10 and ISBN-13 as the same book", () => {
    const book = {
      id: "b-isbn",
      title: "The ISBN Book",
      isbn: "0-306-40615-2",
      authors: [hemingway],
    };
    const result = matchImportRows(
      [row({ line: 2, isbn: "978-0-306-40615-7" })],
      catalog({ books: [book], authors: [hemingway] }),
    );
    expect(result.ready[0].plan).toMatchObject({
      kind: "existing",
      bookId: "b-isbn",
    });
  });

  it("rejects an ISBN-only row that is not in the catalog as incomplete", () => {
    const result = matchImportRows(
      [row({ line: 2, isbn: "9780743297332" })],
      catalog(),
    );
    expect(result.ready).toHaveLength(0);
    expect(result.incomplete).toHaveLength(1);
    expect(result.incomplete[0].reason).toMatch(/isbn/i);
  });

  it("uses a unique title match when no author is given", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "the sun also rises" })],
      catalog({ books: [sun, gatsby], authors: [hemingway, fitzgerald] }),
    );
    expect(result.ready[0].plan).toMatchObject({
      kind: "existing",
      bookId: "b-sun",
    });
  });

  it("surfaces ambiguous titles when no author is given", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "Hunger" })],
      catalog({
        books: [hungerHamsun, hungerGay],
        authors: [
          { id: "a-hamsun", name: "Knut Hamsun" },
          { id: "a-gay", name: "Roxane Gay" },
        ],
      }),
    );
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].kind).toBe("book");
    expect(result.ambiguous[0].candidates.map((c) => c.id).sort()).toEqual([
      "b-hunger-g",
      "b-hunger-h",
    ]);
  });

  it("does not pick a book when a new title has no author", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "Neverwhere" })],
      catalog({ books: [sun], authors: [hemingway] }),
    );
    expect(result.incomplete[0].reason).toMatch(/author/i);
  });

  it("creates a new book when title + author do not match the catalog", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "Neverwhere", authors: ["Neil Gaiman"] })],
      catalog({ books: [sun], authors: [hemingway] }),
    );
    expect(result.ready[0].plan).toMatchObject({
      kind: "create",
      title: "Neverwhere",
    });
    const plan = result.ready[0].plan;
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.authors).toEqual([{ kind: "new", name: "Neil Gaiman" }]);
  });

  it("treats an exact name hit as the same person (Author.name is unique)", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "Some Novel", authors: ["john doe"] })],
      catalog({ books: [], authors: [johnDoe] }),
    );
    const plan = result.ready[0].plan;
    expect(plan.kind).toBe("create");
    if (plan.kind !== "create") return;
    expect(plan.authors).toEqual([
      {
        kind: "existing",
        authorId: "a-jd",
        csvName: "john doe",
        matchedName: "John Doe",
      },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("reuses an existing author by case-insensitive exact name", () => {
    const result = matchImportRows(
      [
        row({
          line: 2,
          title: "A Moveable Feast",
          authors: ["ernest hemingway"],
        }),
      ],
      catalog({ books: [sun], authors: [hemingway] }),
    );
    const plan = result.ready[0].plan;
    expect(plan.kind).toBe("create");
    if (plan.kind !== "create") return;
    expect(plan.authors).toEqual([
      {
        kind: "existing",
        authorId: "a-hem",
        csvName: "ernest hemingway",
        matchedName: "Ernest Hemingway",
      },
    ]);
  });

  it("binds a unique last name (Hemingway) to the catalog author without Wikidata", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "A Moveable Feast", authors: ["Hemingway"] })],
      catalog({ books: [sun], authors: [hemingway, fitzgerald] }),
    );
    const plan = result.ready[0].plan;
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.authors[0]).toMatchObject({
      kind: "existing",
      authorId: "a-hem",
      matchedName: "Ernest Hemingway",
    });
    expect(
      result.ready[0].plan.warnings.some((w) => /Hemingway/i.test(w)),
    ).toBe(true);
  });

  it("does not pick a last name shared by multiple catalog authors", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "Something", authors: ["Wilson"] })],
      catalog({ books: [], authors: [jeffrey, robert] }),
    );
    const ambiguous = result.ambiguous[0];
    expect(ambiguous.kind).toBe("author");
    if (ambiguous.kind !== "author") return;
    expect(ambiguous.candidates.map((c) => c.name).sort()).toEqual([
      "Jeffrey Wilson",
      "Robert Wilson",
    ]);
  });

  it("skips a duplicate reading of the same book on the same date", () => {
    const result = matchImportRows(
      [row({ line: 2, isbn: "9780743297332", dateRead: "2024-01-10" })],
      catalog({
        books: [sun],
        authors: [hemingway],
        readings: [{ bookId: "b-sun", dateRead: "2024-01-10" }],
      }),
    );
    expect(result.ready).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
  });

  it("treats two undated readings of the same book as duplicates", () => {
    const result = matchImportRows(
      [row({ line: 2, title: "The Sun Also Rises" })],
      catalog({
        books: [sun],
        authors: [hemingway],
        readings: [{ bookId: "b-sun", dateRead: null }],
      }),
    );
    expect(result.duplicates).toHaveLength(1);
  });

  it("marks the second identical row in the same file as a duplicate", () => {
    const result = matchImportRows(
      [
        row({ line: 2, title: "The Sun Also Rises", dateRead: "2024-01-10" }),
        row({ line: 3, title: "The Sun Also Rises", dateRead: "2024-01-10" }),
      ],
      catalog({ books: [sun], authors: [hemingway] }),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].row.line).toBe(3);
  });

  it("reuses a book when title + resolved author set match (a re-read on a new date)", () => {
    const result = matchImportRows(
      [
        row({
          line: 2,
          title: "The Sun Also Rises",
          authors: ["Hemingway"],
          dateRead: "2025-06-01",
        }),
      ],
      catalog({
        books: [sun],
        authors: [hemingway],
        readings: [{ bookId: "b-sun", dateRead: "2024-01-10" }],
      }),
    );
    expect(result.ready[0].plan).toMatchObject({
      kind: "existing",
      bookId: "b-sun",
    });
  });
});

describe("applyUserResolution", () => {
  it("binds a chosen catalog book", () => {
    const applied = applyUserResolution(
      row({ line: 2, title: "Hunger" }),
      { type: "useBook", bookId: "b-hunger-g" },
      catalog({ books: [hungerHamsun, hungerGay] }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.plan).toMatchObject({
      kind: "existing",
      bookId: "b-hunger-g",
    });
  });

  it("creates a new book when the user supplies an author", () => {
    const applied = applyUserResolution(
      row({ line: 2, title: "Hunger" }),
      { type: "create", authors: "Roxane Gay" },
      catalog({
        books: [hungerHamsun],
        authors: [{ id: "a-hamsun", name: "Knut Hamsun" }],
      }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.plan.kind).toBe("create");
  });

  it("rejects creating a book without an author", () => {
    const applied = applyUserResolution(
      row({ line: 2, title: "Hunger" }),
      { type: "create", authors: "" },
      catalog(),
    );
    expect(applied.ok).toBe(false);
  });

  it("binds a chosen author and then the matching book", () => {
    const applied = applyUserResolution(
      row({ line: 2, title: "Hunger", authors: ["Gay"] }),
      { type: "useAuthor", authorId: "a-gay" },
      catalog({
        books: [hungerHamsun, hungerGay],
        authors: [
          { id: "a-hamsun", name: "Knut Hamsun" },
          { id: "a-gay", name: "Roxane Gay" },
        ],
      }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.plan).toMatchObject({
      kind: "existing",
      bookId: "b-hunger-g",
    });
  });
});
