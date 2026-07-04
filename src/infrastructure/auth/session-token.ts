import { jwtVerify, SignJWT } from "jose";

// Session-token mechanism: sign/verify the JWT that session.ts stores in the cookie.
// The secret is a parameter (not read from env here) so this stays testable and the
// env lookup lives in one place (session.ts / proxy.ts).

export interface SessionPayload {
  userId: string;
  username: string;
}

const ALG = "HS256";

export async function encryptSessionToken(
  payload: SessionPayload,
  secret: string,
  expiresIn: string,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

/** Decode + verify a session token; null for missing/tampered/expired tokens. */
export async function decryptSessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        algorithms: [ALG],
      },
    );
    if (
      typeof payload.userId !== "string" ||
      typeof payload.username !== "string"
    )
      return null;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
