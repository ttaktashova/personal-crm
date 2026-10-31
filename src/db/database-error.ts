// A database error that is safe to write to the app log: it keeps only error codes
// and schema names. Drizzle puts the query and all its values into the message of
// a failed query, and Postgres puts row values into `detail`, `where` and sometimes
// `message`, so none of those are copied and the original error is not kept as `cause`.
// scripts/migrate.mjs repeats the same field rules for migration errors: change both.

const CODE_PATTERN = /^[0-9A-Z_]{1,64}$/; // "23514", "42P01", "ECONNREFUSED"
const NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/; // table, column and constraint names
const MAX_CAUSE_DEPTH = 10;

// The first string value of `field` in the error and its `cause` chain
// (Drizzle → postgres.js → Node network error), if it looks like a code or a name.
function findSafeField(error: unknown, field: string, pattern: RegExp): string | undefined {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const value = (current as Record<string, unknown>)[field];
    if (typeof value === "string") {
      return pattern.test(value) ? value : undefined;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export class DatabaseError extends Error {
  readonly label: string;
  readonly code: string | undefined;
  readonly table: string | undefined;
  readonly column: string | undefined;
  readonly constraint: string | undefined;

  // `label` names the query that failed, usually the function it is in: "createContact".
  constructor(label: string, error: unknown) {
    const code = findSafeField(error, "code", CODE_PATTERN);
    const table = findSafeField(error, "table_name", NAME_PATTERN);
    const column = findSafeField(error, "column_name", NAME_PATTERN);
    const constraint = findSafeField(error, "constraint_name", NAME_PATTERN);

    const details = [`code ${code ?? "unknown"}`];
    if (table) details.push(`table ${table}`);
    if (column) details.push(`column ${column}`);
    if (constraint) details.push(`constraint ${constraint}`);

    super(`Database query failed: ${label} (${details.join(", ")})`);
    this.name = "DatabaseError";
    this.label = label;
    this.code = code;
    this.table = table;
    this.column = column;
    this.constraint = constraint;
  }
}
