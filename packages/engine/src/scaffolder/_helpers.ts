// Replace C0/C1 control chars (incl. newlines, nulls) with spaces, then collapse and trim.
/** Sanitize a user-supplied display name for embedding into &NAME store. */
export function sanitizeDisplayName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// In KMN, single-quoted strings have no escape sequence; U+2019 is the typographic equivalent.
/** Escape a string for embedding into a single-quoted KMN string literal. */
export function kmnStringEscape(s: string): string {
  return s.replace(/'/g, "’");
}
