"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import {
  contactInputSchema,
  toFieldErrors,
  type ContactFieldErrors,
} from "@/lib/contact-schema";
import { parseId } from "@/lib/ids";

export type SaveContactResult =
  | { status: "saved"; id: number }
  | { status: "invalid"; fieldErrors: ContactFieldErrors }
  | { status: "not-found" };

export async function createContact(input: unknown): Promise<SaveContactResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const [created] = await db
    .insert(contacts)
    .values(parsed.data)
    .returning({ id: contacts.id });

  revalidatePath("/");
  return { status: "saved", id: created.id };
}

export async function updateContact(
  id: unknown,
  input: unknown,
): Promise<SaveContactResult> {
  const contactId = parseId(id);
  if (contactId === null) {
    return { status: "not-found" };
  }

  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const [updated] = await db
    .update(contacts)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });

  if (!updated) {
    return { status: "not-found" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { status: "saved", id: updated.id };
}

export type DeleteContactResult = { status: "deleted" } | { status: "not-found" };

export async function deleteContact(id: unknown): Promise<DeleteContactResult> {
  const contactId = parseId(id);
  if (contactId === null) {
    return { status: "not-found" };
  }

  const [deleted] = await db
    .delete(contacts)
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });

  if (!deleted) {
    return { status: "not-found" };
  }

  // Only the list: revalidating the open card would re-render it as "not found"
  // before the client navigates away.
  revalidatePath("/");
  return { status: "deleted" };
}
