import type { ParsedImportRow } from "./csv-import";
import { normalizeIsbn } from "./isbn";

export type { ParsedImportRow };

export interface CatalogAuthor {
  id: string;
  name: string;
}

export interface CatalogBook {
  id: string;
  title: string;
  isbn: string | null;
  authors: CatalogAuthor[];
}

export interface CatalogReading {
  bookId: string;
  dateRead: string | null;
}

export interface ImportCatalog {
  books: CatalogBook[];
  authors: CatalogAuthor[];
  readings: CatalogReading[];
}

export type PlannedAuthor =
  | {
      kind: "existing";
      authorId: string;
      csvName: string;
      matchedName: string;
    }
  | { kind: "new"; name: string };

export type BindPlan = {
  warnings: string[];
} & (
  | { kind: "existing"; bookId: string }
  | {
      kind: "create";
      title: string;
      isbn: string | null;
      authors: PlannedAuthor[];
    }
);

export interface BookCandidate {
  id: string;
  title: string;
  authors: string[];
  isbn: string | null;
}

export interface AuthorCandidate {
  id: string;
  name: string;
}

export type AmbiguousMatch =
  | {
      kind: "book";
      row: ParsedImportRow;
      reason: string;
      candidates: BookCandidate[];
    }
  | {
      kind: "author";
      row: ParsedImportRow;
      reason: string;
      query: string;
      candidates: AuthorCandidate[];
    };

export interface ReadyMatch {
  row: ParsedImportRow;
  plan: BindPlan;
}

export interface IncompleteMatch {
  row: ParsedImportRow;
  reason: string;
}

export interface DuplicateMatch {
  row: ParsedImportRow;
}

export interface MatchResult {
  ready: ReadyMatch[];
  ambiguous: AmbiguousMatch[];
  incomplete: IncompleteMatch[];
  duplicates: DuplicateMatch[];
}

export type UserResolution =
  | { type: "useBook"; bookId: string }
  | { type: "useAuthor"; authorId: string }
  | { type: "create"; authors: string };

export type ApplyResolutionResult =
  { ok: true; plan: BindPlan } | { ok: false; error: string };

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function lastName(value: string): string {
  const parts = foldText(value).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function authorSet(book: CatalogBook): Set<string> {
  return new Set(book.authors.map((a) => foldText(a.name)));
}

function plannedAuthorSet(authors: PlannedAuthor[]): Set<string> {
  return new Set(
    authors.map((a) =>
      a.kind === "existing" ? foldText(a.matchedName) : foldText(a.name),
    ),
  );
}

function bookCandidate(book: CatalogBook): BookCandidate {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors.map((a) => a.name),
    isbn: book.isbn,
  };
}

type AuthorBind =
  | { status: "ok"; planned: PlannedAuthor[]; warnings: string[] }
  | { status: "ambiguous"; query: string; candidates: CatalogAuthor[] };

function bindAuthorName(
  csvName: string,
  authors: CatalogAuthor[],
):
  | { status: "ok"; planned: PlannedAuthor; warning?: string }
  | { status: "ambiguous"; query: string; candidates: CatalogAuthor[] } {
  const folded = foldText(csvName);
  const exact = authors.filter((a) => foldText(a.name) === folded);
  if (exact.length === 1) {
    const author = exact[0];
    return {
      status: "ok",
      planned: {
        kind: "existing",
        authorId: author.id,
        csvName,
        matchedName: author.name,
      },
    };
  }

  const tokens = csvName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const needle = lastName(csvName);
    const byLast = authors.filter((a) => lastName(a.name) === needle);
    if (byLast.length === 1) {
      const author = byLast[0];
      return {
        status: "ok",
        planned: {
          kind: "existing",
          authorId: author.id,
          csvName,
          matchedName: author.name,
        },
        warning: `Matched “${csvName}” to existing author “${author.name}”.`,
      };
    }
    if (byLast.length > 1) {
      return { status: "ambiguous", query: csvName, candidates: byLast };
    }
  }

  return { status: "ok", planned: { kind: "new", name: csvName.trim() } };
}

