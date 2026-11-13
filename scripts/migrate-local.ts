// Applies pending migrations to the database of .env: pnpm db:migrate
// Reads .env the same way Next.js does: the connection (DATABASE_URL or POSTGRES_*) and
// OWNER_EMAIL, the user who gets the data that was there before sign-in (see src/db/migrate.ts).
// The production image runs scripts/migrate.mjs instead.

import { loadEnvConfig } from "@next/env";

import { DatabaseError } from "../src/db/database-error";
import { getDatabaseUrl } from "../src/db/database-url";
import { applyMigrations, isOwnerEmail, NO_OWNER_EMAIL_MESSAGE } from "../src/db/migrate";

async function main() {
  loadEnvConfig(process.cwd());

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!isOwnerEmail(ownerEmail)) {
    console.error(`Migrations failed: ${NO_OWNER_EMAIL_MESSAGE}`);
    process.exitCode = 1;
    return;
  }

  try {
    await applyMigrations(getDatabaseUrl(), ownerEmail, "./drizzle");
    console.log("Migrations applied.");
  } catch (error) {
    // Only codes and schema names, like the app's log: the error carries row values.
    const { code, table, column, constraint } = new DatabaseError("migrations", error);
    const details = [`code ${code ?? "unknown"}`];
    if (table) details.push(`table ${table}`);
    if (column) details.push(`column ${column}`);
    if (constraint) details.push(`constraint ${constraint}`);
    console.error(`Migrations failed (${details.join(", ")})`);
    process.exitCode = 1;
  }
}

main();
