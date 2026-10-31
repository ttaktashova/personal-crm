import { runQuery } from "@/db";
import {
  contactGroups,
  contacts,
  groups,
  interactions,
  type Contact,
  type Group,
  type NewContact,
} from "@/db/schema";

// Rows for tests. They write straight to the tables, so a test of a function does not
// depend on another function of the app to set itself up.

export async function addContact(
  values: Partial<NewContact> & { name: string },
): Promise<Contact> {
  const [contact] = await runQuery("addContact", (db) =>
    db.insert(contacts).values(values).returning(),
  );
  return contact;
}

export async function addContacts(names: string[]): Promise<Contact[]> {
  if (names.length === 0) return [];
  return runQuery("addContacts", (db) =>
    db.insert(contacts).values(names.map((name) => ({ name }))).returning(),
  );
}

export async function addGroup(name: string): Promise<Group> {
  const [group] = await runQuery("addGroup", (db) =>
    db.insert(groups).values({ name }).returning(),
  );
  return group;
}

export async function addToGroups(contactId: number, ...groupIds: number[]): Promise<void> {
  if (groupIds.length === 0) return;
  await runQuery("addToGroups", (db) =>
    db.insert(contactGroups).values(groupIds.map((groupId) => ({ contactId, groupId }))),
  );
}

// A revenge record for a contact, "YYYY-MM-DD".
export async function addRevenge(contactId: number, occurredOn: string): Promise<void> {
  await runQuery("addRevenge", (db) =>
    db.insert(interactions).values({ contactId, occurredOn, summary: "Отомстил" }),
  );
}
