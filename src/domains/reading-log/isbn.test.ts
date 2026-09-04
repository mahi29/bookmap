import { describe, it, expect } from "vitest";
import { normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it("strips hyphens and spaces from ISBN-13", () => {
    expect(normalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(normalizeIsbn("978 0306406157")).toBe("9780306406157");
  });

  it("converts ISBN-10 to the equivalent ISBN-13", () => {
    // Well-known pair: 0-306-40615-2 → 978-0-306-40615-7
    expect(normalizeIsbn("0-306-40615-2")).toBe("9780306406157");
    expect(normalizeIsbn("0306406152")).toBe("9780306406157");
  });

  it("handles the ISBN-10 X check digit", () => {
    expect(normalizeIsbn("043942089X")).toBe("9780439420891");
  });

  it("returns null for empty or garbage input", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("   ")).toBeNull();
    expect(normalizeIsbn("not-an-isbn")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
  });
});
