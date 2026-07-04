import { prisma } from "../../infrastructure/db/prisma";
import {
  hashPassword,
  verifyPassword,
} from "../../infrastructure/auth/password";
import type { Credentials } from "./validate-credentials";

// Auth use cases: signup and login against the User table. Input is assumed already
// validated/normalized by validate-credentials.ts. Session/cookie handling lives in
// infrastructure/auth/session.ts — this module knows nothing about HTTP.

export interface AuthenticatedUser {
  userId: string;
  username: string;
}

export type AuthResult =
  { ok: true; value: AuthenticatedUser } | { ok: false; error: string };

// One message for unknown-user and wrong-password so responses don't reveal which
// usernames exist.
const BAD_CREDENTIALS = "Wrong username or password.";

// Compared against when the user doesn't exist, so both login failure paths cost one
// bcrypt comparison (no timing oracle on username existence). Hash of an arbitrary
// throwaway string; never matches because the paths that use it already failed lookup.
const DUMMY_HASH =
  "$2b$10$q7iIiIcrkkTQdKKGDUxfIe7dSJKN0GVxPCiSqnFEUJZdsviAB9u3W";

export async function signup(credentials: Credentials): Promise<AuthResult> {
  const passwordHash = await hashPassword(credentials.password);
  try {
    const user = await prisma.user.create({
      data: { username: credentials.username, passwordHash },
    });
    return { ok: true, value: { userId: user.id, username: user.username } };
  } catch (error) {
    // Unique-constraint violation on username (Prisma error code P2002).
    if (
      error instanceof Error &&
      (error as Error & { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: "That username is taken." };
    }
    throw error;
  }
}

export async function login(credentials: Credentials): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { username: credentials.username },
  });
  const matches = await verifyPassword(
    credentials.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !matches) return { ok: false, error: BAD_CREDENTIALS };
  return { ok: true, value: { userId: user.id, username: user.username } };
}
