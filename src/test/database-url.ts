import { loadEnvConfig } from "@next/env";

// Relative import: vitest.config.ts and the global setup load this file before the "@/" alias exists.
import { getDatabaseUrl } from "../db/database-url";

// Tests never touch the main database: they run on "<name>_test" in the same Postgres.
// The guards below refuse any other name, so a mistake in .env or in a test cannot
// reach the real contacts.
const TEST_SUFFIX = "_test";

export function readDatabaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

export function assertTestDatabaseName(name: string): void {
  if (!name.endsWith(TEST_SUFFIX)) {
    throw new Error(
      `Refusing to touch database "${name}": the name of a test database must end with ${TEST_SUFFIX}`,
    );
  }
}

// The same server, user and options, another database.
export function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(name)}`;
  return parsed.toString();
}

// The main database's name with `suffix` added; the suffix has to end with _test.
function withNameSuffix(url: string, suffix: string): string {
  const name = readDatabaseName(url);
  if (name === "") {
    throw new Error(
      "The connection string has no database name, so there is nothing to name the test database after",
    );
  }

  const testName = name + suffix;
  assertTestDatabaseName(testName);
  return withDatabaseName(url, testName);
}

// "postgres://u:p@host:5432/personal_crm" → "postgres://u:p@host:5432/personal_crm_test"
export function toTestDatabaseUrl(url: string): string {
  return withNameSuffix(url, TEST_SUFFIX);
}

// "postgres://u:p@host:5432/personal_crm" → "postgres://u:p@host:5432/personal_crm_e2e_test".
// The e2e tests have a database of their own, so they can run alongside `pnpm test`.
export function toE2eDatabaseUrl(url: string): string {
  return withNameSuffix(url, `_e2e${TEST_SUFFIX}`);
}

// The same server, the "postgres" maintenance database: the one place where
// databases are created and dropped.
export function toAdminDatabaseUrl(url: string): string {
  return withDatabaseName(url, "postgres");
}

// The test database for this machine. Reads .env the same way Next.js and the seed script do.
// Used by the Vitest config and the global setup, which run before the tests get their env.
export function getTestDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  return toTestDatabaseUrl(getDatabaseUrl());
}

// The e2e database for this machine, read the same way. Used by playwright.config.ts and
// the e2e helpers.
export function getE2eDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  return toE2eDatabaseUrl(getDatabaseUrl());
}
