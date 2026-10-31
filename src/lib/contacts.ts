import "server-only";

import { and, asc, count, eq, exists, sql } from "drizzle-orm";
import { cache } from "react";

import { runQuery } from "@/db";
import { contactGroups, contacts } from "@/db/schema";
import type { ContactInput } from "@/lib/contact-schema";
import { listContactGroups, setContactGroups, type ContactGroup } from "@/lib/groups";
import { escapeLike } from "@/lib/search";

export type ContactListItem = {
  id: number;
  name: string;
  howWeMet: string;
  phone: string;
  email: string;
  groups: ContactGroup[]; // by name, all of them
};

const listItemColumns = {
  id: contacts.id,
  name: contacts.name,
  howWeMet: contacts.howWeMet,
  phone: contacts.phone,
  email: contacts.email,
};

// Russian alphabetical order (ICU collation: "Ё" sorts with "Е"); id keeps full
// namesakes in the same order on every request, so nobody jumps between pages.
const nameOrder = sql`${contacts.name} collate "ru-RU-x-icu"`;

// The name as search sees it: lowercase, "ё" as "е" — the same rules as toSearchWords.
// ICU lowercases Cyrillic the same way on any OS.
const nameForSearch = sql`replace(lower(${contacts.name} collate "ru-RU-x-icu"), 'ё', 'е')`;

export type ContactListPage = {
  contacts: ContactListItem[];
  totalCount: number; // the people of the chosen group, or everybody without a group
  matchedCount: number; // of them, those the search found
  allCount: number; // all contacts: tells an empty group from an empty list
  page: number; // clamped to [1, pageCount]
  pageCount: number;
};

// One page of the list. `words` come from toSearchWords: a name matches when it
// contains every word, in any order. Without words every contact matches.
// With `groupId` everything — the counts, the search and the page — is about that group's people.
export async function listContactsPage({
  page,
  pageSize,
  words,
  groupId,
}: {
  page: number;
  pageSize: number;
  words: string[];
  groupId: number | null;
}): Promise<ContactListPage> {
  const match =
    words.length > 0
      ? and(...words.map((word) => sql`${nameForSearch} like ${`%${escapeLike(word)}%`}`))
      : undefined;

  const list = await runQuery("listContactsPage", async (db) => {
    const inGroup =
      groupId === null
        ? undefined
        : exists(
            db
              .select({ one: sql`1` })
              .from(contactGroups)
              .where(
                and(eq(contactGroups.contactId, contacts.id), eq(contactGroups.groupId, groupId)),
              ),
          );

    const [counts] = await db
      .select({
        totalCount: count(),
        matchedCount: match
          ? sql<number>`count(*) filter (where ${match})`.mapWith(Number)
          : count(),
      })
      .from(contacts)
      .where(inGroup);
    const allCount = groupId === null ? counts.totalCount : await db.$count(contacts);

    // A page past the last one opens the last one, without a redirect.
    const pageCount = Math.max(1, Math.ceil(counts.matchedCount / pageSize));
    const shownPage = Math.min(Math.max(page, 1), pageCount);

    const rows = await db
      .select(listItemColumns)
      .from(contacts)
      .where(and(inGroup, match))
      .orderBy(nameOrder, asc(contacts.id))
      .limit(pageSize)
      .offset((shownPage - 1) * pageSize);

    return { rows, ...counts, allCount, page: shownPage, pageCount };
  });

  const { rows, ...rest } = list;
  const groupsByContact = await listContactGroups(rows.map((row) => row.id));
  return {
    contacts: rows.map((row) => ({ ...row, groups: groupsByContact.get(row.id) ?? [] })),
    ...rest,
  };
}

// The page where a contact stands in the whole list (no search), or null if it is gone.
export async function findContactPage(id: number, pageSize: number): Promise<number | null> {
  return runQuery("findContactPage", async (db) => {
    const [target] = await db
      .select({ name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);
    if (!target) return null;

    // Contacts before it in the list order: (name, id) compared as a pair.
    const before = await db.$count(
      contacts,
      sql`(${nameOrder}, ${contacts.id}) < (${target.name}::text collate "ru-RU-x-icu", ${id}::integer)`,
    );
    return Math.floor(before / pageSize) + 1;
  });
}

// The contact and its groups are saved in one transaction: either all of it or none, so
// a failed save leaves neither a half-saved contact nor a group that nobody asked for.
export async function insertContact(input: ContactInput): Promise<{ id: number }> {
  const { groupIds, newGroupNames, ...fields } = input;

  return runQuery("insertContact", (db) =>
    db.transaction(async (tx) => {
      const [created] = await tx.insert(contacts).values(fields).returning({ id: contacts.id });
      await setContactGroups(tx, created.id, { groupIds, newGroupNames });
      return created;
    }),
  );
}

// Null when the contact is gone. "изменён" moves on every save, including a change of groups only.
export async function updateContactById(
  id: number,
  input: ContactInput,
): Promise<{ id: number } | null> {
  const { groupIds, newGroupNames, ...fields } = input;

  return runQuery("updateContactById", (db) =>
    db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contacts)
        .set({ ...fields, updatedAt: sql`now()` })
        .where(eq(contacts.id, id))
        .returning({ id: contacts.id });
      if (!updated) return null;

      await setContactGroups(tx, updated.id, { groupIds, newGroupNames });
      return updated;
    }),
  );
}

// Deduplicated per request: the page and its metadata both read the same contact.
export const getContact = cache(async (id: number) => {
  const [contact] = await runQuery("getContact", (db) =>
    db.select().from(contacts).where(eq(contacts.id, id)).limit(1),
  );
  return contact ?? null;
});
