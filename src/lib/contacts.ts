import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { runQuery } from "@/db";
import { contacts } from "@/db/schema";
import { escapeLike } from "@/lib/search";

export type ContactListItem = {
  id: number;
  name: string;
  howWeMet: string;
  phone: string;
  email: string;
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
  totalCount: number;
  matchedCount: number;
  page: number; // clamped to [1, pageCount]
  pageCount: number;
};

// One page of the list. `words` come from toSearchWords: a name matches when it
// contains every word, in any order. Without words every contact matches.
export async function listContactsPage({
  page,
  pageSize,
  words,
}: {
  page: number;
  pageSize: number;
  words: string[];
}): Promise<ContactListPage> {
  const match =
    words.length > 0
      ? and(...words.map((word) => sql`${nameForSearch} like ${`%${escapeLike(word)}%`}`))
      : undefined;

  return runQuery("listContactsPage", async (db) => {
    const [counts] = await db
      .select({
        totalCount: count(),
        matchedCount: match
          ? sql<number>`count(*) filter (where ${match})`.mapWith(Number)
          : count(),
      })
      .from(contacts);

    // A page past the last one opens the last one, without a redirect.
    const pageCount = Math.max(1, Math.ceil(counts.matchedCount / pageSize));
    const shownPage = Math.min(Math.max(page, 1), pageCount);

    const rows = await db
      .select(listItemColumns)
      .from(contacts)
      .where(match)
      .orderBy(nameOrder, asc(contacts.id))
      .limit(pageSize)
      .offset((shownPage - 1) * pageSize);

    return { contacts: rows, ...counts, page: shownPage, pageCount };
  });
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

// Deduplicated per request: the page and its metadata both read the same contact.
export const getContact = cache(async (id: number) => {
  const [contact] = await runQuery("getContact", (db) =>
    db.select().from(contacts).where(eq(contacts.id, id)).limit(1),
  );
  return contact ?? null;
});