function bindAuthors(names: string[], authors: CatalogAuthor[]): AuthorBind {
  const planned: PlannedAuthor[] = [];
  const warnings: string[] = [];
  for (const name of names) {
    const bound = bindAuthorName(name, authors);
    if (bound.status === "ambiguous") {
      return {
        status: "ambiguous",
        query: bound.query,
        candidates: bound.candidates,
      };
    }
    planned.push(bound.planned);
    if (bound.warning) warnings.push(bound.warning);
  }
  return { status: "ok", planned, warnings };
}

function booksByIsbn(isbn: string, books: CatalogBook[]): CatalogBook[] {
  return books.filter((b) => b.isbn && normalizeIsbn(b.isbn) === isbn);
}

function booksByTitle(title: string, books: CatalogBook[]): CatalogBook[] {
  const folded = foldText(title);
  return books.filter((b) => foldText(b.title) === folded);
}

function booksByTitleAndAuthors(
  titleHits: CatalogBook[],
  authors: PlannedAuthor[],
): CatalogBook[] {
  const wanted = plannedAuthorSet(authors);
  return titleHits.filter((b) => setsEqual(authorSet(b), wanted));
}

type InternalMatch =
  | { status: "ready"; plan: BindPlan }
  | { status: "incomplete"; reason: string }
  | {
      status: "ambiguous";
      kind: "book";
      reason: string;
      candidates: CatalogBook[];
    }
  | {
      status: "ambiguous";
      kind: "author";
      reason: string;
      query: string;
      candidates: CatalogAuthor[];
    };

function matchOne(row: ParsedImportRow, catalog: ImportCatalog): InternalMatch {
  const isbn = row.isbn ? normalizeIsbn(row.isbn) : null;

  if (isbn) {
    const isbnHits = booksByIsbn(isbn, catalog.books);
    if (isbnHits.length === 1) {
      const book = isbnHits[0];
      const warnings: string[] = [];
      if (row.title && foldText(row.title) !== foldText(book.title)) {
        warnings.push(
          `ISBN matched “${book.title}”; CSV title was “${row.title}”.`,
        );
      }
      return {
        status: "ready",
        plan: { kind: "existing", bookId: book.id, warnings },
      };
    }
    if (isbnHits.length > 1) {
      return {
        status: "ambiguous",
        kind: "book",
        reason: "Several books share this ISBN.",
        candidates: isbnHits,
      };
    }
    if (!row.title) {
      return {
        status: "incomplete",
        reason:
          "ISBN not found in the catalog. Add a title to create a new book.",
      };
    }
  }

  if (!row.title) {
    return {
      status: "incomplete",
      reason: "Each row needs a title or a catalog ISBN.",
    };
  }

  const titleHits = booksByTitle(row.title, catalog.books);

  if (row.authors.length === 0) {
    if (titleHits.length === 1) {
      return {
        status: "ready",
        plan: { kind: "existing", bookId: titleHits[0].id, warnings: [] },
      };
    }
    if (titleHits.length > 1) {
      return {
        status: "ambiguous",
        kind: "book",
        reason:
          "Several books share this title. Pick one, or add an author to create a new one.",
        candidates: titleHits,
      };
    }
    return {
      status: "incomplete",
      reason: "No matching book, and no author to create one.",
    };
  }

  const bound = bindAuthors(row.authors, catalog.authors);
  if (bound.status === "ambiguous") {
    return {
      status: "ambiguous",
      kind: "author",
      reason: `Several authors could match “${bound.query}”. Pick one.`,
      query: bound.query,
      candidates: bound.candidates,
    };
  }

  const authorHits = booksByTitleAndAuthors(titleHits, bound.planned);
  if (authorHits.length === 1) {
    return {
      status: "ready",
      plan: {
        kind: "existing",
        bookId: authorHits[0].id,
        warnings: bound.warnings,
      },
    };
  }
  if (authorHits.length > 1) {
    return {
      status: "ambiguous",
      kind: "book",
      reason: "Several books match this title and authors.",
      candidates: authorHits,
    };
  }

  return {
    status: "ready",
    plan: {
      kind: "create",
      title: row.title,
      isbn,
      authors: bound.planned,
      warnings: bound.warnings,
    },
  };
}

