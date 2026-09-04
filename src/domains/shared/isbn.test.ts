import { describe, it, expect } from "vitest";
import { canonicalizeIsbn } from "./isbn";

describe("canonicalizeIsbn", () => {
  it("strips hyphens and spaces from a valid ISBN-13", () => {
    expect(canonicalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(canonicalizeIsbn("978 0 306 40615 7")).toBe("9780306406157");
  });

  it("accepts a compact ISBN-13 that already has a valid check digit", () => {
    expect(canonicalizeIsbn("9780306406157")).toBe("9780306406157");
    expect(canonicalizeIsbn("9781636281872")).toBe("9781636281872");
  });

  it("accepts a 979-prefix ISBN-13 with a valid check digit", () => {
    expect(canonicalizeIsbn("9791234567896")).toBe("9791234567896");
    expect(canonicalizeIsbn("979-1-234567-89-6")).toBe("9791234567896");
  });

  it("converts a valid ISBN-10 to the equivalent ISBN-13", () => {
    // Well-known pair: 0-306-40615-2 → 978-0-306-40615-7
    expect(canonicalizeIsbn("0-306-40615-2")).toBe("9780306406157");
    expect(canonicalizeIsbn("0306406152")).toBe("9780306406157");
  });

  it("handles the ISBN-10 X check digit", () => {
    expect(canonicalizeIsbn("043942089X")).toBe("9780439420891");
    expect(canonicalizeIsbn("0-439-42089-x")).toBe("9780439420891");
  });

  it("returns null for an ISBN-13 with a bad check digit", () => {
    expect(canonicalizeIsbn("9780306406158")).toBeNull();
    expect(canonicalizeIsbn("978-0-306-40615-8")).toBeNull();
  });

  it("returns null for an ISBN-10 with a bad check digit", () => {
    expect(canonicalizeIsbn("0306406153")).toBeNull();
  });

  it("returns null for 13-digit strings that are not 978/979 ISBNs", () => {
    expect(canonicalizeIsbn("1234567890128")).toBeNull();
    expect(canonicalizeIsbn("0123456789012")).toBeNull();
  });

  it("returns null for other UIDs, ASINs, and garbage", () => {
    expect(canonicalizeIsbn("")).toBeNull();
    expect(canonicalizeIsbn("   ")).toBeNull();
    expect(canonicalizeIsbn(null)).toBeNull();
    expect(canonicalizeIsbn(undefined)).toBeNull();
    expect(canonicalizeIsbn("OL12345678M")).toBeNull();
    expect(canonicalizeIsbn("B00X123456")).toBeNull();
    expect(canonicalizeIsbn("not-an-isbn")).toBeNull();
    expect(canonicalizeIsbn("978")).toBeNull();
    expect(canonicalizeIsbn("Man's Search For Meaning")).toBeNull();
  });
});
