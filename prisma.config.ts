import { defineConfig } from "prisma/config";

// Prisma 7 moves connection config out of schema.prisma. This file is used by the
// Prisma CLI (migrate/generate); the runtime PrismaClient gets a driver adapter in
// src/lib/db.ts, using DATABASE_URL directly (see that file).
//
// The CLI here prefers DIRECT_URL: Neon's pooled connection (used by DATABASE_URL at
// runtime, so serverless invocations don't exhaust Postgres's connection limit) runs
// PgBouncer in transaction mode, which doesn't reliably support the advisory locks
// `prisma migrate` uses — migrations need the unpooled connection. Falls back to
// DATABASE_URL so a single-connection-string setup still works.
const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!directUrl) {
  throw new Error(
    "DIRECT_URL (or DATABASE_URL) is not set — point it at a Postgres connection string.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: directUrl,
  },
  migrations: {
    seed: "tsx scripts/seed.ts",
  },
});
