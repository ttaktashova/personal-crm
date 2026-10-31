import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { contacts } from "@/db/schema";
import { addContact, addContacts, addGroup, addToGroups } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import type { ContactInput } from "./contact-schema";
import { getContact, insertContact, listContactsPage, updateContactById } from "./contacts";
import { deleteGroup, listContactGroups, listGroups } from "./groups";
import { listDueContacts } from "./keep-in-touch";
import { toSearchWords } from "./search";

function contactInput(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    name: "Анна Смирнова",
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

async function groupNamesOf(contactId: number): Promise<string[]> {
  const byContact = await listContactGroups([contactId]);
  return (byContact.get(contactId) ?? []).map((group) => group.name);
}

const allGroupNames = async () => (await listGroups()).map((group) => group.name);
const countContacts = () => runQuery("countContacts", (db) => db.$count(contacts));

// Makes every insert into contact_groups fail, the way a database that went away halfway
// through saving would. By then the new groups and the contact row are already written.
async function withFailingGroupLinks<T>(run: () => Promise<T>): Promise<T> {
  const exec = (query: ReturnType<typeof sql>) => runQuery("trigger", (db) => db.execute(query));
  await exec(sql`
    create function fail_group_link() returns trigger language plpgsql
    as $$ begin raise exception 'forced failure'; end $$
  `);
  await exec(sql`
    create trigger fail_group_link before insert on contact_groups
    for each row execute function fail_group_link()
  `);
  try {
    return await run();
  } finally {
    await exec(sql`drop trigger fail_group_link on contact_groups`);
    await exec(sql`drop function fail_group_link()`);
  }
}

describe("saving a contact with groups", () => {
  beforeEach(resetDatabase);

  describe("insertContact", () => {
    it("puts the person into the two chosen groups", async () => {
      const family = await addGroup("Семья");
      const tennis = await addGroup("Теннис");

      const { id } = await insertContact(contactInput({ groupIds: [tennis.id, family.id] }));

      expect(await groupNamesOf(id)).toEqual(["Семья", "Теннис"]);
      expect((await listGroups()).map((group) => group.contactCount)).toEqual([1, 1]);
    });

    it("saves a person without groups", async () => {
      await addGroup("Семья");

      const { id } = await insertContact(contactInput());

      expect((await getContact(id))?.name).toBe("Анна Смирнова");
      expect(await groupNamesOf(id)).toEqual([]);
      expect((await listGroups())[0].contactCount).toBe(0);
    });

    it("creates a new group together with the contact", async () => {
      const { id } = await insertContact(contactInput({ newGroupNames: ["Сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(id)).toEqual(["Сквош"]);
    });

    it("joins chosen and new groups", async () => {
      const family = await addGroup("Семья");

      const { id } = await insertContact(
        contactInput({ groupIds: [family.id], newGroupNames: ["Сквош"] }),
      );

      expect(await groupNamesOf(id)).toEqual(["Семья", "Сквош"]);
    });

    it("uses the group another tab created meanwhile instead of making a second one", async () => {
      await addGroup("Сквош");

      const { id } = await insertContact(contactInput({ newGroupNames: ["сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(id)).toEqual(["Сквош"]);
    });

    it("saves the person without a group that was deleted while the window was open", async () => {
      const family = await addGroup("Семья");
      const tennis = await addGroup("Теннис");
      await deleteGroup(tennis.id);

      const { id } = await insertContact(contactInput({ groupIds: [family.id, tennis.id] }));

      expect(await groupNamesOf(id)).toEqual(["Семья"]);
    });

    it("shows the saved groups on a fresh read, as another browser would", async () => {
      const tennis = await addGroup("Теннис");
      const { id } = await insertContact(contactInput({ groupIds: [tennis.id] }));

      const contact = await getContact(id);
      const groups = (await listContactGroups([id])).get(id);

      expect(contact?.name).toBe("Анна Смирнова");
      expect(groups).toEqual([{ id: tennis.id, name: "Теннис" }]);
    });

    it("leaves neither the contact nor the new group when saving fails", async () => {
      const family = await addGroup("Семья");

      await expect(
        withFailingGroupLinks(() =>
          insertContact(contactInput({ groupIds: [family.id], newGroupNames: ["Сквош"] })),
        ),
      ).rejects.toBeInstanceOf(DatabaseError);

      expect(await countContacts()).toBe(0);
      expect(await allGroupNames()).toEqual(["Семья"]);
    });
  });

  describe("updateContactById", () => {
    it("takes a group away and keeps the other", async () => {
      const friends = await addGroup("Друзья");
      const tennis = await addGroup("Теннис");
      const anna = await addContact({ name: "Анна Смирнова" });
      await addToGroups(anna.id, friends.id, tennis.id);

      const result = await updateContactById(anna.id, contactInput({ groupIds: [friends.id] }));

      expect(result).toEqual({ id: anna.id });
      expect(await groupNamesOf(anna.id)).toEqual(["Друзья"]);
      expect((await listGroups()).map((group) => group.contactCount)).toEqual([1, 0]);
    });

    it("changes the fields together with the groups", async () => {
      const tennis = await addGroup("Теннис");
      const anna = await addContact({ name: "Анна Смирнова" });

      await updateContactById(
        anna.id,
        contactInput({ name: "Анна Петрова", howWeMet: "Корт", groupIds: [tennis.id] }),
      );

      const after = await getContact(anna.id);
      expect(after).toMatchObject({ name: "Анна Петрова", howWeMet: "Корт" });
      expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    });

    it("creates a new group together with the change", async () => {
      const anna = await addContact({ name: "Анна Смирнова" });

      await updateContactById(anna.id, contactInput({ newGroupNames: ["Сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(anna.id)).toEqual(["Сквош"]);
    });

    it("moves the «изменён» date when only the groups changed", async () => {
      const tennis = await addGroup("Теннис");
      const before = new Date("2026-10-01T09:00:00Z");
      const anna = await addContact({ name: "Анна Смирнова", updatedAt: before });

      await updateContactById(anna.id, contactInput({ groupIds: [tennis.id] }));

      const after = await getContact(anna.id);
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
      expect(after!.createdAt).toEqual(anna.createdAt);
    });

    it("answers null and creates no group when the contact is gone", async () => {
      const result = await updateContactById(999, contactInput({ newGroupNames: ["Сквош"] }));

      expect(result).toBeNull();
      expect(await allGroupNames()).toEqual([]);
    });

    it("changes nothing when saving fails", async () => {
      const friends = await addGroup("Друзья");
      const anna = await addContact({ name: "Анна Смирнова" });
      await addToGroups(anna.id, friends.id);

      await expect(
        withFailingGroupLinks(() =>
          updateContactById(
            anna.id,
            contactInput({ name: "Анна Петрова", groupIds: [], newGroupNames: ["Сквош"] }),
          ),
        ),
      ).rejects.toBeInstanceOf(DatabaseError);

      const [row] = await runQuery("read", (db) =>
        db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, anna.id)),
      );
      expect(row.name).toBe("Анна Смирнова");
      expect(await groupNamesOf(anna.id)).toEqual(["Друзья"]);
      expect(await allGroupNames()).toEqual(["Друзья"]);
    });
  });
});

describe("saving the frequency «Как часто припоминать»", () => {
  beforeEach(resetDatabase);

  it("saves a new contact without a frequency as «Не задано»", async () => {
    const { id } = await insertContact(contactInput());

    expect((await getContact(id))?.contactFrequency).toBeNull();
  });

  it("saves the frequency chosen for a new contact", async () => {
    const { id } = await insertContact(contactInput({ contactFrequency: "month" }));

    expect((await getContact(id))?.contactFrequency).toBe("month");
  });

  it("takes a contact out of «Пора мстить» when the frequency goes back to «Не задано»", async () => {
    const anna = await addContact({ name: "Анна Смирнова", contactFrequency: "month" });
    expect(await listDueContacts("2026-10-24", null)).toHaveLength(1);

    await updateContactById(anna.id, contactInput({ contactFrequency: null }));

    expect((await getContact(anna.id))?.contactFrequency).toBeNull();
    expect(await listDueContacts("2026-10-24", null)).toEqual([]);
  });
});

// One page of the list: the group filter, the counters and the labels of a row.
describe("listContactsPage", () => {
  beforeEach(resetDatabase);

  const listPage = (options: {
    groupId?: number | null;
    query?: string;
    page?: number;
    pageSize?: number;
  }) =>
    listContactsPage({
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      words: toSearchWords(options.query ?? ""),
      groupId: options.groupId ?? null,
    });

  const namesOf = (list: { contacts: { name: string }[] }) =>
    list.contacts.map((contact) => contact.name);

  // Twelve tennis players "Игрок А"…"Игрок Л" and five people who do not play.
  async function addTennisClub() {
    const tennis = await addGroup("Теннис");
    const players = await addContacts(
      Array.from({ length: 12 }, (_, index) => `Игрок ${String.fromCharCode(1040 + index)}`),
    );
    for (const player of players) await addToGroups(player.id, tennis.id);
    await addContacts(["Зоя", "Лев", "Мила", "Нина", "Олег"]);
    return { tennis, playerNames: players.map((player) => player.name) };
  }

  it("shows only the people of the chosen group, by alphabet", async () => {
    const { tennis, playerNames } = await addTennisClub();

    const list = await listPage({ groupId: tennis.id });

    expect(namesOf(list)).toEqual(playerNames);
  });

  it("shows everybody again with no group", async () => {
    await addTennisClub();

    const list = await listPage({ groupId: null });

    expect(list.contacts).toHaveLength(17);
    expect(list.totalCount).toBe(17);
  });

  it("opens the first page of the group with the same search and a page of 100", async () => {
    const friends = await addGroup("Друзья");
    const members = await addContacts(["Анна", "Иван", "Ольга"]);
    for (const member of members) await addToGroups(member.id, friends.id);
    await addContacts(["Ян", "Антон"]);

    const list = await listPage({ groupId: friends.id, query: "ан", page: 1, pageSize: 100 });

    expect(namesOf(list)).toEqual(["Анна", "Иван"]);
    expect(list.page).toBe(1);
  });

  it("searches only among the people of the group", async () => {
    const tennis = await addGroup("Теннис");
    const smirnova = await addContact({ name: "Анна Смирнова" });
    await addContact({ name: "Анна Петрова" });
    await addToGroups(smirnova.id, tennis.id);

    const list = await listPage({ groupId: tennis.id, query: "анна" });

    expect(namesOf(list)).toEqual(["Анна Смирнова"]);
  });

  it("counts the people of the group, not everybody", async () => {
    const { tennis } = await addTennisClub();

    const list = await listPage({ groupId: tennis.id });

    expect(list.totalCount).toBe(12);
    expect(list.matchedCount).toBe(12);
    expect(list.allCount).toBe(17);
  });

  it("counts the found among the people of the group", async () => {
    const tennis = await addGroup("Теннис");
    const members = await addContacts([
      "Анна Первая",
      "Анна Вторая",
      "Анна Третья",
      ...Array.from({ length: 9 }, (_, index) => `Игрок ${index}`),
    ]);
    for (const member of members) await addToGroups(member.id, tennis.id);
    await addContacts(["Анна Чужая"]);

    const list = await listPage({ groupId: tennis.id, query: "анна" });

    expect(list.matchedCount).toBe(3);
    expect(list.totalCount).toBe(12);
  });

  it("tells an empty group from an empty list", async () => {
    const squash = await addGroup("Сквош");
    await addContacts(["Анна", "Борис"]);

    const list = await listPage({ groupId: squash.id });

    expect(list.totalCount).toBe(0);
    expect(list.allCount).toBe(2);
    expect(list.contacts).toEqual([]);
  });

  it("knows the list is empty when there are no contacts at all", async () => {
    const list = await listPage({});

    expect(list.totalCount).toBe(0);
    expect(list.allCount).toBe(0);
  });

  it("gives every person the groups, by alphabet", async () => {
    const tennis = await addGroup("Теннис");
    const friends = await addGroup("Друзья");
    const anna = await addContact({ name: "Анна" });
    await addContact({ name: "Борис" });
    await addToGroups(anna.id, tennis.id, friends.id);

    const list = await listPage({});

    expect(list.contacts[0].groups).toEqual([
      { id: friends.id, name: "Друзья" },
      { id: tennis.id, name: "Теннис" },
    ]);
    expect(list.contacts[1].groups).toEqual([]);
  });

  it("gives the groups to the people found by a search too", async () => {
    const tennis = await addGroup("Теннис");
    const anna = await addContact({ name: "Анна" });
    await addToGroups(anna.id, tennis.id);

    const list = await listPage({ query: "анн" });

    expect(list.contacts[0].groups).toEqual([{ id: tennis.id, name: "Теннис" }]);
  });

  describe("the search as it was before the groups", () => {
    it("finds the words in any order", async () => {
      await addContacts(["Иван Петров", "Пётр Иванов"]);

      expect(namesOf(await listPage({ query: "петров ив" }))).toEqual(["Иван Петров"]);
    });

    it("treats ё as е", async () => {
      await addContacts(["Алёна", "Борис"]);

      expect(namesOf(await listPage({ query: "алена" }))).toEqual(["Алёна"]);
    });

    it("finds a % or a _ as itself, not as a wildcard", async () => {
      await addContacts(["Иван", "100% уверен", "а_б"]);

      expect(namesOf(await listPage({ query: "%" }))).toEqual(["100% уверен"]);
      expect(namesOf(await listPage({ query: "_" }))).toEqual(["а_б"]);
    });

    it("splits many found people into pages", async () => {
      await addContacts(Array.from({ length: 120 }, (_, index) => `Найден ${index}`));
      await addContacts(Array.from({ length: 30 }, (_, index) => `Другой ${index}`));

      const list = await listPage({ query: "найден", pageSize: 50 });

      expect(list.contacts).toHaveLength(50);
      expect(list.matchedCount).toBe(120);
      expect(list.totalCount).toBe(150);
      expect(list.pageCount).toBe(3);
    });

    it("counts everybody without a search", async () => {
      await addContacts(["Анна", "Борис", "Вера"]);

      const list = await listPage({});

      expect(list.matchedCount).toBe(3);
      expect(list.totalCount).toBe(3);
    });

    it("opens the last page when the page is too far", async () => {
      await addContacts(Array.from({ length: 60 }, (_, index) => `Человек ${index}`));

      const list = await listPage({ page: 99, pageSize: 25 });

      expect(list.page).toBe(3);
      expect(list.contacts).toHaveLength(10);
    });
  });
});
