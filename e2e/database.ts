import postgres from "postgres";

import { getE2eDatabaseUrl } from "../src/test/database-url";

// Rows for e2e tests, written straight to the e2e database: the one the app under test
// reads (see playwright.config.ts). A test sets up only what the scenario does not create
// through the browser. Contacts and groups belong to a user: the one whose id comes first,
// usually the one the test signs in as.

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

// A user who has signed in before, the way the migration creates the owner. Returns the id.
export async function addUser(email: string): Promise<number> {
  return withDatabase(async (sql) => {
    const [user] = await sql<{ id: number }[]>`
      insert into users (name, email, email_verified) values ('', ${email}, true) returning id
    `;
    return user.id;
  });
}

export async function countUsers(email: string): Promise<number> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from users where email = ${email}
    `;
    return row.count;
  });
}

// Every unused sign-in link expires, as if 16 minutes have passed.
export async function expireSignInLinks(): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`update verifications set expires_at = now() - interval '1 minute'`;
  });
}

// Moves the sign-ins of `email` in time: the last visit (updated_at) `lastVisitDaysAgo` days
// ago, with the 30 days counted from it.
export async function setLastVisit(email: string, lastVisitDaysAgo: number): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      update sessions s
      set updated_at = now() - make_interval(days => ${lastVisitDaysAgo}),
        expires_at = now() - make_interval(days => ${lastVisitDaysAgo}) + interval '30 days'
      from users u
      where u.id = s.user_id and u.email = ${email}
    `;
  });
}

// When each sign-in of `email` ends.
export async function sessionExpiries(email: string): Promise<Date[]> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ expires_at: Date }[]>`
      select s.expires_at from sessions s join users u on u.id = s.user_id
      where u.email = ${email}
      order by s.id
    `;
    return rows.map((row) => row.expires_at);
  });
}

// Contacts with a name only, saved in the given order.
export async function addContacts(ownerId: number, names: string[]): Promise<void> {
  if (names.length === 0) return;
  await withDatabase(async (sql) => {
    await sql`insert into contacts ${sql(names.map((name) => ({ name, owner_id: ownerId })))}`;
  });
}

export type ContactFrequency = "week" | "month" | "quarter" | "year";

// One contact with a frequency or without one. `createdAt` puts "Добавлен" in the past,
// so a change made by the test shows "изменён". Returns the id.
export async function addContact(
  ownerId: number,
  {
    name,
    contactFrequency = null,
    createdAt = null,
  }: {
    name: string;
    contactFrequency?: ContactFrequency | null;
    createdAt?: Date | null;
  },
): Promise<number> {
  return withDatabase(async (sql) => {
    const [contact] = await sql<{ id: number }[]>`
      insert into contacts (owner_id, name, contact_frequency, created_at, updated_at)
      values (
        ${ownerId},
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
export async function addGroup(ownerId: number, name: string, contactIds: number[]): Promise<void> {
  await withDatabase(async (sql) => {
    const [group] = await sql<{ id: number }[]>`
      insert into groups (owner_id, name) values (${ownerId}, ${name}) returning id
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
