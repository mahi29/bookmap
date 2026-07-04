import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: a hashed password verifies against the original", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
  });

  it("does not store the plaintext", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash).not.toContain("correct-horse");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-horse", hash)).toBe(false);
  });

  it("never matches the LOCKED bootstrap sentinel (and does not throw)", async () => {
    expect(await verifyPassword("LOCKED", "LOCKED")).toBe(false);
    expect(await verifyPassword("anything", "LOCKED")).toBe(false);
  });

  it("returns false for any malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-bcrypt-hash")).toBe(false);
  });
});
