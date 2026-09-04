// ISBN helpers for the CSV importer. Matching compares a canonical ISBN-13 so
// hyphenated ISBN-10 and ISBN-13 for the same edition collapse to one key.

/** Strip punctuation and fold ISBN-10 to ISBN-13; null if the value isn't an ISBN. */
export function normalizeIsbn(raw: string): string | null {
  const cleaned = raw.replace(/[^\dXx]/g, "").toUpperCase();
  if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) return cleaned;
  if (cleaned.length === 10 && /^\d{9}[\dX]$/.test(cleaned)) {
    return isbn10To13(cleaned);
  }
  return null;
}

function isbn10To13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${isbn13CheckDigit(body)}`;
}

function isbn13CheckDigit(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(body12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}
