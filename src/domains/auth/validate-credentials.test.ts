import { describe, expect, it } from "vitest";
import { validateCredentials } from "./validate-credentials";

describe("validateCredentials", () => {
  it("accepts a valid username and password", () => {
    const result = validateCredentials({
      username: "mahith",
      password: "correct-horse",
    });
    expect(result).toEqual({
      ok: true,
      value: { username: "mahith", password: "correct-horse" },
    });
  });

  it("trims and lowercases the username", () => {
    const result = validateCredentials({
      username: "  Mahith ",
      password: "correct-horse",
    });
    expect(result.ok && result.value.username).toBe("mahith");
  });

  it("rejects a username shorter than 3 characters", () => {
    const result = validateCredentials({
      username: "ab",
      password: "longenough",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a username longer than 30 characters", () => {
    const result = validateCredentials({
      username: "a".repeat(31),
      password: "longenough",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects usernames with characters outside [a-z0-9_-]", () => {
    for (const username of ["ma hith", "mahith!", "mähith", "ma.hith"]) {
      const result = validateCredentials({ username, password: "longenough" });
      expect(result.ok, username).toBe(false);
    }
  });

  it("accepts digits, hyphens and underscores in usernames", () => {
    const result = validateCredentials({
      username: "book-reader_29",
      password: "longenough",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = validateCredentials({
      username: "mahith",
      password: "short12",
    });
    expect(result.ok).toBe(false);
  });

  it("does not trim the password", () => {
    const result = validateCredentials({
      username: "mahith",
      password: "  spaces ok  ",
    });
    expect(result.ok && result.value.password).toBe("  spaces ok  ");
  });

  it("rejects an empty username", () => {
    const result = validateCredentials({
      username: "   ",
      password: "longenough",
    });
    expect(result.ok).toBe(false);
  });
});
