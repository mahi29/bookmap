/** Strip separators and return a compact ISBN-10 or ISBN-13, or null if it isn't one. */
export function normalizeIsbn(raw: string): string | null {
  const compact = raw.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{13}$/.test(compact)) return compact;
  if (/^\d{9}[\dX]$/.test(compact)) return compact;
  return null;
}

/** True when the whole query string is an ISBN (not a title that happens to contain digits). */
export function looksLikeIsbnQuery(raw: string): boolean {
  return normalizeIsbn(raw.trim()) !== null;
}
