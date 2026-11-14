import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { resetDatabase } from "@/test/reset-database";

// Plain SQL on purpose: these tests check what the database itself allows,
// not what the form or the Drizzle schema says.
async function run<T extends Record<string, unknown> = Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const rows = await runQuery("birthdayConstraintsTest", (db) => db.execute<T>(query));
  return Array.from(rows) as T[];
}

let owner: number;

type BirthdayColumns = { day: number | null; month: number | null; year: number | null };

const addContact = ({ day, month, year }: BirthdayColumns) =>
  run(sql`insert into contacts (owner_id, name, birth_day, birth_month, birth_year)
          values (${owner}, 'Анна', ${day}::smallint, ${month}::smallint, ${year}::smallint)`);

async function countContacts(): Promise<number> {
  const [row] = await run<{ count: number }>(sql`select count(*)::int as count from contacts`);
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

describe("the birthday in the database", () => {
  beforeEach(async () => {
    await resetDatabase();
    const [user] = await run<{ id: number }>(
      sql`insert into users (name, email, email_verified)
          values ('', 'anna@example.com', true) returning id`,
    );
    owner = user.id;
  });

  it.each([
    ["a day without a month", { day: 17, month: null, year: null }],
    ["a month without a day", { day: null, month: 11, year: null }],
    ["a year without a day and a month", { day: null, month: null, year: 1990 }],
    ["month 13", { day: 1, month: 13, year: null }],
    ["30 February", { day: 30, month: 2, year: null }],
    ["31 April", { day: 31, month: 4, year: null }],
  ])("does not let in %s", async (_, birthday) => {
    const error = await expectDatabaseError(addContact(birthday));

    expect(error.code).toBe("23514");
    expect(error.constraint).toBe("contacts_birthday_check");
    expect(await countContacts()).toBe(0);
  });

  it.each([
    ["29 February without a year", { day: 29, month: 2, year: null }],
    ["17.11.1990", { day: 17, month: 11, year: 1990 }],
    ["no birthday at all", { day: null, month: null, year: null }],
  ])("lets in %s", async (_, birthday) => {
    await addContact(birthday);

    expect(await countContacts()).toBe(1);
  });
});
