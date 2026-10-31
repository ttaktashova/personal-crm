// Fills an empty database with test contacts, their revenge history and their groups: pnpm db:seed
// The people are put into the groups the database already has (run the migrations first);
// with no groups they are saved without groups.
// Never deletes or changes existing data: if contacts already exist, it does nothing.

import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "../src/db/database-url";
import { contactGroups, contacts, groups, interactions } from "../src/db/schema";
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
    let interactionCount = 0;
    let membershipCount = 0;
    await db.transaction(async (tx) => {
      const groupIds = (await tx.select({ id: groups.id }).from(groups).orderBy(groups.id)).map(
        (group) => group.id,
      );

      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);
        const inserted = await tx
          .insert(contacts)
          .values(batch.map((row) => row.contact))
          .returning({ id: contacts.id });

        // Identity ids grow in insert order, so sorted ids line up with the batch.
        const ids = inserted.map((row) => row.id).sort((a, b) => a - b);
        const records = batch.flatMap((row, index) =>
          row.interactions.map((interaction) => ({ ...interaction, contactId: ids[index] })),
        );
        if (records.length > 0) {
          await tx.insert(interactions).values(records);
          interactionCount += records.length;
        }

        // A pick is a place in the list of groups; two picks on one group make one membership.
        // Without groups nobody gets one.
        const memberships =
          groupIds.length === 0
            ? []
            : batch.flatMap((row, index) => {
                const picked = new Set(
                  row.groupPicks.map((pick) => groupIds[Math.floor(pick * groupIds.length)]),
                );
                return [...picked].map((groupId) => ({ contactId: ids[index], groupId }));
              });
        if (memberships.length > 0) {
          await tx.insert(contactGroups).values(memberships);
          membershipCount += memberships.length;
        }
      }
    });

    console.log(
      `Seeded ${rows.length} contacts, ${interactionCount} revenge records and ${membershipCount} group memberships.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
