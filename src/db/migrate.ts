import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Applies the pending migrations of `migrationsFolder` in one transaction. Used by
// `pnpm db:migrate` (scripts/migrate-local.ts) and by the test databases; the production image
// has the same steps in plain JS, scripts/migrate.mjs: change both.
//
// 0008_assign_data_to_owner gives the data that was there before sign-in to the user with the
// owner's email (OWNER_EMAIL). SQL cannot read environment variables, so the email goes into the
// Postgres setting app.owner_email of the very connection that migrates. The setting is needed
// every time, not only for 0008: one rule is simpler.

export const NO_OWNER_EMAIL_MESSAGE = "OWNER_EMAIL is not set or is not an email";

// The same simple rule as 0008: "x@y.z" without spaces, no longer than 254, after the spaces at
// the edges are dropped. The value itself is never printed: the deploy log is public.
export function isOwnerEmail(value: string | undefined): value is string {
  const email = value?.trim() ?? "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function applyMigrations(
  url: string,
  ownerEmail: string | undefined,
  migrationsFolder: string,
): Promise<void> {
  if (!isOwnerEmail(ownerEmail)) throw new Error(NO_OWNER_EMAIL_MESSAGE);

  // One connection: the setting lives in it.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
