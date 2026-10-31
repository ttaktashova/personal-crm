import postgres from "postgres";

import { getE2eDatabaseUrl } from "../src/test/database-url";

// Rows for e2e tests, written straight to the e2e database: the one the app under test
// reads (see playwright.config.ts). A test sets up only what the scenario does not create
// through the browser.

async function withDatabase<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(getE2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

// Empties every table and restarts the ids from 1, so each test starts from nothing.
// The starting groups go too: they come from a migration.
export async function resetDatabase(): Promise<void> {
  await withDatabase(async (sql) => {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `;
    if (tables.length === 0) return;

    await sql`truncate ${sql(tables.map((table) => table.tablename))} restart identity cascade`;
  });
}

// Contacts with a name only, saved in the given order.
export async function addContacts(names: string[]): Promise<void> {
  if (names.length === 0) return;
  await withDatabase(async (sql) => {
    await sql`insert into contacts ${sql(names.map((name) => ({ name })))}`;
  });
}
