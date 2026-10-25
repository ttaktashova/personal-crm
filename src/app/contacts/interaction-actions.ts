"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { contacts, interactions } from "@/db/schema";
import { parseId } from "@/lib/ids";
import {
  interactionInputSchema,
  toFieldErrors,
  type InteractionFieldErrors,
} from "@/lib/interaction-schema";

// Revenge records never touch contacts.updated_at: "изменён" is about the card fields.

export type SaveInteractionResult =
  | { status: "saved" }
  | { status: "invalid"; fieldErrors: InteractionFieldErrors }
  | { status: "not-found" };

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

  // Insert from a select on contacts: a deleted contact gives no row to insert,
  // which is easier to tell than a foreign key error wrapped by the driver.
  // Plain SQL: Drizzle's insert-select would also list the identity id column.
  const { occurredOn, summary } = parsed.data;
  const inserted = await db.execute<{ id: number }>(sql`
    insert into ${interactions} (contact_id, occurred_on, summary)
    select ${contacts.id}, ${occurredOn}::date, ${summary}::text
    from ${contacts}
    where ${contacts.id} = ${id}
    returning id
  `);

  if (inserted.length === 0) {
    return { status: "not-found" };
  }

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

  const [updated] = await db
    .update(interactions)
    .set(parsed.data)
    .where(eq(interactions.id, id))
    .returning({ contactId: interactions.contactId });

  if (!updated) {
    return { status: "not-found" };
  }

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

  const [deleted] = await db
    .delete(interactions)
    .where(eq(interactions.id, id))
    .returning({ contactId: interactions.contactId });

  if (!deleted) {
    return { status: "not-found" };
  }

  revalidatePath(`/contacts/${deleted.contactId}`);
  return { status: "deleted" };
}