function identityKey(plan: BindPlan): string {
  if (plan.kind === "existing") return `id:${plan.bookId}`;
  const authorKey = plan.authors
    .map((a) =>
      a.kind === "existing" ? `id:${a.authorId}` : `new:${foldText(a.name)}`,
    )
    .sort()
    .join(",");
  return `new:${foldText(plan.title)}|${authorKey}`;
}

function readingKey(identity: string, dateRead: string | null): string {
  return `${identity}|${dateRead ?? ""}`;
}

function existingReadingKeys(catalog: ImportCatalog): Set<string> {
  const keys = new Set<string>();
  for (const reading of catalog.readings) {
    keys.add(readingKey(`id:${reading.bookId}`, reading.dateRead));
  }
  return keys;
}

/** Pure: classify parsed CSV rows against a catalog snapshot. */
export function matchImportRows(
  rows: ParsedImportRow[],
  catalog: ImportCatalog,
): MatchResult {
  const result: MatchResult = {
    ready: [],
    ambiguous: [],
    incomplete: [],
    duplicates: [],
  };
  const seen = existingReadingKeys(catalog);

  for (const row of rows) {
    const matched = matchOne(row, catalog);
    if (matched.status === "incomplete") {
      result.incomplete.push({ row, reason: matched.reason });
      continue;
    }
    if (matched.status === "ambiguous") {
      if (matched.kind === "book") {
        result.ambiguous.push({
          kind: "book",
          row,
          reason: matched.reason,
          candidates: matched.candidates.map(bookCandidate),
        });
      } else {
        result.ambiguous.push({
          kind: "author",
          row,
          reason: matched.reason,
          query: matched.query,
          candidates: matched.candidates.map((a) => ({
            id: a.id,
            name: a.name,
          })),
        });
      }
      continue;
    }

    const key = readingKey(identityKey(matched.plan), row.dateRead);
    if (seen.has(key)) {
      result.duplicates.push({ row });
      continue;
    }
    seen.add(key);
    result.ready.push({ row, plan: matched.plan });
  }

  return result;
}

function splitAuthors(value: string): string[] {
  return value
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Apply a user's confirm-step choice to an ambiguous row. */
export function applyUserResolution(
  row: ParsedImportRow,
  resolution: UserResolution,
  catalog: ImportCatalog,
): ApplyResolutionResult {
  if (resolution.type === "useBook") {
    const book = catalog.books.find((b) => b.id === resolution.bookId);
    if (!book)
      return { ok: false, error: "That book is no longer in the catalog." };
    return {
      ok: true,
      plan: { kind: "existing", bookId: book.id, warnings: [] },
    };
  }

  if (resolution.type === "create") {
    const title = row.title?.trim() ?? "";
    if (!title) {
      return { ok: false, error: "A title is required to create a new book." };
    }
    const names = splitAuthors(resolution.authors);
    if (names.length === 0) {
      return {
        ok: false,
        error: "An author is required to create a new book.",
      };
    }
    const bound = bindAuthors(names, catalog.authors);
    if (bound.status === "ambiguous") {
      return {
        ok: false,
        error: `Several authors could match “${bound.query}”. Pick one from the list.`,
      };
    }
    return {
      ok: true,
      plan: {
        kind: "create",
        title,
        isbn: row.isbn ? normalizeIsbn(row.isbn) : null,
        authors: bound.planned,
        warnings: bound.warnings,
      },
    };
  }

  const chosen = catalog.authors.find((a) => a.id === resolution.authorId);
  if (!chosen) {
    return { ok: false, error: "That author is no longer in the catalog." };
  }

  const rewritten = row.authors.length
    ? row.authors.map((name) =>
        lastName(name) === lastName(chosen.name) ||
        foldText(name) === foldText(chosen.name)
          ? chosen.name
          : name,
      )
    : [chosen.name];

  const rematch = matchOne({ ...row, authors: rewritten }, catalog);
  if (rematch.status === "ready") return { ok: true, plan: rematch.plan };
  if (rematch.status === "incomplete") {
    return { ok: false, error: rematch.reason };
  }
  return {
    ok: false,
    error: rematch.reason,
  };
}
