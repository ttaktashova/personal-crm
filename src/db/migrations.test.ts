import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "@/db/migrate";
import { TEST_OWNER_EMAIL } from "@/test/owner";
import { createTemporaryDatabase, type TemporaryDatabase } from "@/test/temporary-database";

const allMigrations = fileURLToPath(new URL("../../drizzle", import.meta.url));

// The migrations that existed before the frequency: 0000 to 0002.
const MIGRATIONS_BEFORE_FREQUENCY = 3;
// The migrations that existed before groups: 0000 to 0003.
const MIGRATIONS_BEFORE_GROUPS = 4;
// The migrations that existed before sign-in: 0000 to 0005.
const MIGRATIONS_BEFORE_SIGN_IN = 6;
// The migrations that existed before contacts and groups had an owner: 0000 to 0006.
const MIGRATIONS_BEFORE_OWNER = 7;
// The migrations that existed before the birthday: 0000 to 0009.
const MIGRATIONS_BEFORE_BIRTHDAY = 10;

const NO_OWNER_EMAIL = "OWNER_EMAIL is not set or is not an email";

const STARTING_GROUPS = ["Аналитики", "Друзья", "Знакомые", "Семья", "Теннис"];

const databases: TemporaryDatabase[] = [];
const folders: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.drop()));
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

// The way the deploy applies them: with the owner's email.
async function migrateTo(url: string, migrationsFolder: string) {
  await applyMigrations(url, TEST_OWNER_EMAIL, migrationsFolder);
}

// The way a plain `drizzle-kit migrate` would: no owner's email, or the given value as it is,
// without the check that applyMigrations does first.
async function migrateWithSetting(url: string, ownerEmail: string | null) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (ownerEmail !== null)
      await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
    await migrate(drizzle(client), { migrationsFolder: allMigrations });
  } finally {
    await client.end();
  }
}

// The messages of an error and of its causes: Drizzle wraps the error of Postgres.
function messagesOf(error: unknown): string {
  const messages: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) {
    messages.push(current.message);
  }
  return messages.join(" | ");
}

async function failure(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "no error",
    (error: unknown) => messagesOf(error),
  );
}

// A contact from before 0010 as it is after: the birthday columns came empty.
function withNoBirthday<T extends object>(contact: T) {
  return { ...contact, birth_day: null, birth_month: null, birth_year: null };
}

// A row without the owner column, to compare with the rows from before it existed.
function withoutOwner<T extends { owner_id?: unknown }>({ owner_id, ...rest }: T) {
  void owner_id;
  return rest;
}

// A copy of the migrations folder with the first `count` migrations only: the way
// to get a database as it was before the update.
async function copyFirstMigrations(count: number): Promise<string> {
  const journal = JSON.parse(await readFile(join(allMigrations, "meta", "_journal.json"), "utf8"));
  const entries: { tag: string }[] = journal.entries.slice(0, count);

  const folder = await mkdtemp(join(tmpdir(), "migrations-"));
  folders.push(folder);
  await mkdir(join(folder, "meta"));
  for (const { tag } of entries) {
    await cp(join(allMigrations, `${tag}.sql`), join(folder, `${tag}.sql`));
  }
  await writeFile(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  return folder;
}

async function newDatabase(): Promise<TemporaryDatabase> {
  const database = await createTemporaryDatabase();
  databases.push(database);
  return database;
}

async function query<T extends object>(url: string, text: string): Promise<T[]> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return (await client.unsafe(text)) as unknown as T[];
  } finally {
    await client.end();
  }
}

// A database as it was before sign-in: 100 contacts, revenge records for every third one,
// the five starting groups of 0005 plus one more, and people in them.
async function fillDatabaseBeforeSignIn(url: string): Promise<void> {
  await query(
    url,
    `insert into contacts (name, notes, contact_frequency)
     select 'Контакт ' || n, 'Заметка ' || n, case when n % 4 = 0 then 'month'::contact_frequency end
     from generate_series(1, 100) as n`,
  );
  await query(
    url,
    `insert into interactions (contact_id, occurred_on, summary)
     select id, date '2026-10-01' - id, 'Отомстил' from contacts where id % 3 = 0`,
  );
  await query(url, "insert into groups (name) values ('Сквош')");
  await query(
    url,
    `insert into contact_groups (contact_id, group_id)
     select c.id, g.id from contacts c cross join groups g where (c.id + g.id) % 5 = 0`,
  );
}

type RowCounts = { contacts: number; interactions: number; groups: number; links: number };

async function countRows(url: string): Promise<RowCounts> {
  const [counts] = await query<RowCounts>(
    url,
    `select
       (select count(*)::int from contacts) as contacts,
       (select count(*)::int from interactions) as interactions,
       (select count(*)::int from groups) as groups,
       (select count(*)::int from contact_groups) as links`,
  );
  return counts;
}

