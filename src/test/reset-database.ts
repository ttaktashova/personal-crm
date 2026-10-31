import { sql } from "drizzle-orm";

import { runQuery } from "@/db";

import { assertTestDatabaseName } from "./database-url";

// Empties every table of the test database and restarts the ids from 1, so each test
// starts from nothing and creates the rows it needs. Call it in beforeEach.
// The starting groups go too: they come from a migration, which has its own test.
export async function resetDatabase(): Promise<void> {
  await runQuery("resetDatabase", async (db) => {
    const [current] = await db.execute<{ name: string }>(sql`select current_database() as name`);
    assertTestDatabaseName(current.name);

    const tables = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    if (tables.length === 0) return;

    const names = tables.map((table) => `"${table.tablename}"`).join(", ");
    await db.execute(sql`truncate ${sql.raw(names)} restart identity cascade`);
  });
}
