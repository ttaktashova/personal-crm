import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { contactGroups, contacts } from "@/db/schema";
import { addContact, addGroup, addToGroups } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { createGroup, deleteGroup, listContactGroups, listGroups, renameGroup } from "./groups";

const names = (items: { name: string }[]) => items.map((item) => item.name);

async function contactGroupNames(contactId: number): Promise<string[]> {
  const byContact = await listContactGroups([contactId]);
  return names(byContact.get(contactId) ?? []);
}

describe("groups", () => {
  beforeEach(resetDatabase);

  describe("createGroup", () => {
    it("adds the group with nobody in it", async () => {
      await addGroup("Семья");
      await addGroup("Теннис");

      const result = await createGroup("Сквош");

      expect(result.status).toBe("created");
      expect(await listGroups()).toEqual([
        { id: expect.any(Number), name: "Семья", contactCount: 0 },
        { id: expect.any(Number), name: "Сквош", contactCount: 0 },
        { id: expect.any(Number), name: "Теннис", contactCount: 0 },
      ]);
    });

    it("refuses a name that differs only by case", async () => {
      await addGroup("Теннис");

      expect((await createGroup("теннис")).status).toBe("duplicate");
      expect(names(await listGroups())).toEqual(["Теннис"]);
    });

    it("refuses a name that differs only by ё and е", async () => {
      await addGroup("Ёлка");

      expect((await createGroup("Елка")).status).toBe("duplicate");
      expect(names(await listGroups())).toEqual(["Ёлка"]);
    });
  });

  describe("renameGroup", () => {
    it("changes the name and keeps the people", async () => {
      const analysts = await addGroup("Аналитики");
      const anna = await addContact({ name: "Анна" });
      const boris = await addContact({ name: "Борис" });
      await addToGroups(anna.id, analysts.id);
      await addToGroups(boris.id, analysts.id);

      expect((await renameGroup(analysts.id, "Коллеги")).status).toBe("renamed");

      expect(await listGroups()).toEqual([{ id: analysts.id, name: "Коллеги", contactCount: 2 }]);
      expect(await contactGroupNames(anna.id)).toEqual(["Коллеги"]);
    });

    it("refuses a name that another group has, whatever the case", async () => {
      await addGroup("Друзья");
      const acquaintances = await addGroup("Знакомые");

      expect((await renameGroup(acquaintances.id, "друзья")).status).toBe("duplicate");
      expect(names(await listGroups())).toEqual(["Друзья", "Знакомые"]);
    });

    it("lets a group change only the case of its own name", async () => {
      const tennis = await addGroup("Теннис");

      expect((await renameGroup(tennis.id, "ТЕННИС")).status).toBe("renamed");
      expect(names(await listGroups())).toEqual(["ТЕННИС"]);
    });

    it("says so when the group is already deleted", async () => {
      const tennis = await addGroup("Теннис");
      await deleteGroup(tennis.id);

      expect((await renameGroup(tennis.id, "Сквош")).status).toBe("not-found");
      expect(await listGroups()).toEqual([]);
    });
  });

  describe("deleteGroup", () => {
    it("removes the group and keeps the people with their other groups", async () => {
      const family = await addGroup("Семья");
      const tennis = await addGroup("Теннис");
      const anna = await addContact({ name: "Анна" });
      await addToGroups(anna.id, family.id, tennis.id);

      expect((await deleteGroup(tennis.id)).status).toBe("deleted");

      expect(names(await listGroups())).toEqual(["Семья"]);
      expect(await contactGroupNames(anna.id)).toEqual(["Семья"]);
      expect(await runQuery("count", (db) => db.$count(contacts))).toBe(1);
    });

    it("says so when the group is already deleted", async () => {
      const tennis = await addGroup("Теннис");
      await deleteGroup(tennis.id);

      expect((await deleteGroup(tennis.id)).status).toBe("not-found");
    });
  });

  describe("listGroups", () => {
    it("is empty when there are no groups", async () => {
      expect(await listGroups()).toEqual([]);
    });

    it("counts the people in each group", async () => {
      const family = await addGroup("Семья");
      const friends = await addGroup("Друзья");
      await addGroup("Теннис");
      const anna = await addContact({ name: "Анна" });
      const boris = await addContact({ name: "Борис" });
      await addToGroups(anna.id, family.id, friends.id);
      await addToGroups(boris.id, friends.id);

      expect(await listGroups()).toEqual([
        { id: friends.id, name: "Друзья", contactCount: 2 },
        { id: family.id, name: "Семья", contactCount: 1 },
        { id: expect.any(Number), name: "Теннис", contactCount: 0 },
      ]);
    });

    it("goes by the Russian alphabet with ё next to е", async () => {
      for (const name of ["Жуки", "Ель", "Ёж", "Дед", "Яблоко", "Аналитики"]) {
        await addGroup(name);
      }

      expect(names(await listGroups())).toEqual([
        "Аналитики",
        "Дед",
        "Ёж",
        "Ель",
        "Жуки",
        "Яблоко",
      ]);
    });

    it("keeps a group when its only person is deleted", async () => {
      const squash = await addGroup("Сквош");
      const anna = await addContact({ name: "Анна" });
      await addToGroups(anna.id, squash.id);
      expect((await listGroups())[0].contactCount).toBe(1);

      await runQuery("deleteContact", (db) => db.delete(contacts).where(eq(contacts.id, anna.id)));

      expect(await listGroups()).toEqual([{ id: squash.id, name: "Сквош", contactCount: 0 }]);
    });
  });

  describe("listContactGroups", () => {
    it("gives the groups of every contact, each in the Russian alphabet", async () => {
      const tennis = await addGroup("Теннис");
      const analysts = await addGroup("Аналитики");
      const family = await addGroup("Семья");
      const anna = await addContact({ name: "Анна" });
      const boris = await addContact({ name: "Борис" });
      const vera = await addContact({ name: "Вера" });
      await addToGroups(anna.id, tennis.id, analysts.id, family.id);
      await addToGroups(boris.id, family.id);

      const byContact = await listContactGroups([anna.id, boris.id, vera.id]);

      expect(byContact.get(anna.id)).toEqual([
        { id: analysts.id, name: "Аналитики" },
        { id: family.id, name: "Семья" },
        { id: tennis.id, name: "Теннис" },
      ]);
      expect(byContact.get(boris.id)).toEqual([{ id: family.id, name: "Семья" }]);
      expect(byContact.get(vera.id)).toBeUndefined();
    });

    it("answers for an empty list without asking the database", async () => {
      expect((await listContactGroups([])).size).toBe(0);
    });
  });

  describe("people's dates", () => {
    it("are not changed by renaming or deleting a group", async () => {
      const analysts = await addGroup("Аналитики");
      const tennis = await addGroup("Теннис");
      const anna = await addContact({
        name: "Анна",
        updatedAt: new Date("2026-10-01T09:00:00Z"),
      });
      await addToGroups(anna.id, analysts.id, tennis.id);

      await renameGroup(analysts.id, "Коллеги");
      await deleteGroup(tennis.id);

      const [after] = await runQuery("readContact", (db) =>
        db.select().from(contacts).where(eq(contacts.id, anna.id)),
      );
      expect(after.updatedAt).toEqual(anna.updatedAt);
      expect(await runQuery("links", (db) => db.$count(contactGroups))).toBe(1);
    });
  });
});
