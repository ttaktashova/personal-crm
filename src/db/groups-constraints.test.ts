import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { resetDatabase } from "@/test/reset-database";

// Plain SQL on purpose: these tests check what the database itself allows,
// not what the Drizzle schema says.
async function run<T extends Record<string, unknown> = Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const rows = await runQuery("groupsConstraintsTest", (db) => db.execute<T>(query));
  return Array.from(rows) as T[];
}

async function insertId(query: SQL): Promise<number> {
  const [row] = await run<{ id: number }>(query);
  return row.id;
}

// Contacts and groups belong to a user: `owner` unless another one is named.
let owner: number;

const addUser = (email: string) =>
  insertId(
    sql`insert into users (name, email, email_verified) values ('', ${email}, true) returning id`,
  );
const addContact = (name: string, ownerId = owner) =>
  insertId(sql`insert into contacts (owner_id, name) values (${ownerId}, ${name}) returning id`);
const addGroup = (name: string, ownerId = owner) =>
  insertId(sql`insert into groups (owner_id, name) values (${ownerId}, ${name}) returning id`);
const addToGroup = (contactId: number, groupId: number) =>
  run(sql`insert into contact_groups (contact_id, group_id) values (${contactId}, ${groupId})`);

async function count(table: "contacts" | "groups" | "contact_groups"): Promise<number> {
  const [row] = await run<{ count: number }>(
    sql`select count(*)::int as count from ${sql.identifier(table)}`,
  );
  return row.count;
}

async function expectDatabaseError(promise: Promise<unknown>): Promise<DatabaseError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DatabaseError);
  return error as DatabaseError;
}

describe("groups in the database", () => {
  beforeEach(async () => {
    await resetDatabase();
    owner = await addUser("anna@example.com");
  });

  it("does not let a contact or a group in without an owner", async () => {
    const contact = await expectDatabaseError(
      run(sql`insert into contacts (name) values ('Анна')`),
    );
    expect(contact.code).toBe("23502");
    expect(contact.column).toBe("owner_id");

    const group = await expectDatabaseError(run(sql`insert into groups (name) values ('Теннис')`));
    expect(group.code).toBe("23502");
    expect(group.column).toBe("owner_id");

    expect(await count("contacts")).toBe(0);
    expect(await count("groups")).toBe(0);
  });

  it("lets two users each have a group of the same name", async () => {
    const boris = await addUser("boris@example.com");
    await addGroup("Друзья");

    await addGroup("друзья", boris);

    expect(await count("groups")).toBe(2);
  });

  it("does not let a person into one group twice", async () => {
    const anna = await addContact("Анна");
    const tennis = await addGroup("Теннис");
    await addToGroup(anna, tennis);

    const error = await expectDatabaseError(addToGroup(anna, tennis));

    expect(error.code).toBe("23505");
    expect(error.table).toBe("contact_groups");
    expect(await count("contact_groups")).toBe(1);
  });

  it("does not let two groups differ only by case", async () => {
    await addGroup("Теннис");

    const error = await expectDatabaseError(addGroup("теннис"));

    expect(error.code).toBe("23505");
    expect(error.constraint).toBe("groups_name_key");
    expect(await count("groups")).toBe(1);
  });

  it("does not let two groups differ only by ё and е", async () => {
    await addGroup("Ёлка");

    const error = await expectDatabaseError(addGroup("Елка"));

    expect(error.code).toBe("23505");
    expect(error.constraint).toBe("groups_name_key");
    expect(await count("groups")).toBe(1);
  });

  it("removes a deleted contact from its groups and keeps the groups", async () => {
    const anna = await addContact("Анна");
    const tennis = await addGroup("Теннис");
    const family = await addGroup("Семья");
    await addToGroup(anna, tennis);
    await addToGroup(anna, family);

    await run(sql`delete from contacts where id = ${anna}`);

    expect(await count("contact_groups")).toBe(0);
    expect(await count("groups")).toBe(2);
  });

  it("removes a deleted group from its people and keeps the people", async () => {
    const anna = await addContact("Анна");
    const boris = await addContact("Борис");
    const tennis = await addGroup("Теннис");
    const family = await addGroup("Семья");
    await addToGroup(anna, tennis);
    await addToGroup(boris, tennis);
    await addToGroup(anna, family);

    await run(sql`delete from groups where id = ${tennis}`);

    expect(await count("contacts")).toBe(2);
    const left = await run<{ contact_id: number; group_id: number }>(
      sql`select contact_id, group_id from contact_groups`,
    );
    expect(left).toEqual([{ contact_id: anna, group_id: family }]);
  });
});
