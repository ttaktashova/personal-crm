"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { runQuery } from "@/db";
import { contacts, interactions } from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { parseId } from "@/lib/ids";
import {
  DEFAULT_INTERACTION_SUMMARY,
  interactionInputSchema,
  toFieldErrors,
  type InteractionFieldErrors,
} from "@/lib/interaction-schema";

// Revenge records never touch contacts.updated_at: "изменён" is about the card fields.
// Every change revalidates the main page too: "Пора мстить" is counted from the records.

export type SaveInteractionResult =
  | { status: "saved" }
  | { status: "invalid"; fieldErrors: InteractionFieldErrors }
  | { status: "not-found" };

// Insert from a select on contacts: a deleted contact gives no row to insert,
// which is easier to tell than a foreign key error wrapped by the driver.
// Plain SQL: Drizzle's insert-select would also list the identity id column.
// Returns false when the contact is gone.
async function insertInteraction(
  contactId: number,
  occurredOn: string,
  summary: string,
): Promise<boolean> {
  const inserted = await runQuery("insertInteraction", (db) =>
    db.execute<{ id: number }>(sql`
      insert into ${interactions} (contact_id, occurred_on, summary)
      select ${contacts.id}, ${occurredOn}::date, ${summary}::text
      from ${contacts}
      where ${contacts.id} = ${contactId}
      returning id
    `),
  );
  return inserted.length > 0;
}

export async function addInteraction(
  contactId: unknown,
  input: unknown,
): Promise<SaveInteractionResult> {
  const id = parseId(contactId);
  if (id === null) {
    return { status: "not-found" };
  }

  const parsed = interactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const { occurredOn, summary } = parsed.data;
  if (!(await insertInteraction(id, occurredOn, summary))) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  return { status: "saved" };
}

export type MarkContactedResult = { status: "saved" } | { status: "not-found" };

// "Отомстил" on the main page: a record for today with the default text, no window.
// Today is taken here on the server, not from the browser.
export async function markContacted(contactId: unknown): Promise<MarkContactedResult> {
  const id = parseId(contactId);
  if (id === null) {
    return { status: "not-found" };
  }

  if (!(await insertInteraction(id, todayIsoDate(), DEFAULT_INTERACTION_SUMMARY))) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  return { status: "saved" };
}

export async function updateInteraction(
  interactionId: unknown,
  input: unknown,
): Promise<SaveInteractionResult> {
  const id = parseId(interactionId);
  if (id === null) {
    return { status: "not-found" };
  }

  const parsed = interactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const [updated] = await runQuery("updateInteraction", (db) =>
    db
      .update(interactions)
      .set(parsed.data)
      .where(eq(interactions.id, id))
      .returning({ contactId: interactions.contactId }),
  );

  if (!updated) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${updated.contactId}`);
  return { status: "saved" };
}

export type DeleteInteractionResult = { status: "deleted" } | { status: "not-found" };

export async function deleteInteraction(
  interactionId: unknown,
): Promise<DeleteInteractionResult> {
  const id = parseId(interactionId);
  if (id === null) {
    return { status: "not-found" };
  }

  const [deleted] = await runQuery("deleteInteraction", (db) =>
    db
      .delete(interactions)
      .where(eq(interactions.id, id))
      .returning({ contactId: interactions.contactId }),
  );

  if (!deleted) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${deleted.contactId}`);
  return { status: "deleted" };
}