// Who owns what after the update: the ids of the owners of contacts and of groups.
async function ownersOf(url: string) {
  return query<{ table: string; owner_id: number | null; count: number }>(
    url,
    `select 'contacts' as table, owner_id, count(*)::int as count from contacts group by owner_id
     union all
     select 'groups', owner_id, count(*)::int from groups group by owner_id
     order by 1, 2`,
  );
}

async function usersOf(url: string) {
  return query<{ id: number; name: string; email: string; email_verified: boolean }>(
    url,
    "select id, name, email, email_verified from users order by id",
  );
}

// How many migrations the database has applied.
async function appliedCount(url: string): Promise<number> {
  const [row] = await query<{ count: number }>(
    url,
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  return row.count;
}

describe("migrations", () => {
  it(
    "create the starting groups, give them to the owner and leave nobody in them",
    { timeout: 30_000 },
    async () => {
      const { url } = await newDatabase();
      await migrateTo(url, allMigrations);

      const groups = await query<{ name: string }>(url, "select name from groups");
      expect(groups.map((group) => group.name).sort()).toEqual(STARTING_GROUPS);

      const [owner] = await usersOf(url);
      expect(await ownersOf(url)).toEqual([{ table: "groups", owner_id: owner.id, count: 5 }]);
      const [links] = await query<{ count: number }>(
        url,
        "select count(*)::int as count from contact_groups",
      );
      expect(links.count).toBe(0);
    },
  );

  it("keep the contacts that were there before, without groups", { timeout: 30_000 }, async () => {
    const { url } = await newDatabase();
    await migrateTo(url, await copyFirstMigrations(MIGRATIONS_BEFORE_GROUPS));

    await query(
      url,
      `insert into contacts (name, how_we_met, phone, email, notes, contact_frequency)
       select 'Контакт ' || n, 'Познакомились ' || n, '+7 900 ' || n, 'c' || n || '@example.com',
         'Заметка ' || n, case when n % 4 = 0 then 'month'::contact_frequency end
       from generate_series(1, 1000) as n`,
    );
    const before = await query(url, "select * from contacts order by id");
    expect(before).toHaveLength(1000);

    await migrateTo(url, allMigrations);

    const after = await query<{ owner_id: number }>(url, "select * from contacts order by id");
    expect(after.map(withoutOwner)).toEqual(before.map(withNoBirthday));
    const [links] = await query<{ count: number }>(
      url,
      "select count(*)::int as count from contact_groups",
    );
    expect(links.count).toBe(0);
  });

  it(
    "add the sign-in tables and keep every row that was there before",
    { timeout: 30_000 },
    async () => {
      const { url } = await newDatabase();
      await migrateTo(url, await copyFirstMigrations(MIGRATIONS_BEFORE_SIGN_IN));
      await fillDatabaseBeforeSignIn(url);
      const before = await countRows(url);

      await migrateTo(url, allMigrations);

      const tables = await query<{ tablename: string }>(
        url,
        "select tablename from pg_tables where schemaname = 'public'",
      );
      expect(tables.map((table) => table.tablename)).toEqual(
        expect.arrayContaining([
          "users",
          "sessions",
          "accounts",
          "verifications",
          "sign_in_emails",
        ]),
      );
      expect(await countRows(url)).toEqual(before);
    },
  );

  it("give the contacts that were there before no frequency", { timeout: 30_000 }, async () => {
    const { url } = await newDatabase();
    await migrateTo(url, await copyFirstMigrations(MIGRATIONS_BEFORE_FREQUENCY));

    await query(
      url,
      `insert into contacts (name, how_we_met, phone, email, notes)
       select 'Контакт ' || n, 'Познакомились ' || n, '+7 900 ' || n, 'c' || n || '@example.com',
         'Заметка ' || n
       from generate_series(1, 1000) as n`,
    );
    const before = await query(url, "select * from contacts order by id");

    await migrateTo(url, allMigrations);

    const after = await query<{ owner_id: number; contact_frequency: string | null }>(
      url,
      "select * from contacts order by id",
    );
    expect(after.map(withoutOwner)).toEqual(
      before.map((contact) => ({ ...withNoBirthday(contact), contact_frequency: null })),
    );
  });

  // "Существующие контакты" of the birthdays spec.
  it("give the contacts that were there before no birthday", { timeout: 30_000 }, async () => {
    const { url } = await newDatabase();
    await migrateTo(url, await copyFirstMigrations(MIGRATIONS_BEFORE_BIRTHDAY));
    const [owner] = await usersOf(url);

    await query(
      url,
      `insert into contacts (owner_id, name, how_we_met, phone, email, notes, contact_frequency)
       select ${owner.id}, 'Контакт ' || n, 'Познакомились ' || n, '+7 900 ' || n,
         'c' || n || '@example.com', 'Заметка ' || n,
         case when n % 4 = 0 then 'month'::contact_frequency end
       from generate_series(1, 1000) as n`,
    );
    const before = await query(url, "select * from contacts order by id");
    expect(before).toHaveLength(1000);

    await migrateTo(url, allMigrations);

    const after = await query(url, "select * from contacts order by id");
    expect(after).toEqual(before.map(withNoBirthday));
  });
});

// "Прежние данные — владельцу" and "Без почты владельца обновление не проходит" of the
// data-ownership spec: a database as it was before the owner, then every migration.
describe("migrations to owned data", () => {
  async function databaseBeforeOwner() {
    const { url } = await newDatabase();
    await migrateTo(url, await copyFirstMigrations(MIGRATIONS_BEFORE_OWNER));
    await fillDatabaseBeforeSignIn(url);
    return url;
  }

  const snapshot = async (url: string) => ({
    counts: await countRows(url),
    contacts: await query(url, "select * from contacts order by id"),
    interactions: await query(url, "select * from interactions order by id"),
    groups: await query(url, "select * from groups order by id"),
    links: await query(url, "select * from contact_groups order by contact_id, group_id"),
  });

  it(
    "give every contact and group to the user of OWNER_EMAIL and keep every row",
    { timeout: 30_000 },
    async () => {
      const url = await databaseBeforeOwner();
      const before = await snapshot(url);

      await migrateTo(url, allMigrations);

      const users = await usersOf(url);
      expect(users).toEqual([
        { id: expect.any(Number), name: "", email: TEST_OWNER_EMAIL, email_verified: true },
      ]);
      expect(await ownersOf(url)).toEqual([
        { table: "contacts", owner_id: users[0].id, count: 100 },
        { table: "groups", owner_id: users[0].id, count: 6 },
      ]);

      const after = await snapshot(url);
      expect(after.counts).toEqual(before.counts);
      expect(after.contacts.map(withoutOwner)).toEqual(before.contacts.map(withNoBirthday));
      expect(after.groups.map(withoutOwner)).toEqual(before.groups);
      // Revenge records and who is in which group belong to the contact: untouched.
      expect(after.interactions).toEqual(before.interactions);
      expect(after.links).toEqual(before.links);
    },
  );

  it(
    "take the owner's email without spaces at the edges and in lowercase",
    { timeout: 30_000 },
    async () => {
      const url = await databaseBeforeOwner();

      await applyMigrations(url, "  Owner@Example.com ", allMigrations);

      const users = await usersOf(url);
      expect(users.map((user) => user.email)).toEqual(["owner@example.com"]);
      expect(await ownersOf(url)).toEqual([
        { table: "contacts", owner_id: users[0].id, count: 100 },
        { table: "groups", owner_id: users[0].id, count: 6 },
      ]);
    },
  );

  it("take the user with that email if there is one already", { timeout: 30_000 }, async () => {
    const url = await databaseBeforeOwner();
    await query(
      url,
      `insert into users (name, email, email_verified) values ('', '${TEST_OWNER_EMAIL}', true)`,
    );
    const [existing] = await usersOf(url);

    await migrateTo(url, allMigrations);

    expect(await usersOf(url)).toEqual([existing]);
    expect(await ownersOf(url)).toEqual([
      { table: "contacts", owner_id: existing.id, count: 100 },
      { table: "groups", owner_id: existing.id, count: 6 },
    ]);
  });

  it(
    "stop without the owner's email or with a wrong one, and change nothing",
    { timeout: 60_000 },
    async () => {
      const url = await databaseBeforeOwner();
      const before = await snapshot(url);

      // The runner checks the setting before it connects.
      for (const ownerEmail of [undefined, "", "   ", "not-an-email", "a b@example.com"]) {
        expect(await failure(applyMigrations(url, ownerEmail, allMigrations))).toBe(NO_OWNER_EMAIL);
      }
      // The migration itself stops too, if it is run some other way.
      for (const ownerEmail of [null, "", "not-an-email", `${"a".repeat(250)}@example.com`]) {
        expect(await failure(migrateWithSetting(url, ownerEmail))).toContain(NO_OWNER_EMAIL);
      }

      expect(await appliedCount(url)).toBe(MIGRATIONS_BEFORE_OWNER);
      expect(await snapshot(url)).toEqual(before);
      expect(await usersOf(url)).toEqual([]);
    },
  );
});
