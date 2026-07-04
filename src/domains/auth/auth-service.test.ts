import { describe, it, expect, vi, beforeEach } from "vitest";

// --- In-memory fake Prisma, scoped to the User model. Same pattern as
// reading-service.test.ts: a tiny relational fake beats per-call stubs. ---
interface FakeUser {
  id: string;
  username: string;
  passwordHash: string;
}

let users: FakeUser[];
let nextId: number;

function resetFakeDb() {
  users = [];
  nextId = 1;
}

class FakeUniqueConstraintError extends Error {
  code = "P2002";
}

vi.mock("../../infrastructure/db/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { username: string; passwordHash: string };
        }) => {
          if (users.some((u) => u.username === data.username)) {
            throw new FakeUniqueConstraintError("unique constraint");
          }
          const user: FakeUser = { id: `user${nextId++}`, ...data };
          users.push(user);
          return user;
        },
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { username: string } }) =>
          users.find((u) => u.username === where.username) ?? null,
      ),
    },
  },
}));

const { signup, login } = await import("./auth-service");
const { verifyPassword } = await import("../../infrastructure/auth/password");

describe("signup", () => {
  beforeEach(resetFakeDb);

  it("creates a user with a bcrypt hash, never the plaintext", async () => {
    const result = await signup({
      username: "mahith",
      password: "correct-horse",
    });
    expect(result.ok).toBe(true);
    expect(users).toHaveLength(1);
    expect(users[0].passwordHash).not.toContain("correct-horse");
    expect(await verifyPassword("correct-horse", users[0].passwordHash)).toBe(
      true,
    );
  });

  it("rejects a duplicate username with a friendly error", async () => {
    await signup({ username: "mahith", password: "correct-horse" });
    const result = await signup({
      username: "mahith",
      password: "other-password",
    });
    expect(result).toEqual({ ok: false, error: "That username is taken." });
    expect(users).toHaveLength(1);
  });
});

describe("login", () => {
  beforeEach(resetFakeDb);

  it("succeeds with the right password and returns the user", async () => {
    await signup({ username: "mahith", password: "correct-horse" });
    const result = await login({
      username: "mahith",
      password: "correct-horse",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.username).toBe("mahith");
      expect(result.value.userId).toBe(users[0].id);
    }
  });

  it("fails with a wrong password", async () => {
    await signup({ username: "mahith", password: "correct-horse" });
    const result = await login({ username: "mahith", password: "wrong-horse" });
    expect(result.ok).toBe(false);
  });

  it("fails for an unknown user", async () => {
    const result = await login({
      username: "nobody",
      password: "correct-horse",
    });
    expect(result.ok).toBe(false);
  });

  it("fails against a LOCKED bootstrap account", async () => {
    users.push({ id: "user1", username: "mahith", passwordHash: "LOCKED" });
    const result = await login({ username: "mahith", password: "LOCKED" });
    expect(result.ok).toBe(false);
  });

  it("uses one shared error message for unknown user and wrong password", async () => {
    await signup({ username: "mahith", password: "correct-horse" });
    const wrongPw = await login({
      username: "mahith",
      password: "wrong-horse",
    });
    const unknown = await login({
      username: "nobody",
      password: "correct-horse",
    });
    expect(!wrongPw.ok && wrongPw.error).toEqual(!unknown.ok && unknown.error);
  });
});
