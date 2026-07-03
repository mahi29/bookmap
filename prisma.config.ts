import { defineConfig } from "prisma/config";

// Prisma 7 moves connection config out of schema.prisma. This file is used by the
// Prisma CLI (migrate/generate); the runtime PrismaClient gets a driver adapter in
// src/lib/db.ts. Local dev uses a SQLite file under prisma/.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: "file:./prisma/dev.db",
  },
  migrations: {
    seed: "tsx scripts/seed.ts",
  },
});
