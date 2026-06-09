// Minimal RFC-4180 CSV serialisation. Pure, deterministic, tested. No I/O.
// A field is quoted when it contains a comma, quote, or newline; quotes are doubled.

export function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialise a grid of rows to a CSV string (CRLF line endings, per RFC 4180). */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}
