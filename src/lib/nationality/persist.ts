import type { Prisma } from "@/generated/prisma/client";
import { ResolutionMethod } from "../../domains/shared/constants";
import { prisma } from "../../infrastructure/db/prisma";
import type { ResolutionResult } from "./resolve";

// The single place that writes an author's resolution to the database. Every resolver
// (Wikidata, LLM) and the add-reading flow funnel their result through persistResolution,
// so the mapping from a ResolutionResult to DB columns lives in exactly one spot, and the
// "manual picks are user truth" invariant is enforced here rather than in each caller.

/** Anything shaped like our Prisma client: the module client, or a `$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

/** Query filter for the authors automated resolution may touch (everything but manual). */
export const NON_MANUAL = {
  resolutionMethod: { not: ResolutionMethod.Manual },
} as const;

type ResolutionWrite = ResolutionResult & { wikidataId?: string | null };

/**
 * Write an automated resolution onto an Author, replacing its map countries. Never
 * overwrites a manual pick — returns false (and writes nothing) if the author is manual.
 * `wikidataId` is only updated when present (the LLM path leaves it untouched).
 */
export async function persistResolution(
  authorId: string,
  result: ResolutionWrite,
): Promise<boolean> {
  const author = await prisma.author.findUnique({
    where: { id: authorId },
    select: { resolutionMethod: true },
  });
  if (author?.resolutionMethod === ResolutionMethod.Manual) return false;

  await prisma.author.update({
    where: { id: authorId },
    data: {
      resolutionMethod: result.method,
      confidence: result.confidence,
      reasoning: result.reasoning,
      needsReview: result.needsReview,
      ...(result.wikidataId !== undefined
        ? { wikidataId: result.wikidataId }
        : {}),
      resolvedAt: new Date(),
      countries: {
        deleteMany: {},
        create: result.iso3s.map((iso3) => ({ iso3 })),
      },
    },
  });
  return true;
}

/**
 * Set an author's map countries as a manual pick — user truth that automated resolution
 * never overrides. Used by db:set and by the seed's preserve-across-reseed step.
 *
 * Accepts an optional `db` client so callers running inside a `prisma.$transaction`
 * (e.g. the seed script) can pass the transaction client and keep the write atomic
 * with the rest of their operation.
 */
export async function setManualCountries(
  authorId: string,
  iso3s: string[],
  opts: { reasoning?: string | null; confidence?: number | null } = {},
  db: Db = prisma,
): Promise<void> {
  await db.author.update({
    where: { id: authorId },
    data: {
      resolutionMethod: ResolutionMethod.Manual,
      confidence: opts.confidence ?? 1,
      reasoning: opts.reasoning ?? "Set manually",
      needsReview: false,
      resolvedAt: new Date(),
      countries: {
        deleteMany: {},
        create: iso3s.map((iso3) => ({ iso3 })),
      },
    },
  });
}
