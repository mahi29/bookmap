import { describe, it, expect } from "vitest";
import { normalizeReadingInput } from "./normalize-reading";

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
    expect(r.value.isbn).toBeNull();
    expect(r.value.bookId).toBeNull();
  });

  it("canonicalizes a hyphenated ISBN-10 to compact ISBN-13", () => {
    const r = normalizeReadingInput({
      title: "The Art of Computer Programming",
      authors: "Donald Knuth",
      isbn: "0-306-40615-2",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isbn).toBe("9780306406157");
  });

  it("drops garbage ISBNs and other UIDs rather than failing", () => {
    const r = normalizeReadingInput({
      title: "X",
      authors: "A",
      isbn: "OL12345678M",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isbn).toBeNull();
  });

  it("trims a library-pick bookId", () => {
    const r = normalizeReadingInput({
      title: "Homegoing",
      authors: "Yaa Gyasi",
      bookId: "  book123  ",
    });
    expect(r.ok && r.value.bookId).toBe("book123");
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
