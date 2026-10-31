import { defineConfig, devices } from "@playwright/test";

import { getE2eDatabaseUrl } from "./src/test/database-url";

// Not 3000, where `pnpm dev` may be running.
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // All tests share one database, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The app as it runs in production, on a database of its own: a new empty e2e database
  // with migrations, then the build, then the server. Playwright starts this before
  // anything else and stops it at the end.
  webServer: {
    command: `pnpm exec tsx e2e/prepare-database.ts && pnpm build && pnpm start --port ${PORT}`,
    url: `${BASE_URL}/health`,
    env: { DATABASE_URL: getE2eDatabaseUrl() },
    // Never a server left from before: the tests check the code as it is now.
    reuseExistingServer: false,
    // The build takes a while.
    timeout: 300_000,
  },
});
