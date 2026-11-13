// The work of pnpm db:seed (scripts/seed.ts), apart from reading .env, so a test can run it on
// the test database (src/db/seed.test.ts). Relative imports: tsx loads it without the "@/" alias.

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { isOwnerEmail, NO_OWNER_EMAIL_MESSAGE } from "../src/db/migrate";
import { contactGroups, contacts, groups, interactions, users } from "../src/db/schema";
import { generateContacts } from "./seed-data";

const CONTACT_COUNT = 1000;
const BATCH_SIZE = 250;

export type SeedResult =
  | { status: "skipped"; existing: number }
  | { status: "seeded"; contacts: number; interactions: number; memberships: number };

// Fills the list of the owner — the user with `ownerEmail`, created if there is none — with test
// contacts, their revenge history and their groups. The people are put into the owner's groups
// (the starting ones come from the migrations); with no groups they are saved without groups.
// Never deletes or changes existing data: if the owner has contacts already, it does nothing.
// Other users are not touched. One transaction: all of it or nothing.
export async function seedDatabase(
  db: PostgresJsDatabase<Record<string, unknown>>,
  ownerEmail: string,
): Promise<SeedResult> {
  if (!isOwnerEmail(ownerEmail)) throw new Error(NO_OWNER_EMAIL_MESSAGE);
  // Stored like every address: lowercase, no spaces at the edges.
  const email = ownerEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ name: "", email, emailVerified: true })
      .onConflictDoNothing({ target: users.email });
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));

    const existing = await tx.$count(contacts, eq(contacts.ownerId, owner.id));
    if (existing > 0) return { status: "skipped", existing } as const;

    const groupIds = (
      await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.ownerId, owner.id))
        .orderBy(groups.id)
    ).map((group) => group.id);

    const rows = generateContacts(CONTACT_COUNT);
    let interactionCount = 0;
    let membershipCount = 0;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const inserted = await tx
        .insert(contacts)
        .values(batch.map((row) => ({ ...row.contact, ownerId: owner.id })))
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

      // A pick is a place in the list of the owner's groups; two picks on one group make one
      // membership. Without groups nobody gets one.
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

    return {
      status: "seeded",
      contacts: rows.length,
      interactions: interactionCount,
      memberships: membershipCount,
    } as const;
  });
}

// What pnpm db:seed prints. No addresses: only numbers.
export function seedMessage(result: SeedResult): string {
  if (result.status === "skipped") {
    return `Seed skipped: the owner already has ${result.existing} contacts. Nothing was changed.`;
  }
  return `Seeded ${result.contacts} contacts, ${result.interactions} revenge records and ${result.memberships} group memberships for the owner.`;
}
