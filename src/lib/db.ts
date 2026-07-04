import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7's engine-free client takes a driver adapter instead of a datasource url.
// Postgres (Neon) for both dev and prod: DATABASE_URL selects the branch/database per
// environment (no local-file fallback — there's no sane default connection string).
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — point it at a Postgres connection string (e.g. a Neon branch).",
  );
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Reuse a single client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
