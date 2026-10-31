import { randomBytes } from "node:crypto";

import { dropDatabase, recreateDatabase } from "./database-admin";
import { assertTestDatabaseName, readDatabaseName, withDatabaseName } from "./database-url";

export type TemporaryDatabase = {
  url: string;
  drop: () => Promise<void>;
};

// A separate empty database next to the test one, for tests that apply migrations
// themselves. Its name ends with _test too: "personal_crm_test_1a2b3c4d_test".
// Inside a test DATABASE_URL is the test database (see vitest.config.ts).
export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl) throw new Error("DATABASE_URL is not set: run the tests with `pnpm test`");

  const testName = readDatabaseName(testUrl);
  assertTestDatabaseName(testName);

  const url = withDatabaseName(testUrl, `${testName}_${randomBytes(4).toString("hex")}_test`);
  await recreateDatabase(url);
  return { url, drop: () => dropDatabase(url) };
}
