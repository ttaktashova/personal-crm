import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { getTestDatabaseUrl } from "./src/test/database-url";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fromRoot("./src/") },
      // The real package throws outside the Next.js server.
      { find: "server-only", replacement: fromRoot("./src/test/server-only.ts") },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    // The app code reads DATABASE_URL first, so every test talks to the test database,
    // whatever .env says. Set here, not taken from the environment as it is.
    env: {
      DATABASE_URL: getTestDatabaseUrl(),
      // Sign-in (src/lib/auth.ts): a new secret on every run, never the one from .env. Emails
      // could only reach the Mailpit catcher; the tests that send replace @/lib/mail anyway.
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      SMTP_URL: "smtp://127.0.0.1:1025",
      EMAIL_FROM: "noreply@mail.crm.testblacklist.ru",
    },
    globalSetup: ["./src/test/global-setup.ts"],
    // All files share one database, so they run one after another.
    fileParallelism: false,
  },
});
