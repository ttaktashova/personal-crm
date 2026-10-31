// Applies pending Drizzle migrations and exits.
// Plain JS so it runs in the production image without dev tools: the deploy starts it
// as a one-off container before the new app version. Locally use `pnpm db:migrate`.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The deploy log is public, so a failed migration prints only codes and schema names:
// the error itself carries the query and, in `detail`, the values of the failing row.
// The same field rules as in src/db/database-error.ts: change both.
const CODE_PATTERN = /^[0-9A-Z_]{1,64}$/;
const NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_CAUSE_DEPTH = 10;

function findSafeField(error, field, pattern) {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const value = current[field];
    if (typeof value === "string") {
      return pattern.test(value) ? value : undefined;
    }
    current = current.cause;
  }
  return undefined;
}

function describeError(error) {
  const code = findSafeField(error, "code", CODE_PATTERN);
  const table = findSafeField(error, "table_name", NAME_PATTERN);
  const column = findSafeField(error, "column_name", NAME_PATTERN);
  const constraint = findSafeField(error, "constraint_name", NAME_PATTERN);

  const details = [`code ${code ?? "unknown"}`];
  if (table) details.push(`table ${table}`);
  if (column) details.push(`column ${column}`);
  if (constraint) details.push(`constraint ${constraint}`);
  return details.join(", ");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Migrations failed: DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (error) {
  console.error(`Migrations failed (${describeError(error)})`);
  process.exitCode = 1;
} finally {
  await client.end();
}
