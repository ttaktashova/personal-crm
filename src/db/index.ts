import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DatabaseError } from "./database-error";
import { getDatabaseUrl } from "./database-url";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql;
};

const client = globalForDb.postgresClient ?? postgres(getDatabaseUrl());

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

// Not exported: every query goes through runQuery, so a failed one never reaches the
// log with contact data. Drizzle's own error carries the query and all its values.
const db = drizzle(client, { schema });

export type Database = typeof db;

// Runs the queries in `run` and replaces any error with a DatabaseError that keeps only
// codes and schema names. `label` names the query in the log, usually the function it
// is in: server code is minified, so the stack alone does not tell.
export async function runQuery<T>(
  label: string,
  run: (db: Database) => PromiseLike<T>,
): Promise<T> {
  try {
    return await run(db);
  } catch (error) {
    throw new DatabaseError(label, error);
  }
}
