import bcrypt from "bcryptjs";

// Password hashing mechanism (bcryptjs — pure JS, no native bindings to break on
// Vercel). The domain rule it encodes: a stored hash that isn't bcrypt-shaped (e.g.
// the "LOCKED" sentinel on bootstrap/seeded accounts) can never match any password.

const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** True iff `password` matches `storedHash`. Never throws on malformed hashes. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  // bcrypt hashes always start with "$2"; anything else (empty, "LOCKED", garbage)
  // is a non-credential and must never authenticate.
  if (!storedHash.startsWith("$2")) return false;
  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}
