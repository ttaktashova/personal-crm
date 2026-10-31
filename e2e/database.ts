import postgres from "postgres";

import { getE2eDatabaseUrl } from "../src/test/database-url";

// Rows for e2e tests, written straight to the e2e database: the one the app under test
// reads (see playwright.config.ts). A test sets up only what the scenario does not create
// through the browser.

async function withDatabase<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(getE2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

// Empties every table and restarts the ids from 1, so each test starts from nothing.
// The starting groups go too: they come from a migration.
export async function resetDatabase(): Promise<void> {
  await withDatabase(async (sql) => {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `;
    if (tables.length === 0) return;

    await sql`truncate ${sql(tables.map((table) => table.tablename))} restart identity cascade`;
  });
}

// Contacts with a name only, saved in the given order.
export async function addContacts(names: string[]): Promise<void> {
  if (names.length === 0) return;
  await withDatabase(async (sql) => {
    await sql`insert into contacts ${sql(names.map((name) => ({ name })))}`;
  });
}

export type ContactFrequency = "week" | "month" | "quarter" | "year";

// One contact with a frequency or without one. `createdAt` puts "Добавлен" in the past,
// so a change made by the test shows "изменён". Returns the id.
export async function addContact({
  name,
  contactFrequency = null,
  createdAt = null,
}: {
  name: string;
  contactFrequency?: ContactFrequency | null;
  createdAt?: Date | null;
}): Promise<number> {
  return withDatabase(async (sql) => {
    const [contact] = await sql<{ id: number }[]>`
      insert into contacts (name, contact_frequency, created_at, updated_at)
      values (
        ${name},
        ${contactFrequency}::contact_frequency,
        coalesce(${createdAt}::timestamptz, now()),
        coalesce(${createdAt}::timestamptz, now())
      )
      returning id
    `;
    return contact.id;
  });
}

// A revenge record "Отомстил" on a "YYYY-MM-DD" date.
export async function addRevenge(contactId: number, occurredOn: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      insert into interactions (contact_id, occurred_on, summary)
      values (${contactId}, ${occurredOn}::date, 'Отомстил')
    `;
  });
}

// A group with these people in it.
export async function addGroup(name: string, contactIds: number[]): Promise<void> {
  await withDatabase(async (sql) => {
    const [group] = await sql<{ id: number }[]>`
      insert into groups (name) values (${name}) returning id
    `;
    if (contactIds.length === 0) return;
    await sql`
      insert into contact_groups
      ${sql(contactIds.map((contactId) => ({ contact_id: contactId, group_id: group.id })))}
    `;
  });
}

// Deletes a contact behind the page's back, the way another tab would.
export async function deleteContact(id: number): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`delete from contacts where id = ${id}`;
  });
}
