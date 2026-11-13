import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { contacts, users } from "@/db/schema";

import { resetDatabase } from "./reset-database";

describe("test database", () => {
  beforeEach(resetDatabase);

  it("is not the main database", async () => {
    const [current] = await runQuery("currentDatabase", (db) =>
      db.execute<{ name: string }>(sql`select current_database() as name`),
    );
    expect(current.name).toMatch(/_test$/);
  });

  it("starts every test empty, with ids from 1", async () => {
    // A contact needs its owner.
    const insert = () =>
      runQuery("insertContact", async (db) => {
        const [owner] = await db
          .insert(users)
          .values({ name: "", email: "anna@example.com" })
          .returning({ id: users.id });
        return db
          .insert(contacts)
          .values({ name: "Анна", ownerId: owner.id })
          .returning({ id: contacts.id });
      });

    expect(await insert()).toEqual([{ id: 1 }]);
    await resetDatabase();
    expect(await runQuery("countContacts", (db) => db.$count(contacts))).toBe(0);
    expect(await insert()).toEqual([{ id: 1 }]);
  });
});
