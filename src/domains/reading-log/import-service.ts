import type { Prisma } from "@/generated/prisma/client";
import { ReadingSource } from "../shared/constants";
import { prisma } from "../../infrastructure/db/prisma";
import { parseCsvImport, type InvalidImportRow } from "./csv-import";
import {
  matchImportRows,
  type AmbiguousMatch,
  type BindPlan,
  type DuplicateMatch,
  type ImportCatalog,
  type IncompleteMatch,
  type ParsedImportRow,
  type PlannedAuthor,
  type ReadyMatch,
} from "./import-matching";

// CSV import application service: parse + match against the global catalog, then
// persist confirmed rows. New authors are created unresolved — no Wikidata here
// (a 1000-row import would time out; run db:resolve afterwards).

export interface ImportPreview {
  trimmed: number;
  invalid: InvalidImportRow[];
  ready: ReadyMatch[];
  ambiguous: AmbiguousMatch[];
  incomplete: IncompleteMatch[];
  duplicates: DuplicateMatch[];
}

export type PreviewCsvResult =
  { ok: false; error: string } | { ok: true; preview: ImportPreview };

export interface CommitItem {
  row: ParsedImportRow;
  plan: BindPlan;
}

export interface CommitCsvResult {
  imported: number;
  skippedDup: number;
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function dateFromIso(value: string | null): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Load the global book/author catalog plus this user's readings for matching. */
export async function loadImportCatalog(
  userId: string,
): Promise<ImportCatalog> {
  const [books, authors, readings] = await Promise.all([
    prisma.book.findMany({
      select: {
        id: true,
        title: true,
        isbn: true,
        authors: { select: { author: { select: { id: true, name: true } } } },
      },
    }),
    prisma.author.findMany({ select: { id: true, name: true } }),
    prisma.reading.findMany({
      where: { userId },
      select: { bookId: true, dateRead: true },
    }),
  ]);

  return {
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      isbn: b.isbn,
      authors: b.authors.map((ba) => ba.author),
    })),
    authors,
    readings: readings.map((r) => ({
      bookId: r.bookId,
      dateRead: isoDate(r.dateRead),
    })),
  };
}

/** Parse a CSV and classify each row against the current catalog. No writes. */
export async function previewCsvImport(
  csv: string,
  userId: string,
): Promise<PreviewCsvResult> {
  const parsed = parseCsvImport(csv);
  if (!parsed.ok) return parsed;

  const catalog = await loadImportCatalog(userId);
  const matched = matchImportRows(parsed.rows, catalog);
  return {
    ok: true,
    preview: {
      trimmed: parsed.trimmed,
      invalid: parsed.invalid,
      ...matched,
    },
  };
}

type Tx = Prisma.TransactionClient;

function sameAuthorIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

async function resolveAuthorId(
  tx: Tx,
  planned: PlannedAuthor,
): Promise<string> {
  if (planned.kind === "existing") {
    const found = await tx.author.findUnique({
      where: { id: planned.authorId },
      select: { id: true },
    });
    if (found) return found.id;
    const byName = await tx.author.findUnique({
      where: { name: planned.matchedName },
      select: { id: true },
    });
    if (byName) return byName.id;
  }
  const name = planned.kind === "existing" ? planned.matchedName : planned.name;
  const author = await tx.author.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  return author.id;
}

async function findBookByTitleAndAuthors(
  tx: Tx,
  title: string,
  authorIds: string[],
): Promise<{ id: string } | null> {
  const candidates = await tx.book.findMany({
    where: { title: { equals: title, mode: "insensitive" } },
    select: {
      id: true,
      authors: { select: { authorId: true } },
    },
  });
  const match = candidates.find((book) =>
    sameAuthorIds(
      book.authors.map((ba) => ba.authorId),
      authorIds,
    ),
  );
  return match ? { id: match.id } : null;
}

async function bookIdForPlan(tx: Tx, plan: BindPlan): Promise<string | null> {
  if (plan.kind === "existing") {
    const book = await tx.book.findUnique({
      where: { id: plan.bookId },
      select: { id: true },
    });
    return book?.id ?? null;
  }

  const authorIds: string[] = [];
  for (const planned of plan.authors) {
    authorIds.push(await resolveAuthorId(tx, planned));
  }
  const uniqueAuthorIds = [...new Set(authorIds)];

  const existing = await findBookByTitleAndAuthors(
    tx,
    plan.title,
    uniqueAuthorIds,
  );
  if (existing) return existing.id;

  const created = await tx.book.create({
    data: { title: plan.title, isbn: plan.isbn },
  });
  for (const authorId of uniqueAuthorIds) {
    await tx.bookAuthor.upsert({
      where: { bookId_authorId: { bookId: created.id, authorId } },
      create: { bookId: created.id, authorId },
      update: {},
    });
  }
  return created.id;
}

/**
 * Persist confirmed import rows for a user. Idempotent under
 * (book, dateRead) — a repeat is counted as skippedDup, not an error.
 * Runs in one transaction so a mid-import failure doesn't leave a partial library.
 */
export async function commitCsvImport(
  userId: string,
  filename: string,
  items: CommitItem[],
): Promise<CommitCsvResult> {
  return prisma.$transaction(
    async (tx) => {
      const importRecord = await tx.import.create({
        data: {
          userId,
          source: ReadingSource.Csv,
          filename: filename.trim() || "import.csv",
          rowCount: items.length,
        },
      });

      let imported = 0;
      let skippedDup = 0;

      for (const { row, plan } of items) {
        if (plan.kind === "create" && plan.authors.length === 0) {
          continue;
        }
        const bookId = await bookIdForPlan(tx, plan);
        if (!bookId) continue;

        const dateRead = dateFromIso(row.dateRead);
        const existingReading = await tx.reading.findFirst({
          where: { userId, bookId, dateRead },
          select: { id: true },
        });
        if (existingReading) {
          skippedDup += 1;
          continue;
        }

        await tx.reading.create({
          data: {
            userId,
            bookId,
            dateRead,
            source: ReadingSource.Csv,
            importId: importRecord.id,
            rawRow: JSON.stringify(row.raw),
          },
        });
        imported += 1;
      }

      return { imported, skippedDup };
    },
    { timeout: 60_000 },
  );
}
