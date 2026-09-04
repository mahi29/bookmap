import { describe, it, expect } from "vitest";
import {
  isbnStillValid,
  mapLibraryBook,
  mergeSearchHits,
  type BookSearchHit,
} from "./hits";

const libraryFrankl: BookSearchHit = {
  title: "Man's Search for Meaning",
  authors: ["Viktor E. Frankl"],
  isbn: "9780807014271",
  year: null,
  source: "library",
};

const googleFrankl: BookSearchHit = {
  title: "Man's Search for Meaning",
  authors: ["Viktor E. Frankl"],
  isbn: "9780807014271",
  year: "2006",
  source: "google",
};

const googleNight: BookSearchHit = {
  title: "Night",
  authors: ["Elie Wiesel"],
  isbn: "9780374500016",
  year: "2006",
  source: "google",
};

const googleHunger: BookSearchHit = {
  title: "Hunger",
  authors: ["Knut Hamsun"],
  isbn: "9780374531102",
  year: "2008",
  source: "google",
};

describe("mapLibraryBook", () => {
  it("maps a stored book and its authors into a library hit", () => {
    expect(
      mapLibraryBook({
        title: "Good Omens",
        isbn: "9780060853983",
        authors: [
          { author: { name: "Neil Gaiman" } },
          { author: { name: "Terry Pratchett" } },
        ],
      }),
    ).toEqual({
      title: "Good Omens",
      authors: ["Neil Gaiman", "Terry Pratchett"],
      isbn: "9780060853983",
      year: null,
      source: "library",
    });
  });
});

describe("mergeSearchHits", () => {
  it("puts library hits first and fills remaining slots from Google Books", () => {
    expect(
      mergeSearchHits([libraryFrankl], [googleNight, googleHunger], 5),
    ).toEqual([libraryFrankl, googleNight, googleHunger]);
  });

  it("drops a Google hit that duplicates a library ISBN", () => {
    expect(
      mergeSearchHits([libraryFrankl], [googleFrankl, googleNight], 5),
    ).toEqual([libraryFrankl, googleNight]);
  });

  it("drops a Google hit that matches a library title and author set even without ISBN", () => {
    const localNoIsbn: BookSearchHit = {
      ...libraryFrankl,
      isbn: null,
    };
    const googleNoIsbn: BookSearchHit = {
      ...googleFrankl,
      isbn: null,
    };
    expect(
      mergeSearchHits([localNoIsbn], [googleNoIsbn, googleNight], 5),
    ).toEqual([localNoIsbn, googleNight]);
  });

  it("caps the merged list at the given limit", () => {
    const google = [googleNight, googleHunger, googleFrankl];
    const extra: BookSearchHit[] = [
      {
        title: "Homegoing",
        authors: ["Yaa Gyasi"],
        isbn: "9781101947135",
        year: "2016",
        source: "google",
      },
      {
        title: "Beloved",
        authors: ["Toni Morrison"],
        isbn: "9781400033416",
        year: "2004",
        source: "google",
      },
    ];
    expect(mergeSearchHits([], [...google, ...extra], 5)).toHaveLength(5);
  });
});

describe("isbnStillValid", () => {
  const selected = {
    title: "Man's Search for Meaning",
    authors: ["Viktor E. Frankl"],
    isbn: "9780807014271",
  };

  it("keeps the ISBN when title and authors are unchanged", () => {
    expect(
      isbnStillValid(selected, {
        title: "Man's Search for Meaning",
        authors: ["Viktor E. Frankl"],
      }),
    ).toBe(true);
  });

  it("treats the ISBN as invalid once the title is edited", () => {
    expect(
      isbnStillValid(selected, {
        title: "Man's Search for Meaning (edited)",
        authors: ["Viktor E. Frankl"],
      }),
    ).toBe(false);
  });

  it("treats the ISBN as invalid once the authors are edited", () => {
    expect(
      isbnStillValid(selected, {
        title: "Man's Search for Meaning",
        authors: ["Someone Else"],
      }),
    ).toBe(false);
  });
});
