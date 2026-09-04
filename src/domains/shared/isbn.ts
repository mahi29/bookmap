// Shared kernel: fold any ISBN-shaped string to a compact ISBN-13, or null.
// Stored Book.isbn values are this form (978/979 + valid check digit) or null —
// never hyphenated, never ISBN-10, never other UIDs.

/**
 * Compact ISBN-13 (978/979 + valid check digit), or null if `raw` is not a real ISBN.
 * Strips separators, converts ISBN-10 → 13, and drops anything else (ASINs, OL ids, garbage).
 */
export function canonicalizeIsbn(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const compact = raw.replace(/[^\dXx]/g, "").toUpperCase();
  if (compact.length === 13) {
    return isValidIsbn13(compact) ? compact : null;
  }
  if (compact.length === 10) {
    return isbn10To13(compact);
  }
  return null;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  return isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12];
}

function isbn10To13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return null;
  if (!isValidIsbn10(isbn10)) return null;
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${isbn13CheckDigit(body)}`;
}

function isValidIsbn10(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(isbn[i]) * (10 - i);
  }
  const check = isbn[9] === "X" ? 10 : Number(isbn[9]);
  if (!Number.isFinite(check)) return false;
  sum += check;
  return sum % 11 === 0;
}

function isbn13CheckDigit(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(body12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}
