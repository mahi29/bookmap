import "server-only";
import { cookies } from "next/headers";
import {
  decryptSessionToken,
  encryptSessionToken,
  type SessionPayload,
} from "./session-token";

// Session cookie mechanics: the one place that knows the cookie name, lifetime and
// flags, and the one place (with proxy.ts) that reads SESSION_SECRET from the env.

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set — generate one with `openssl rand -base64 32` and put it in .env.",
    );
  }
  return secret;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await encryptSessionToken(
    payload,
    sessionSecret(),
    `${SESSION_DAYS}d`,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** The decoded session from the request cookie, or null if absent/invalid/expired. */
export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return decryptSessionToken(token, sessionSecret());
}
