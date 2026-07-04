import { defineConfig } from "prisma/config";

// Prisma 7 moves connection config out of schema.prisma. This file is used by the
// Prisma CLI (migrate/generate); the runtime PrismaClient gets a driver adapter in
// src/lib/db.ts. Local dev uses a SQLite file under prisma/, overridable via DATABASE_URL
// so a future path/Postgres-connection-string change is a pure env-var change.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
  migrations: {
    seed: "tsx scripts/seed.ts",
  },
});
