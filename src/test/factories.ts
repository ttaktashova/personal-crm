import { runQuery } from "@/db";
import {
  contactGroups,
  contacts,
  groups,
  interactions,
  users,
  type Contact,
  type Group,
  type NewContact,
  type User,
} from "@/db/schema";

// Rows for tests. They write straight to the tables, so a test of a function does not
// depend on another function of the app to set itself up. Contacts and groups belong to
// the user whose id comes first.

// A user who has signed in before.
export async function addUser(email: string): Promise<User> {
  const [user] = await runQuery("addUser", (db) =>
    db.insert(users).values({ name: "", email, emailVerified: true }).returning(),
  );
  return user;
}

export async function addContact(
  ownerId: number,
  values: Omit<Partial<NewContact>, "ownerId"> & { name: string },
): Promise<Contact> {
  const [contact] = await runQuery("addContact", (db) =>
    db
      .insert(contacts)
      .values({ ...values, ownerId })
      .returning(),
  );
  return contact;
}

export async function addContacts(ownerId: number, names: string[]): Promise<Contact[]> {
  if (names.length === 0) return [];
  return runQuery("addContacts", (db) =>
    db
      .insert(contacts)
      .values(names.map((name) => ({ name, ownerId })))
      .returning(),
  );
}

export async function addGroup(ownerId: number, name: string): Promise<Group> {
  const [group] = await runQuery("addGroup", (db) =>
    db.insert(groups).values({ name, ownerId }).returning(),
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
