import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7's engine-free client takes a driver adapter instead of a datasource url.
// Local dev points at the SQLite file under prisma/, overridable via DATABASE_URL so a
// future path/Postgres-connection-string change is a pure env-var change. Swapping to
// Postgres later means swapping this adapter (e.g. @prisma/adapter-pg) and the schema
// provider.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

// Reuse a single client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
