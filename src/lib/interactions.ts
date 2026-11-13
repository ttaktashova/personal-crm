import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { runQuery } from "@/db";
import { contacts, interactions } from "@/db/schema";

export type InteractionItem = {
  id: number;
  occurredOn: string; // "YYYY-MM-DD"
  summary: string;
};

// One contact's revenge history, newest first. Among records with one date the one
// added later (higher id) goes first, so the first record is the last revenge.
// The records belong to the contact's owner: for anybody else the list is empty.
export async function listInteractions(
  ownerId: number,
  contactId: number,
): Promise<InteractionItem[]> {
  return runQuery("listInteractions", (db) =>
    db
      .select({
        id: interactions.id,
        occurredOn: interactions.occurredOn,
        summary: interactions.summary,
      })
      .from(interactions)
      .innerJoin(contacts, eq(contacts.id, interactions.contactId))
      .where(and(eq(interactions.contactId, contactId), eq(contacts.ownerId, ownerId)))
      .orderBy(desc(interactions.occurredOn), desc(interactions.id)),
  );
}
