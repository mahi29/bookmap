import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7's engine-free client takes a driver adapter instead of a datasource url.
// Postgres (Neon) for both dev and prod: DATABASE_URL selects the branch/database per
// environment (no local-file fallback — there's no sane default connection string).
//
// Next.js auto-loads .env for `next dev`/`build`/`start`, but every scripts/*.ts file
// imports this module directly via tsx, which does not — load it here once so no
// script needs to remember to (this is also why per-script `process.loadEnvFile()`
// calls don't reliably help: transpiled imports are hoisted above a script's own
// top-level statements, so this module can execute before that call would run).
// A no-op in deployed environments, where secrets are injected directly and there's
// no .env file on disk.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — point it at a Postgres connection string (e.g. a Neon branch).",
  );
}

// Neon's connection strings use sslmode=require, which pg-connection-string currently
// treats as an alias for verify-full (full certificate verification) but warns will
// follow weaker libpq semantics in the next major version. Pin the current, stronger
// behavior explicitly so nothing silently weakens on a future dependency bump.
function withExplicitSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode === "prefer" || mode === "require" || mode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

const adapter = new PrismaPg({
  connectionString: withExplicitSslMode(process.env.DATABASE_URL),
});

// Reuse a single client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
