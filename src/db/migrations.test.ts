import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { createTemporaryDatabase, type TemporaryDatabase } from "@/test/temporary-database";

const allMigrations = fileURLToPath(new URL("../../drizzle", import.meta.url));

// The migrations that existed before groups: 0000 to 0003.
const MIGRATIONS_BEFORE_GROUPS = 4;

const STARTING_GROUPS = ["Аналитики", "Друзья", "Знакомые", "Семья", "Теннис"];

const databases: TemporaryDatabase[] = [];
const folders: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.drop()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function applyMigrations(url: string, migrationsFolder: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
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

describe("migrations", () => {
  it("create the starting groups and leave nobody in them", { timeout: 30_000 }, async () => {
    const { url } = await newDatabase();
    await applyMigrations(url, allMigrations);

    const groups = await query<{ name: string }>(url, "select name from groups");
    expect(groups.map((group) => group.name).sort()).toEqual(STARTING_GROUPS);

    const [links] = await query<{ count: number }>(url, "select count(*)::int as count from contact_groups");
    expect(links.count).toBe(0);
  });

  it("keep the contacts that were there before, without groups", { timeout: 30_000 }, async () => {
    const { url } = await newDatabase();
    await applyMigrations(url, await copyFirstMigrations(MIGRATIONS_BEFORE_GROUPS));

    await query(
      url,
      `insert into contacts (name, how_we_met, phone, email, notes, contact_frequency)
       select 'Контакт ' || n, 'Познакомились ' || n, '+7 900 ' || n, 'c' || n || '@example.com',
         'Заметка ' || n, case when n % 4 = 0 then 'month'::contact_frequency end
       from generate_series(1, 1000) as n`,
    );
    const before = await query(url, "select * from contacts order by id");
    expect(before).toHaveLength(1000);

    await applyMigrations(url, allMigrations);

    expect(await query(url, "select * from contacts order by id")).toEqual(before);
    const [links] = await query<{ count: number }>(url, "select count(*)::int as count from contact_groups");
    expect(links.count).toBe(0);
  });
});
