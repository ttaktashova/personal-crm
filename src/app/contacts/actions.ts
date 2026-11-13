"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { runQuery } from "@/db";
import { contacts } from "@/db/schema";
import { contactInputSchema, toFieldErrors, type ContactFieldErrors } from "@/lib/contact-schema";
import { insertContact, updateContactById } from "@/lib/contacts";
import { parseId } from "@/lib/ids";
import { requireUser } from "@/lib/session";

export type SaveContactResult =
  | { status: "saved"; id: number }
  | { status: "invalid"; fieldErrors: ContactFieldErrors }
  | { status: "not-found" };

// Every action starts with the signed-in user: an action can be called directly, past any
// page. Another user's contact answers the same as a deleted one: «not-found».

export async function createContact(input: unknown): Promise<SaveContactResult> {
  const user = await requireUser();
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const created = await insertContact(user.id, parsed.data);

  revalidatePath("/");
  return { status: "saved", id: created.id };
}

export async function updateContact(id: unknown, input: unknown): Promise<SaveContactResult> {
  const user = await requireUser();
  const contactId = parseId(id);
  if (contactId === null) {
    return { status: "not-found" };
  }

  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const updated = await updateContactById(user.id, contactId, parsed.data);
  if (!updated) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { status: "saved", id: updated.id };
}

export type StopRemindersResult = { status: "stopped" } | { status: "not-found" };

// "Простить" on the main page: the frequency goes back to "Не задано". It is a card
// change, so "изменён" moves; revenge records stay as they are.
export async function stopReminders(id: unknown): Promise<StopRemindersResult> {
  const user = await requireUser();
  const contactId = parseId(id);
  if (contactId === null) {
    return { status: "not-found" };
  }

  const [updated] = await runQuery("stopReminders", (db) =>
    db
      .update(contacts)
      .set({ contactFrequency: null, updatedAt: sql`now()` })
      .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, user.id)))
      .returning({ id: contacts.id }),
  );

  if (!updated) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { status: "stopped" };
}

export type DeleteContactResult = { status: "deleted" } | { status: "not-found" };

export async function deleteContact(id: unknown): Promise<DeleteContactResult> {
  const user = await requireUser();
  const contactId = parseId(id);
  if (contactId === null) {
    return { status: "not-found" };
  }

  const [deleted] = await runQuery("deleteContact", (db) =>
    db
      .delete(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, user.id)))
      .returning({ id: contacts.id }),
  );

  if (!deleted) {
    return { status: "not-found" };
  }

  // Only the list: revalidating the open card would re-render it as "not found"
  // before the client navigates away.
  revalidatePath("/");
  return { status: "deleted" };
}
