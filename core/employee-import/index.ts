// Pure CSV parsing/validation for employee bulk import (Epic 9.1). No I/O. lib validates
// regions against the DB and creates the valid rows; this turns text into typed rows +
// a per-line error report.
//
// Format (header optional): email,firstName,lastName,region,joiningDate(YYYY-MM-DD)

export interface ImportRow {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  regionName: string;
  joiningISO: string;
}

export interface ImportError {
  line: number;
  message: string;
}

export interface ImportResult {
  valid: ImportRow[];
  errors: ImportError[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEADER = ["email", "firstname", "lastname", "region", "joiningdate"];

/** Parse + validate import text. `validRegions` is the set of allowed region names. */
export function parseEmployeeImport(text: string, validRegions: string[]): ImportResult {
  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const regionSet = new Set(validRegions);
  const seenEmails = new Set<string>();

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return; // skip blank lines
    const cols = trimmed.split(",").map((c) => c.trim());
    // Skip a header row.
    if (i === 0 && cols.map((c) => c.toLowerCase()).join(",") === HEADER.join(",")) return;

    if (cols.length < 5) {
      errors.push({ line, message: "Expected 5 columns: email, firstName, lastName, region, joiningDate." });
      return;
    }
    const [email, firstName, lastName, regionName, joiningISO] = cols as [string, string, string, string, string];
    const rowErrors: string[] = [];
    if (!EMAIL_RE.test(email)) rowErrors.push("invalid email");
    else if (seenEmails.has(email.toLowerCase())) rowErrors.push("duplicate email in file");
    if (!firstName) rowErrors.push("missing first name");
    if (!lastName) rowErrors.push("missing last name");
    if (!regionSet.has(regionName)) rowErrors.push(`unknown region "${regionName}"`);
    if (!DATE_RE.test(joiningISO)) rowErrors.push("joiningDate must be YYYY-MM-DD");

    if (rowErrors.length) {
      errors.push({ line, message: rowErrors.join("; ") });
      return;
    }
    seenEmails.add(email.toLowerCase());
    valid.push({ line, email: email.toLowerCase(), firstName, lastName, regionName, joiningISO });
  });

  return { valid, errors };
}
