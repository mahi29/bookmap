import { describe, it, expect } from "vitest";
import { parseStoryGraphCsv } from "./storygraph-import";

// A reduced but valid StoryGraph export. Papaparse maps by header name, so we only
// include the columns the parser reads. Rows are fabricated (no personal data).
const CSV = `Title,Authors,ISBN/UID,Read Status,Last Date Read,Dates Read,Read Count,Star Rating
Memento Mori,Eunice Hong,9781636281872,read,2025/04/12,2025/04/08-2025/04/12,1,4.5
Good Omens,"Neil Gaiman, Terry Pratchett",978-0-06-085398-3,read,2024/01/10,,1,5
The Every,Dave Eggers,,to-read,,,0,
Dune,Frank Herbert,0-441-17271-7,read,2025/02/01,"2020/01/01-2020/01/15, 2025/01/20-2025/02/01",2,5
Not a Book,A. N. Author,OL12345678M,read,2025/01/01,,1,
`;

function byTitle(title: string) {
  const books = parseStoryGraphCsv(CSV);
  const book = books.find((b) => b.title === title);
  if (!book) throw new Error(`missing ${title}`);
  return book;
}

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("parseStoryGraphCsv", () => {
  it("parses every non-empty row into a book", () => {
    expect(parseStoryGraphCsv(CSV)).toHaveLength(5);
  });

  it("splits a single-author field", () => {
    expect(byTitle("Memento Mori").authors).toEqual(["Eunice Hong"]);
  });

  it("splits multiple comma-separated authors", () => {
    expect(byTitle("Good Omens").authors).toEqual([
      "Neil Gaiman",
      "Terry Pratchett",
    ]);
  });

  it("captures the ISBN, or null when blank", () => {
    expect(byTitle("Memento Mori").isbn).toBe("9781636281872");
    expect(byTitle("The Every").isbn).toBeNull();
  });

  it("canonicalizes hyphenated ISBN-13 and ISBN-10 to compact ISBN-13", () => {
    expect(byTitle("Good Omens").isbn).toBe("9780060853983");
    expect(byTitle("Dune").isbn).toBe("9780441172719");
  });

  it("drops other UIDs that are not real ISBNs", () => {
    expect(byTitle("Not a Book").isbn).toBeNull();
  });

  it("parses a date range into started + read dates (UTC)", () => {
    const [reading] = byTitle("Memento Mori").readings;
    expect(iso(reading.dateStarted)).toBe("2025-04-08");
    expect(iso(reading.dateRead)).toBe("2025-04-12");
    expect(reading.rating).toBe(4.5);
  });

  it("falls back to Last Date Read when Dates Read is empty", () => {
    const readings = byTitle("Good Omens").readings;
    expect(readings).toHaveLength(1);
    expect(iso(readings[0].dateStarted)).toBeNull();
    expect(iso(readings[0].dateRead)).toBe("2024-01-10");
  });

  it("produces no readings for an unread book", () => {
    expect(byTitle("The Every").readings).toHaveLength(0);
  });

  it("produces one reading per date range on a re-read", () => {
    const readings = byTitle("Dune").readings;
    expect(readings).toHaveLength(2);
    expect(iso(readings[0].dateRead)).toBe("2020-01-15");
    expect(iso(readings[1].dateStarted)).toBe("2025-01-20");
    expect(iso(readings[1].dateRead)).toBe("2025-02-01");
  });
});
