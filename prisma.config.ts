import { defineConfig } from "prisma/config";

// Prisma 7 moves connection config out of schema.prisma. This file is used by the
// Prisma CLI (migrate/generate); the runtime PrismaClient gets a driver adapter in
// src/lib/db.ts. Postgres (Neon) for both dev and prod — DATABASE_URL selects the
// branch/database per environment.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — point it at a Postgres connection string (e.g. a Neon branch).",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx scripts/seed.ts",
  },
});
