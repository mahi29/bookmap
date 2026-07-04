// Auth domain: pure validation/normalization of signup/login credentials. No I/O and
// no hashing here — see auth-service.ts for the use cases and infrastructure/auth for
// the mechanisms.

export interface Credentials {
  username: string;
  password: string;
}

export type CredentialsResult =
  { ok: true; value: Credentials } | { ok: false; error: string };

const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;

/** Pure: validate + normalize raw credentials. Usernames are trimmed and lowercased. */
export function validateCredentials(raw: Credentials): CredentialsResult {
  const username = raw.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error:
        "Username must be 3–30 characters: lowercase letters, digits, - or _.",
    };
  }

  // Passwords are taken verbatim (no trim — leading/trailing spaces are legal).
  if (raw.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  return { ok: true, value: { username, password: raw.password } };
}
