import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

describe("readSession", () => {
  const previousSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    cookiesMock.mockReset();
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    process.env.SESSION_SECRET = previousSecret;
  });

  it("returns null when the cookie is absent, even without SESSION_SECRET", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toBeNull();
  });
});
