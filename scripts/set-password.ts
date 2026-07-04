import { prisma } from "../src/infrastructure/db/prisma";
import { validateCredentials } from "../src/domains/auth/validate-credentials";
import { hashPassword } from "../src/infrastructure/auth/password";
import { runScript } from "./shared";

// Set (or reset) a user's password directly — how a bootstrap account created LOCKED
// by the migration or seed gets claimed, since signup rejects existing usernames.
//
//   npm run db:set-password -- <username> <new-password>

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    throw new Error(
      "Usage: npm run db:set-password -- <username> <new-password>",
    );
  }

  const parsed = validateCredentials({ username, password });
  if (!parsed.ok) throw new Error(parsed.error);

  const passwordHash = await hashPassword(parsed.value.password);
  const updated = await prisma.user.updateMany({
    where: { username: parsed.value.username },
    data: { passwordHash },
  });
  if (updated.count === 0) {
    throw new Error(`No user named "${parsed.value.username}".`);
  }
  console.log(`Password updated for ${parsed.value.username}.`);
}

runScript(main);
