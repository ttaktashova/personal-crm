// Runs in the webServer command of playwright.config.ts, before the app is built and
// started: every `pnpm test:e2e` gets a new empty e2e database with all migrations applied.
// DATABASE_URL there is already the e2e database. A name that does not end with _test
// is refused, so the main database is never touched.

import { recreateMigratedDatabase } from "../src/test/database-admin";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set: run the e2e tests with `pnpm test:e2e`");
  }
  await recreateMigratedDatabase(url);
}

main().catch((error) => {
  console.error("Preparing the e2e database failed:", error);
  process.exitCode = 1;
});
