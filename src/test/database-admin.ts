import { fileURLToPath } from "node:url";

import postgres from "postgres";

// Relative import: the e2e setup loads this file without the "@/" alias.
import { applyMigrations } from "../db/migrate";

import { assertTestDatabaseName, readDatabaseName, toAdminDatabaseUrl } from "./database-url";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// Runs `run` on a connection to the maintenance database. Every caller names a database
// by its address, and only a name ending with _test gets through.
async function withAdminConnection(
  databaseUrl: string,
  run: (admin: postgres.Sql, name: string) => Promise<void>,
): Promise<void> {
  const name = readDatabaseName(databaseUrl);
  assertTestDatabaseName(name);

  const admin = postgres(toAdminDatabaseUrl(databaseUrl), { max: 1, onnotice: () => {} });
  try {
    await run(admin, name);
  } catch (error) {
    if ((error as { code?: string }).code === "ECONNREFUSED") {
      throw new Error("Cannot reach Postgres. Start the database with: docker compose up -d", {
        cause: error,
      });
    }
    throw error;
  } finally {
    await admin.end();
  }
}

export async function dropDatabase(databaseUrl: string): Promise<void> {
  await withAdminConnection(databaseUrl, async (admin, name) => {
    await admin.unsafe(`drop database if exists ${quoteIdentifier(name)} with (force)`);
  });
}

// A fresh empty database under this address, whatever was there before.
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  await withAdminConnection(databaseUrl, async (admin, name) => {
    await admin.unsafe(`drop database if exists ${quoteIdentifier(name)} with (force)`);
    await admin.unsafe(`create database ${quoteIdentifier(name)}`);
  });
}

// The same, with all migrations applied: the database as the app expects it. The migrations
// create the user with `ownerEmail` and give it the starting groups (see src/db/migrate.ts).
export async function recreateMigratedDatabase(
  databaseUrl: string,
  ownerEmail: string,
): Promise<void> {
  await recreateDatabase(databaseUrl);
  await applyMigrations(databaseUrl, ownerEmail, migrationsFolder);
}
