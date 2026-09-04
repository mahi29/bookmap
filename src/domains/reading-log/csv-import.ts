import Papa from "papaparse";
import { normalizeIsbn } from "./isbn";

// Generic CSV import parser (v1). StoryGraph exports stay on db:seed;
// this accepts a small header set: title or isbn, optional author, optional date.

export const CSV_IMPORT_ROW_LIMIT = 1000;

export interface ParsedImportRow {
  /** 1-based CSV line number (header is line 1). */
  line: number;
  title: string | null;
  isbn: string | null;
  authors: string[];
  /** Finish date as YYYY-MM-DD, or null if omitted. */
  dateRead: string | null;
  raw: Record<string, string>;
}

export interface InvalidImportRow {
  line: number;
  reason: string;
}

export type ParseCsvResult =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: ParsedImportRow[];
      trimmed: number;
      invalid: InvalidImportRow[];
    };

type Row = Record<string, string>;

interface ColumnMap {
  title?: string;
  isbn?: string;
  author?: string;
  date?: string;
}

const TITLE_HEADERS = new Set(["title", "book", "book title"]);
const ISBN_HEADERS = new Set(["isbn", "isbn uid", "isbn13", "isbn10", "uid"]);
const AUTHOR_HEADERS = new Set(["author", "authors", "author name"]);
const DATE_HEADERS = new Set([
  "date read",
  "date",
  "dateread",
  "finished",
  "date finished",
  "last date read",
  "finished date",
]);

function foldHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function classifyHeader(header: string): keyof ColumnMap | null {
  const folded = foldHeader(header);
  if (TITLE_HEADERS.has(folded)) return "title";
  if (ISBN_HEADERS.has(folded)) return "isbn";
  if (AUTHOR_HEADERS.has(folded)) return "author";
  if (DATE_HEADERS.has(folded)) return "date";
  return null;
}

function mapColumns(fields: string[]): ColumnMap {
  const columns: ColumnMap = {};
  for (const field of fields) {
    const kind = classifyHeader(field);
    if (kind && columns[kind] === undefined) columns[kind] = field;
  }
  return columns;
}

function cell(row: Row, field: string | undefined): string {
  if (!field) return "";
  return (row[field] ?? "").trim();
}

function splitAuthors(value: string): string[] {
  return value
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Parse YYYY-MM-DD or YYYY/MM/DD into YYYY-MM-DD, or null if empty/invalid. */
export function parseImportDate(
  value: string,
): { ok: true; date: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, date: null };
  const match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) return { ok: false };
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const rolledOver =
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d);
  if (Number.isNaN(date.getTime()) || rolledOver) return { ok: false };
  return { ok: true, date: `${y}-${m}-${d}` };
}

function isEmptyRow(row: Row): boolean {
  return Object.values(row).every((v) => String(v ?? "").trim() === "");
}

/** Parse a generic BookMap CSV string into normalized import rows. */
export function parseCsvImport(csv: string): ParseCsvResult {
  if (!csv.trim()) return { ok: false, error: "CSV is empty." };

  const parsed = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const fields = (parsed.meta.fields ?? []).filter(Boolean);
  if (fields.length === 0) return { ok: false, error: "CSV is empty." };

  const columns = mapColumns(fields);
  if (!columns.title && !columns.isbn) {
    return {
      ok: false,
      error: "CSV must include a title or isbn column.",
    };
  }

  const data = parsed.data.filter((row) => !isEmptyRow(row));
  const trimmed = Math.max(0, data.length - CSV_IMPORT_ROW_LIMIT);
  const slice = data.slice(0, CSV_IMPORT_ROW_LIMIT);

  const rows: ParsedImportRow[] = [];
  const invalid: InvalidImportRow[] = [];

  for (let i = 0; i < slice.length; i++) {
    const line = i + 2;
    const rawRow = slice[i];
    const title = cell(rawRow, columns.title) || null;
    const isbnRaw = cell(rawRow, columns.isbn);
    const authors = splitAuthors(cell(rawRow, columns.author));
    const dateResult = parseImportDate(cell(rawRow, columns.date));

    if (!dateResult.ok) {
      invalid.push({
        line,
        reason: "Date must be YYYY-MM-DD or YYYY/MM/DD.",
      });
      continue;
    }

    let isbn: string | null = null;
    if (isbnRaw) {
      isbn = isbnRaw;
      const normalized = normalizeIsbn(isbnRaw);
      if (!normalized) {
        if (!title) {
          invalid.push({
            line,
            reason: "ISBN is not a valid ISBN-10 or ISBN-13.",
          });
          continue;
        }
        isbn = null;
      }
    }

    if (!title && !isbn) {
      invalid.push({ line, reason: "Each row needs a title or isbn." });
      continue;
    }

    rows.push({
      line,
      title,
      isbn,
      authors,
      dateRead: dateResult.date,
      raw: rawRow,
    });
  }

  return { ok: true, rows, trimmed, invalid };
}
