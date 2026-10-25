import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { contacts } from "@/db/schema";

export type ContactListItem = {
  id: number;
  name: string;
  howWeMet: string;
  phone: string;
  email: string;
};

// All contacts in Russian alphabetical order (ICU collation: "Ё" sorts with "Е").
export async function listContacts(): Promise<ContactListItem[]> {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      howWeMet: contacts.howWeMet,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .orderBy(sql`${contacts.name} collate "ru-RU-x-icu"`, asc(contacts.id));
}

// Deduplicated per request: the page and its metadata both read the same contact.
export const getContact = cache(async (id: number) => {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact ?? null;
});
