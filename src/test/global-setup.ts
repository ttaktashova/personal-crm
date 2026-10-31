import { recreateMigratedDatabase } from "./database-admin";
import { getTestDatabaseUrl } from "./database-url";

// Once per `pnpm test`: a new empty test database with all migrations applied.
export default async function setup(): Promise<void> {
  await recreateMigratedDatabase(getTestDatabaseUrl());
}
