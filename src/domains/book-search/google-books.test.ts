import { describe, it, expect } from "vitest";
import {
  parseGoogleBooksResponse,
  searchGoogleBooks,
  type GoogleBooksVolume,
} from "./google-books";

const frankl: GoogleBooksVolume = {
  volumeInfo: {
    title: "Man's Search for Meaning",
    authors: ["Viktor E. Frankl"],
    publishedDate: "2006-06-01",
    industryIdentifiers: [
      { type: "ISBN_10", identifier: "0807014277" },
      { type: "ISBN_13", identifier: "9780807014271" },
    ],
  },
};

function volume(partial: GoogleBooksVolume["volumeInfo"]): GoogleBooksVolume {
  return { volumeInfo: partial };
}

describe("parseGoogleBooksResponse", () => {
  it("maps title, authors, year, and prefers ISBN-13", () => {
    const hits = parseGoogleBooksResponse({ items: [frankl] }, 5);
    expect(hits).toEqual([
      {
        title: "Man's Search for Meaning",
        authors: ["Viktor E. Frankl"],
        isbn: "9780807014271",
        year: "2006",
        source: "google",
      },
    ]);
  });

  it("falls back to ISBN-10 when ISBN-13 is missing", () => {
    const hits = parseGoogleBooksResponse(
      {
        items: [
          volume({
            title: "Night",
            authors: ["Elie Wiesel"],
            industryIdentifiers: [
              { type: "ISBN_10", identifier: "0374500010" },
            ],
          }),
        ],
      },
      5,
    );
    expect(hits[0]?.isbn).toBe("0374500010");
  });

  it("skips items without a title or authors", () => {
    const hits = parseGoogleBooksResponse(
      {
        items: [
          volume({ title: "Untitled" }),
          volume({ authors: ["Someone"] }),
          volume({
            title: "Good Omens",
            authors: ["Neil Gaiman", "Terry Pratchett"],
          }),
        ],
      },
      5,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("Good Omens");
    expect(hits[0]?.authors).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("caps results at the given limit", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      volume({ title: `Book ${i}`, authors: ["A"] }),
    );
    expect(parseGoogleBooksResponse({ items }, 5)).toHaveLength(5);
  });

  it("returns an empty list for missing or empty payloads", () => {
    expect(parseGoogleBooksResponse({}, 5)).toEqual([]);
    expect(parseGoogleBooksResponse({ items: [] }, 5)).toEqual([]);
  });
});

describe("searchGoogleBooks", () => {
  it("queries by isbn: when the input looks like an ISBN", async () => {
    let requested: string | null = null;
    const stubFetch = (async (input: string | URL) => {
      requested = input.toString();
      return {
        ok: true,
        json: async () => ({ items: [frankl] }),
      } as Response;
    }) as unknown as typeof fetch;

    const hits = await searchGoogleBooks("978-0-8070-1427-1", stubFetch);
    expect(requested).toContain("q=isbn%3A9780807014271");
    expect(requested).toContain("maxResults=5");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("Man's Search for Meaning");
  });

  it("sends the raw title query otherwise", async () => {
    let requested: string | null = null;
    const stubFetch = (async (input: string | URL) => {
      requested = input.toString();
      return { ok: true, json: async () => ({ items: [] }) } as Response;
    }) as unknown as typeof fetch;

    await searchGoogleBooks("Man's Search For Meaning", stubFetch);
    expect(requested).toContain("q=Man%27s+Search+For+Meaning");
    expect(requested).not.toContain("isbn%3A");
  });

  it("returns [] when Google Books is down", async () => {
    const stubFetch = (async () =>
      ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }) as Response) as unknown as typeof fetch;
    await expect(searchGoogleBooks("Hunger", stubFetch)).resolves.toEqual([]);
  });
});
