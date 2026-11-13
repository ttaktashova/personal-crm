import { recreateMigratedDatabase } from "./database-admin";
import { getTestDatabaseUrl } from "./database-url";
import { TEST_OWNER_EMAIL } from "./owner";

// Once per `pnpm test`: a new empty test database with all migrations applied.
export default async function setup(): Promise<void> {
  await recreateMigratedDatabase(getTestDatabaseUrl(), TEST_OWNER_EMAIL);
}
