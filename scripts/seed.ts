// Fills the owner's empty list with test contacts, their revenge history and their groups:
// pnpm db:seed. The owner is the user with OWNER_EMAIL from .env (created if there is none);
// run the migrations first, so the owner has the starting groups. Never deletes or changes
// existing data: if the owner has contacts already, it does nothing. See seed-database.ts.

import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "../src/db/database-url";
import { isOwnerEmail, NO_OWNER_EMAIL_MESSAGE } from "../src/db/migrate";
import { seedDatabase, seedMessage } from "./seed-database";

async function main() {
  loadEnvConfig(process.cwd());

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!isOwnerEmail(ownerEmail)) {
    console.error(`Seed failed: ${NO_OWNER_EMAIL_MESSAGE}`);
    process.exitCode = 1;
    return;
  }

  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    console.log(seedMessage(await seedDatabase(drizzle(client), ownerEmail)));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
