import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { contacts, users } from "@/db/schema";
import { addContacts, addGroup, addUser } from "@/test/factories";
import { TEST_OWNER_EMAIL } from "@/test/owner";
import { resetDatabase } from "@/test/reset-database";

import { seedDatabase, seedMessage } from "../../scripts/seed-database";

// "Тестовые данные у владельца" of the data-ownership spec: pnpm db:seed fills the list of the
// user with OWNER_EMAIL, on the test database.

let client: postgres.Sql;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  db = drizzle(client);
});

afterAll(async () => {
  await client.end();
});

beforeEach(resetDatabase);

async function contactsOf(ownerId: number): Promise<number> {
  return runQuery("contactsOf", (database) =>
    database.$count(contacts, eq(contacts.ownerId, ownerId)),
  );
}

async function userId(email: string): Promise<number | undefined> {
  const [user] = await runQuery("userId", (database) =>
    database.select({ id: users.id }).from(users).where(eq(users.email, email)),
  );
  return user?.id;
}

describe("seedDatabase", () => {
  it("gives the owner 1000 contacts, and another user none", { timeout: 30_000 }, async () => {
    const boris = await addUser("boris@example.com");

    const result = await seedDatabase(db, "  Owner@Example.com ");

    expect(result).toMatchObject({ status: "seeded", contacts: 1000 });
    const owner = await userId(TEST_OWNER_EMAIL);
    expect(owner).toBeDefined();
    expect(await contactsOf(owner!)).toBe(1000);
    expect(await contactsOf(boris.id)).toBe(0);
  });

  it("puts the people into the owner's groups only", { timeout: 30_000 }, async () => {
    const owner = await addUser(TEST_OWNER_EMAIL);
    for (const name of ["Аналитики", "Друзья", "Знакомые", "Семья", "Теннис"]) {
      await addGroup(owner.id, name);
    }
    const boris = await addUser("boris@example.com");
    await addGroup(boris.id, "Коллеги");

    const result = await seedDatabase(db, TEST_OWNER_EMAIL);

    expect(result.status).toBe("seeded");
    if (result.status !== "seeded") return;
    expect(result.memberships).toBeGreaterThan(0);
    const [links] = await runQuery("links", (database) =>
      database.execute<{ own: number; foreign: number }>(sql`
        select
          count(*) filter (where c.owner_id = g.owner_id)::int as own,
          count(*) filter (where c.owner_id <> g.owner_id or g.owner_id = ${boris.id})::int as foreign
        from contact_groups cg
        join contacts c on c.id = cg.contact_id
        join groups g on g.id = cg.group_id
      `),
    );
    expect(links).toEqual({ own: result.memberships, foreign: 0 });
  });

  it("changes nothing when the owner has contacts already", async () => {
    const owner = await addUser(TEST_OWNER_EMAIL);
    await addContacts(owner.id, ["Анна"]);

    const result = await seedDatabase(db, TEST_OWNER_EMAIL);

    expect(result).toEqual({ status: "skipped", existing: 1 });
    expect(await contactsOf(owner.id)).toBe(1);
    expect(seedMessage(result)).toBe(
      "Seed skipped: the owner already has 1 contacts. Nothing was changed.",
    );
  });

  it("refuses an owner's email that is not an email", async () => {
    await expect(seedDatabase(db, "not-an-email")).rejects.toThrow(
      "OWNER_EMAIL is not set or is not an email",
    );
    expect(await runQuery("users", (database) => database.$count(users))).toBe(0);
  });
});
