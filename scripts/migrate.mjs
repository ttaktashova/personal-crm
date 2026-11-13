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

// The owner's email: 0008_assign_data_to_owner gives it the data that was there before sign-in.
// SQL cannot read environment variables, so it goes into the Postgres setting app.owner_email
// of the connection that migrates. Checked before connecting, by the same simple rule as the
// migration, so the log says what is wrong instead of a bare code. The value is never printed.
// The same steps as in src/db/migrate.ts: change both.
const OWNER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isOwnerEmail(value) {
  const email = value?.trim() ?? "";
  return email.length <= 254 && OWNER_EMAIL_PATTERN.test(email);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Migrations failed: DATABASE_URL is not set");
  process.exit(1);
}

const ownerEmail = process.env.OWNER_EMAIL;
if (!isOwnerEmail(ownerEmail)) {
  console.error("Migrations failed: OWNER_EMAIL is not set or is not an email");
  process.exit(1);
}

// One connection: the setting lives in it.
const client = postgres(url, { max: 1, onnotice: () => {} });

try {
  await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (error) {
  console.error(`Migrations failed (${describeError(error)})`);
  process.exitCode = 1;
} finally {
  await client.end();
}
