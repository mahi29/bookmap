import { describe, it, expect } from "vitest";
import { looksLikeIsbnQuery, normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it("strips hyphens and spaces from an ISBN-13", () => {
    expect(normalizeIsbn("978-0-8070-1426-4")).toBe("9780807014264");
    expect(normalizeIsbn("978 0807014264")).toBe("9780807014264");
  });

  it("uppercases an ISBN-10 check digit X", () => {
    expect(normalizeIsbn("0-8044-2845-x")).toBe("080442845X");
  });

  it("returns null for values that are not ISBN-10 or ISBN-13", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("Man's Search For Meaning")).toBeNull();
    expect(normalizeIsbn("978")).toBeNull();
    expect(normalizeIsbn("12345678901234")).toBeNull();
  });
});

describe("looksLikeIsbnQuery", () => {
  it("detects ISBN-10 and ISBN-13 queries, including hyphenated forms", () => {
    expect(looksLikeIsbnQuery("9780807014264")).toBe(true);
    expect(looksLikeIsbnQuery("978-0-8070-1426-4")).toBe(true);
    expect(looksLikeIsbnQuery("080442845X")).toBe(true);
  });

  it("rejects ordinary titles and short digit strings", () => {
    expect(looksLikeIsbnQuery("Man's Search For Meaning")).toBe(false);
    expect(looksLikeIsbnQuery("1984")).toBe(false);
    expect(looksLikeIsbnQuery("")).toBe(false);
  });
});
