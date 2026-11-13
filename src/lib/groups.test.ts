import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { contactGroups, contacts } from "@/db/schema";
import { addContact, addGroup, addToGroups, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import type { ContactInput } from "./contact-schema";
import { insertContact, updateContactById } from "./contacts";
import { createGroup, deleteGroup, listContactGroups, listGroups, renameGroup } from "./groups";

// The signed-in user of most tests, and another one who must not see or change their groups.
let owner: number;
let stranger: number;

async function setUp() {
  await resetDatabase();
  owner = (await addUser("anna@example.com")).id;
  stranger = (await addUser("boris@example.com")).id;
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

async function contactGroupNames(contactId: number): Promise<string[]> {
  const byContact = await listContactGroups(owner, [contactId]);
  return names(byContact.get(contactId) ?? []);
}

describe("groups", () => {
  beforeEach(setUp);

  describe("createGroup", () => {
    it("adds the group with nobody in it", async () => {
      await addGroup(owner, "Семья");
      await addGroup(owner, "Теннис");

      const result = await createGroup(owner, "Сквош");

      expect(result.status).toBe("created");
      expect(await listGroups(owner)).toEqual([
        { id: expect.any(Number), name: "Семья", contactCount: 0 },
        { id: expect.any(Number), name: "Сквош", contactCount: 0 },
        { id: expect.any(Number), name: "Теннис", contactCount: 0 },
      ]);
    });

    it("refuses a name that differs only by case", async () => {
      await addGroup(owner, "Теннис");

      expect((await createGroup(owner, "теннис")).status).toBe("duplicate");
      expect(names(await listGroups(owner))).toEqual(["Теннис"]);
    });

    it("refuses a name that differs only by ё and е", async () => {
      await addGroup(owner, "Ёлка");

      expect((await createGroup(owner, "Елка")).status).toBe("duplicate");
      expect(names(await listGroups(owner))).toEqual(["Ёлка"]);
    });
  });

  describe("renameGroup", () => {
    it("changes the name and keeps the people", async () => {
      const analysts = await addGroup(owner, "Аналитики");
      const anna = await addContact(owner, { name: "Анна" });
      const boris = await addContact(owner, { name: "Борис" });
      await addToGroups(anna.id, analysts.id);
      await addToGroups(boris.id, analysts.id);

      expect((await renameGroup(owner, analysts.id, "Коллеги")).status).toBe("renamed");

      expect(await listGroups(owner)).toEqual([
        { id: analysts.id, name: "Коллеги", contactCount: 2 },
      ]);
      expect(await contactGroupNames(anna.id)).toEqual(["Коллеги"]);
    });

    it("refuses a name that another group has, whatever the case", async () => {
      await addGroup(owner, "Друзья");
      const acquaintances = await addGroup(owner, "Знакомые");

      expect((await renameGroup(owner, acquaintances.id, "друзья")).status).toBe("duplicate");
      expect(names(await listGroups(owner))).toEqual(["Друзья", "Знакомые"]);
    });

    it("lets a group change only the case of its own name", async () => {
      const tennis = await addGroup(owner, "Теннис");

      expect((await renameGroup(owner, tennis.id, "ТЕННИС")).status).toBe("renamed");
      expect(names(await listGroups(owner))).toEqual(["ТЕННИС"]);
    });

    it("says so when the group is already deleted", async () => {
      const tennis = await addGroup(owner, "Теннис");
      await deleteGroup(owner, tennis.id);

      expect((await renameGroup(owner, tennis.id, "Сквош")).status).toBe("not-found");
      expect(await listGroups(owner)).toEqual([]);
    });
  });

  describe("deleteGroup", () => {
    it("removes the group and keeps the people with their other groups", async () => {
      const family = await addGroup(owner, "Семья");
      const tennis = await addGroup(owner, "Теннис");
      const anna = await addContact(owner, { name: "Анна" });
      await addToGroups(anna.id, family.id, tennis.id);

      expect((await deleteGroup(owner, tennis.id)).status).toBe("deleted");

      expect(names(await listGroups(owner))).toEqual(["Семья"]);
      expect(await contactGroupNames(anna.id)).toEqual(["Семья"]);
      expect(await runQuery("count", (db) => db.$count(contacts))).toBe(1);
    });

    it("says so when the group is already deleted", async () => {
      const tennis = await addGroup(owner, "Теннис");
      await deleteGroup(owner, tennis.id);

      expect((await deleteGroup(owner, tennis.id)).status).toBe("not-found");
    });
  });

  describe("listGroups", () => {
    it("is empty when there are no groups", async () => {
      expect(await listGroups(owner)).toEqual([]);
    });

    it("counts the people in each group", async () => {
      const family = await addGroup(owner, "Семья");
      const friends = await addGroup(owner, "Друзья");
      await addGroup(owner, "Теннис");
      const anna = await addContact(owner, { name: "Анна" });
      const boris = await addContact(owner, { name: "Борис" });
      await addToGroups(anna.id, family.id, friends.id);
      await addToGroups(boris.id, friends.id);

      expect(await listGroups(owner)).toEqual([
        { id: friends.id, name: "Друзья", contactCount: 2 },
        { id: family.id, name: "Семья", contactCount: 1 },
        { id: expect.any(Number), name: "Теннис", contactCount: 0 },
      ]);
    });

    it("goes by the Russian alphabet with ё next to е", async () => {
      for (const name of ["Жуки", "Ель", "Ёж", "Дед", "Яблоко", "Аналитики"]) {
        await addGroup(owner, name);
      }

      expect(names(await listGroups(owner))).toEqual([
        "Аналитики",
        "Дед",
        "Ёж",
        "Ель",
        "Жуки",
        "Яблоко",
      ]);
    });

    it("keeps a group when its only person is deleted", async () => {
      const squash = await addGroup(owner, "Сквош");
      const anna = await addContact(owner, { name: "Анна" });
      await addToGroups(anna.id, squash.id);
      expect((await listGroups(owner))[0].contactCount).toBe(1);

      await runQuery("deleteContact", (db) => db.delete(contacts).where(eq(contacts.id, anna.id)));

      expect(await listGroups(owner)).toEqual([{ id: squash.id, name: "Сквош", contactCount: 0 }]);
    });
  });

  describe("listContactGroups", () => {
    it("gives the groups of every contact, each in the Russian alphabet", async () => {
      const tennis = await addGroup(owner, "Теннис");
      const analysts = await addGroup(owner, "Аналитики");
      const family = await addGroup(owner, "Семья");
      const anna = await addContact(owner, { name: "Анна" });
      const boris = await addContact(owner, { name: "Борис" });
      const vera = await addContact(owner, { name: "Вера" });
      await addToGroups(anna.id, tennis.id, analysts.id, family.id);
      await addToGroups(boris.id, family.id);

      const byContact = await listContactGroups(owner, [anna.id, boris.id, vera.id]);

      expect(byContact.get(anna.id)).toEqual([
        { id: analysts.id, name: "Аналитики" },
        { id: family.id, name: "Семья" },
        { id: tennis.id, name: "Теннис" },
      ]);
      expect(byContact.get(boris.id)).toEqual([{ id: family.id, name: "Семья" }]);
      expect(byContact.get(vera.id)).toBeUndefined();
    });

    it("answers for an empty list without asking the database", async () => {
      expect((await listContactGroups(owner, [])).size).toBe(0);
    });
  });

  describe("people's dates", () => {
    it("are not changed by renaming or deleting a group", async () => {
      const analysts = await addGroup(owner, "Аналитики");
      const tennis = await addGroup(owner, "Теннис");
      const anna = await addContact(owner, {
        name: "Анна",
        updatedAt: new Date("2026-10-01T09:00:00Z"),
      });
      await addToGroups(anna.id, analysts.id, tennis.id);

      await renameGroup(owner, analysts.id, "Коллеги");
      await deleteGroup(owner, tennis.id);

      const [after] = await runQuery("readContact", (db) =>
        db.select().from(contacts).where(eq(contacts.id, anna.id)),
      );
      expect(after.updatedAt).toEqual(anna.updatedAt);
      expect(await runQuery("links", (db) => db.$count(contactGroups))).toBe(1);
    });
  });
});

// "Группы у каждого свои" of the data-ownership spec and "Названия групп не повторяются" of
// the contact-groups spec, with two users: `owner` (A) and `stranger` (B).
describe("each user's own groups", () => {
  beforeEach(setUp);

  function contactInput(overrides: Partial<ContactInput> = {}): ContactInput {
    return {
      name: "Борис",
      howWeMet: "",
      phone: "",
      email: "",
      notes: "",
      contactFrequency: null,
      groupIds: [],
      newGroupNames: [],
      ...overrides,
    };
  }

  it("shows a new group only to the user who made it", async () => {
    expect((await createGroup(owner, "Сквош")).status).toBe("created");

    expect(names(await listGroups(owner))).toEqual(["Сквош"]);
    expect(await listGroups(stranger)).toEqual([]);
  });

  it("lists the user's groups with the number of the user's people in each", async () => {
    const ownFriends = await addGroup(owner, "Друзья");
    await addGroup(owner, "Теннис");
    const friends = await addGroup(stranger, "Друзья");
    const colleagues = await addGroup(stranger, "Коллеги");
    const petr = await addContact(owner, { name: "Пётр" });
    await addToGroups(petr.id, ownFriends.id);
    const boris = await addContact(stranger, { name: "Борис" });
    await addToGroups(boris.id, friends.id, colleagues.id);

    expect(await listGroups(stranger)).toEqual([
      { id: friends.id, name: "Друзья", contactCount: 1 },
      { id: colleagues.id, name: "Коллеги", contactCount: 1 },
    ]);
  });

  it("lets two users have a group with the same name", async () => {
    const theirs = await addGroup(owner, "Друзья");

    expect((await createGroup(stranger, "друзья")).status).toBe("created");

    expect(names(await listGroups(stranger))).toEqual(["друзья"]);
    expect(await listGroups(owner)).toEqual([{ id: theirs.id, name: "Друзья", contactCount: 0 }]);
  });

  it("lets a group be renamed to a name another user has", async () => {
    await addGroup(owner, "Друзья");
    const colleagues = await addGroup(stranger, "Коллеги");

    expect((await renameGroup(stranger, colleagues.id, "Друзья")).status).toBe("renamed");
  });

  it("makes a group of the same name for the user from the contact window", async () => {
    const theirs = await addGroup(owner, "Сквош");

    const { id } = await insertContact(stranger, contactInput({ newGroupNames: ["Сквош"] }));

    const [own] = await listGroups(stranger);
    expect(own).toMatchObject({ name: "Сквош", contactCount: 1 });
    expect(own.id).not.toBe(theirs.id);
    expect((await listContactGroups(stranger, [id])).get(id)).toEqual([
      { id: own.id, name: "Сквош" },
    ]);
    expect((await listGroups(owner))[0].contactCount).toBe(0);
  });

  it("saves the user's contact without another user's group", async () => {
    const theirs = await addGroup(owner, "Теннис");
    const own = await addGroup(stranger, "Коллеги");

    const { id } = await insertContact(stranger, contactInput({ groupIds: [theirs.id, own.id] }));
    const boris = await addContact(stranger, { name: "Вера" });
    await updateContactById(
      stranger,
      boris.id,
      contactInput({ name: "Вера", groupIds: [theirs.id] }),
    );

    expect((await listContactGroups(stranger, [id])).get(id)).toEqual([
      { id: own.id, name: "Коллеги" },
    ]);
    expect((await listContactGroups(stranger, [boris.id])).get(boris.id)).toBeUndefined();
    expect(await listGroups(owner)).toEqual([{ id: theirs.id, name: "Теннис", contactCount: 0 }]);
    expect(await runQuery("links", (db) => db.$count(contactGroups))).toBe(1);
  });

  it("does not rename or delete another user's group", async () => {
    const theirs = await addGroup(owner, "Теннис");
    const petr = await addContact(owner, { name: "Пётр" });
    await addToGroups(petr.id, theirs.id);

    expect((await renameGroup(stranger, theirs.id, "Сквош")).status).toBe("not-found");
    expect((await deleteGroup(stranger, theirs.id)).status).toBe("not-found");

    expect(await listGroups(owner)).toEqual([{ id: theirs.id, name: "Теннис", contactCount: 1 }]);
  });

  it("does not give another user's groups of a contact", async () => {
    const theirs = await addGroup(owner, "Теннис");
    const petr = await addContact(owner, { name: "Пётр" });
    await addToGroups(petr.id, theirs.id);

    expect((await listContactGroups(stranger, [petr.id])).size).toBe(0);
  });
});
