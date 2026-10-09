// Fills an empty database with test contacts: pnpm db:seed
// Never deletes or changes existing data: if contacts already exist, it does nothing.

import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "../src/db/database-url";
import { contacts } from "../src/db/schema";
import { generateContacts } from "./seed-data";

const CONTACT_COUNT = 1000;
const BATCH_SIZE = 250;

async function main() {
  loadEnvConfig(process.cwd());

  const client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    const existing = await db.$count(contacts);
    if (existing > 0) {
      console.log(
        `Seed skipped: the database already has ${existing} contacts. Nothing was changed.`,
      );
      return;
    }

    const rows = generateContacts(CONTACT_COUNT);
    await db.transaction(async (tx) => {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        await tx.insert(contacts).values(rows.slice(start, start + BATCH_SIZE));
      }
    });

    console.log(`Seeded ${rows.length} contacts.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
