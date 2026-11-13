import "server-only";

import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cache } from "react";

import { runQuery, type Database } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { contactGroups, groups } from "@/db/schema";

export type GroupItem = { id: number; name: string; contactCount: number };
export type ContactGroup = { id: number; name: string };

// Russian alphabetical order (ICU collation: "Ё" sorts with "Е"); id keeps equal names
// in the same order on every request.
const groupOrder = [sql`${groups.name} collate "ru-RU-x-icu"`, asc(groups.id)] as const;

// The unique index on the name (src/db/schema.ts) is what says "such a group exists".
// A check before the insert would not help: another tab can create the group in between.
function isDuplicateName(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "groups_name_key"
  );
}

// Every function here takes the owner first: a user sees and changes only their own groups.
// Another user's group answers the same as a deleted one.
const ownedBy = (ownerId: number) => eq(groups.ownerId, ownerId);

// The owner's groups by name with the number of people in each. Deduplicated per request:
// the filter row, the check of ?group=, the "Группы" window and the form field read the same list.
// Only the owner's people can be in the owner's groups (setContactGroups), so the count is theirs.
export const listGroups = cache(async (ownerId: number): Promise<GroupItem[]> => {
  return runQuery("listGroups", (db) =>
    db
      .select({
        id: groups.id,
        name: groups.name,
        contactCount: count(contactGroups.contactId),
      })
      .from(groups)
      .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
      .where(ownedBy(ownerId))
      .groupBy(groups.id)
      .orderBy(...groupOrder),
  );
});

// The groups of several contacts in one query, each list by name. A contact without
// groups has no entry. The card asks for one contact, a list page for all of its contacts.
export async function listContactGroups(
  ownerId: number,
  contactIds: number[],
): Promise<Map<number, ContactGroup[]>> {
  const byContact = new Map<number, ContactGroup[]>();
  if (contactIds.length === 0) return byContact;

  const rows = await runQuery("listContactGroups", (db) =>
    db
      .select({ contactId: contactGroups.contactId, id: groups.id, name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .where(and(inArray(contactGroups.contactId, contactIds), ownedBy(ownerId)))
      .orderBy(...groupOrder),
  );

  for (const { contactId, id, name } of rows) {
    const list = byContact.get(contactId);
    if (list) list.push({ id, name });
    else byContact.set(contactId, [{ id, name }]);
  }
  return byContact;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// A name as the unique index groups_name_key sees it: lowercase, "ё" as "е". It must stay
// the same expression as the index, or the index is not used.
const nameKey = (name: SQL | AnyPgColumn) =>
  sql`replace(lower(${name} collate "ru-RU-x-icu"), 'ё', 'е')`;

// Writes which groups a person is in, inside the transaction that saves the contact:
// either all of it is saved or none. The contact is the owner's: the caller has checked.
// `newGroupNames` are checked by groupNameSchema and become the owner's groups here; a name
// another tab already created is found among the owner's groups, not created twice. A chosen
// group that was deleted meanwhile, or that is not the owner's, is skipped without an error.
export async function setContactGroups(
  tx: Transaction,
  ownerId: number,
  contactId: number,
  { groupIds, newGroupNames }: { groupIds: number[]; newGroupNames: string[] },
): Promise<void> {
  let newGroupIds: number[] = [];
  if (newGroupNames.length > 0) {
    await tx
      .insert(groups)
      .values(newGroupNames.map((name) => ({ name, ownerId })))
      .onConflictDoNothing();

    const keys = sql.join(
      newGroupNames.map((name) => nameKey(sql`${name}::text`)),
      sql`, `,
    );
    const found = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(ownedBy(ownerId), sql`${nameKey(groups.name)} in (${keys})`));
    newGroupIds = found.map((row) => row.id);
  }

  await tx.delete(contactGroups).where(eq(contactGroups.contactId, contactId));

  const wanted = [...new Set([...groupIds, ...newGroupIds])];
  if (wanted.length === 0) return;

  // Selecting from groups takes only the owner's groups that still exist.
  await tx.execute(sql`
    insert into ${contactGroups} (contact_id, group_id)
    select ${contactId}::integer, ${groups.id}
    from ${groups}
    where ${and(inArray(groups.id, wanted), ownedBy(ownerId))}
  `);
}

export type CreateGroupResult = { status: "created"; id: number } | { status: "duplicate" };

// `name` is already checked by groupNameSchema. Only the owner's groups count as "such a group exists".
export async function createGroup(ownerId: number, name: string): Promise<CreateGroupResult> {
  try {
    const [created] = await runQuery("createGroup", (db) =>
      db.insert(groups).values({ name, ownerId }).returning({ id: groups.id }),
    );
    return { status: "created", id: created.id };
  } catch (error) {
    if (isDuplicateName(error)) return { status: "duplicate" };
    throw error;
  }
}

export type RenameGroupResult =
  { status: "renamed" } | { status: "duplicate" } | { status: "not-found" };

// People stay in the group, and their "изменён" date does not move: only the group row changes.
export async function renameGroup(
  ownerId: number,
  id: number,
  name: string,
): Promise<RenameGroupResult> {
  try {
    const [renamed] = await runQuery("renameGroup", (db) =>
      db
        .update(groups)
        .set({ name })
        .where(and(eq(groups.id, id), ownedBy(ownerId)))
        .returning({ id: groups.id }),
    );
    return renamed ? { status: "renamed" } : { status: "not-found" };
  } catch (error) {
    if (isDuplicateName(error)) return { status: "duplicate" };
    throw error;
  }
}

export type DeleteGroupResult = { status: "deleted" } | { status: "not-found" };

// The links to people go with the group (ON DELETE CASCADE); the people stay as they are.
export async function deleteGroup(ownerId: number, id: number): Promise<DeleteGroupResult> {
  const [deleted] = await runQuery("deleteGroup", (db) =>
    db
      .delete(groups)
      .where(and(eq(groups.id, id), ownedBy(ownerId)))
      .returning({ id: groups.id }),
  );
  return deleted ? { status: "deleted" } : { status: "not-found" };
}
