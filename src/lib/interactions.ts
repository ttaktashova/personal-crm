import "server-only";

import { desc, eq } from "drizzle-orm";

import { runQuery } from "@/db";
import { interactions } from "@/db/schema";

export type InteractionItem = {
  id: number;
  occurredOn: string; // "YYYY-MM-DD"
  summary: string;
};

// One contact's revenge history, newest first. Among records with one date the one
// added later (higher id) goes first, so the first record is the last revenge.
export async function listInteractions(contactId: number): Promise<InteractionItem[]> {
  return runQuery("listInteractions", (db) =>
    db
      .select({
        id: interactions.id,
        occurredOn: interactions.occurredOn,
        summary: interactions.summary,
      })
      .from(interactions)
      .where(eq(interactions.contactId, contactId))
      .orderBy(desc(interactions.occurredOn), desc(interactions.id)),
  );
}
