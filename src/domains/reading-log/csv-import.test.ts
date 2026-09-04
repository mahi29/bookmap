import { describe, it, expect } from "vitest";
import { parseCsvImport, CSV_IMPORT_ROW_LIMIT } from "./csv-import";

const iso = (d: string | null) => d;

describe("parseCsvImport", () => {
  it("parses title, author, and date read with case-insensitive headers", () => {
    const csv = `Title,Author,Date Read
Homegoing,Yaa Gyasi,2026-03-01
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trimmed).toBe(0);
    expect(result.invalid).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      title: "Homegoing",
      authors: ["Yaa Gyasi"],
      isbn: null,
    });
    expect(iso(result.rows[0].dateRead)).toBe("2026-03-01");
  });

  it("accepts ISBN instead of title", () => {
    const csv = `ISBN,Date Read
978-0-306-40615-7,2024/01/10
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBeNull();
    expect(result.rows[0].isbn).toBe("978-0-306-40615-7");
    expect(result.rows[0].dateRead).toBe("2024-01-10");
  });

  it("treats author and date as optional", () => {
    const csv = `title
Dune
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].authors).toEqual([]);
    expect(result.rows[0].dateRead).toBeNull();
  });

  it("splits comma-separated authors", () => {
    const csv = `title,authors
Good Omens,"Neil Gaiman, Terry Pratchett"
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].authors).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("maps ISBN/UID and Last Date Read aliases", () => {
    const csv = `Title,ISBN/UID,Last Date Read
Dune,9780441172719,2025/02/01
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].isbn).toBe("9780441172719");
    expect(result.rows[0].dateRead).toBe("2025-02-01");
  });

  it("rejects a file with no title or isbn column", () => {
    const csv = `foo,bar
a,b
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/title or isbn/i);
  });

  it("flags a row missing both title and isbn as invalid", () => {
    const csv = `title,isbn,author
, ,Yaa Gyasi
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reason).toMatch(/title or isbn/i);
  });

  it("flags an unparseable date as invalid", () => {
    const csv = `title,date read
Dune,not-a-date
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0].reason).toMatch(/date/i);
  });

  it("flags a non-ISBN value in the isbn column as invalid when there is no title", () => {
    const csv = `isbn
abc
`;
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0].reason).toMatch(/isbn/i);
  });

  it("trims rows past the 1000-row cap instead of rejecting the file", () => {
    const header = "title";
    const extra = 7;
    const lines = Array.from(
      { length: CSV_IMPORT_ROW_LIMIT + extra },
      (_, i) => `Book ${i + 1}`,
    );
    const csv = [header, ...lines].join("\n");
    const result = parseCsvImport(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(CSV_IMPORT_ROW_LIMIT);
    expect(result.trimmed).toBe(extra);
    expect(result.rows[0].title).toBe("Book 1");
    expect(result.rows[CSV_IMPORT_ROW_LIMIT - 1].title).toBe(
      `Book ${CSV_IMPORT_ROW_LIMIT}`,
    );
  });

  it("rejects an empty file", () => {
    const result = parseCsvImport("");
    expect(result.ok).toBe(false);
  });
});
