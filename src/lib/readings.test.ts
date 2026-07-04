import { describe, it, expect } from "vitest";
import { normalizeReadingInput } from "./readings";

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
});
