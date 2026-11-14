import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { contacts } from "@/db/schema";
import { addContact, addContacts, addGroup, addToGroups, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import type { ContactInput } from "./contact-schema";
import {
  findContactPage,
  getContact,
  insertContact,
  listContactsPage,
  updateContactById,
} from "./contacts";
import { deleteGroup, listContactGroups, listGroups } from "./groups";
import { listDueContacts } from "./keep-in-touch";
import { toSearchWords } from "./search";

// The signed-in user of most tests, and another one who must not see or change their data.
let owner: number;
let stranger: number;

async function setUp() {
  await resetDatabase();
  owner = (await addUser("anna@example.com")).id;
  stranger = (await addUser("boris@example.com")).id;
}

function contactInput(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    name: "Анна Смирнова",
    howWeMet: "",
    phone: "",
    email: "",
    notes: "",
    contactFrequency: null,
    birthday: null,
    groupIds: [],
    newGroupNames: [],
    ...overrides,
  };
}

async function groupNamesOf(contactId: number): Promise<string[]> {
  const byContact = await listContactGroups(owner, [contactId]);
  return (byContact.get(contactId) ?? []).map((group) => group.name);
}

const allGroupNames = async () => (await listGroups(owner)).map((group) => group.name);
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
  beforeEach(setUp);

  describe("insertContact", () => {
    it("puts the person into the two chosen groups", async () => {
      const family = await addGroup(owner, "Семья");
      const tennis = await addGroup(owner, "Теннис");

      const { id } = await insertContact(owner, contactInput({ groupIds: [tennis.id, family.id] }));

      expect(await groupNamesOf(id)).toEqual(["Семья", "Теннис"]);
      expect((await listGroups(owner)).map((group) => group.contactCount)).toEqual([1, 1]);
    });

    it("saves a person without groups", async () => {
      await addGroup(owner, "Семья");

      const { id } = await insertContact(owner, contactInput());

      expect((await getContact(owner, id))?.name).toBe("Анна Смирнова");
      expect(await groupNamesOf(id)).toEqual([]);
      expect((await listGroups(owner))[0].contactCount).toBe(0);
    });

    it("creates a new group together with the contact", async () => {
      const { id } = await insertContact(owner, contactInput({ newGroupNames: ["Сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(id)).toEqual(["Сквош"]);
    });

    it("joins chosen and new groups", async () => {
      const family = await addGroup(owner, "Семья");

      const { id } = await insertContact(
        owner,
        contactInput({ groupIds: [family.id], newGroupNames: ["Сквош"] }),
      );

      expect(await groupNamesOf(id)).toEqual(["Семья", "Сквош"]);
    });

    it("uses the group another tab created meanwhile instead of making a second one", async () => {
      await addGroup(owner, "Сквош");

      const { id } = await insertContact(owner, contactInput({ newGroupNames: ["сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(id)).toEqual(["Сквош"]);
    });

    it("saves the person without a group that was deleted while the window was open", async () => {
      const family = await addGroup(owner, "Семья");
      const tennis = await addGroup(owner, "Теннис");
      await deleteGroup(owner, tennis.id);

      const { id } = await insertContact(owner, contactInput({ groupIds: [family.id, tennis.id] }));

      expect(await groupNamesOf(id)).toEqual(["Семья"]);
    });

    it("shows the saved groups on a fresh read, as another browser would", async () => {
      const tennis = await addGroup(owner, "Теннис");
      const { id } = await insertContact(owner, contactInput({ groupIds: [tennis.id] }));

      const contact = await getContact(owner, id);
      const groups = (await listContactGroups(owner, [id])).get(id);

      expect(contact?.name).toBe("Анна Смирнова");
      expect(groups).toEqual([{ id: tennis.id, name: "Теннис" }]);
    });

    it("leaves neither the contact nor the new group when saving fails", async () => {
      const family = await addGroup(owner, "Семья");

      await expect(
        withFailingGroupLinks(() =>
          insertContact(owner, contactInput({ groupIds: [family.id], newGroupNames: ["Сквош"] })),
        ),
      ).rejects.toBeInstanceOf(DatabaseError);

      expect(await countContacts()).toBe(0);
      expect(await allGroupNames()).toEqual(["Семья"]);
    });
  });

  describe("updateContactById", () => {
    it("takes a group away and keeps the other", async () => {
      const friends = await addGroup(owner, "Друзья");
      const tennis = await addGroup(owner, "Теннис");
      const anna = await addContact(owner, { name: "Анна Смирнова" });
      await addToGroups(anna.id, friends.id, tennis.id);

      const result = await updateContactById(
        owner,
        anna.id,
        contactInput({ groupIds: [friends.id] }),
      );

      expect(result).toEqual({ id: anna.id });
      expect(await groupNamesOf(anna.id)).toEqual(["Друзья"]);
      expect((await listGroups(owner)).map((group) => group.contactCount)).toEqual([1, 0]);
    });

    it("changes the fields together with the groups", async () => {
      const tennis = await addGroup(owner, "Теннис");
      const anna = await addContact(owner, { name: "Анна Смирнова" });

      await updateContactById(
        owner,
        anna.id,
        contactInput({ name: "Анна Петрова", howWeMet: "Корт", groupIds: [tennis.id] }),
      );

      const after = await getContact(owner, anna.id);
      expect(after).toMatchObject({ name: "Анна Петрова", howWeMet: "Корт" });
      expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    });

    it("creates a new group together with the change", async () => {
      const anna = await addContact(owner, { name: "Анна Смирнова" });

      await updateContactById(owner, anna.id, contactInput({ newGroupNames: ["Сквош"] }));

      expect(await allGroupNames()).toEqual(["Сквош"]);
      expect(await groupNamesOf(anna.id)).toEqual(["Сквош"]);
    });

    it("moves the «изменён» date when only the groups changed", async () => {
      const tennis = await addGroup(owner, "Теннис");
      const before = new Date("2026-10-01T09:00:00Z");
      const anna = await addContact(owner, { name: "Анна Смирнова", updatedAt: before });

      await updateContactById(owner, anna.id, contactInput({ groupIds: [tennis.id] }));

      const after = await getContact(owner, anna.id);
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
      expect(after!.createdAt).toEqual(anna.createdAt);
    });

    it("answers null and creates no group when the contact is gone", async () => {
      const result = await updateContactById(
        owner,
        999,
        contactInput({ newGroupNames: ["Сквош"] }),
      );

      expect(result).toBeNull();
      expect(await allGroupNames()).toEqual([]);
    });

    it("changes nothing when saving fails", async () => {
      const friends = await addGroup(owner, "Друзья");
      const anna = await addContact(owner, { name: "Анна Смирнова" });
      await addToGroups(anna.id, friends.id);

      await expect(
        withFailingGroupLinks(() =>
          updateContactById(
            owner,
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
  beforeEach(setUp);

  it("saves a new contact without a frequency as «Не задано»", async () => {
    const { id } = await insertContact(owner, contactInput());

    expect((await getContact(owner, id))?.contactFrequency).toBeNull();
  });

  it("saves the frequency chosen for a new contact", async () => {
    const { id } = await insertContact(owner, contactInput({ contactFrequency: "month" }));

    expect((await getContact(owner, id))?.contactFrequency).toBe("month");
  });

  it("takes a contact out of «Пора мстить» when the frequency goes back to «Не задано»", async () => {
    const anna = await addContact(owner, { name: "Анна Смирнова", contactFrequency: "month" });
    expect(await listDueContacts(owner, "2026-10-24", null)).toHaveLength(1);

    await updateContactById(owner, anna.id, contactInput({ contactFrequency: null }));

    expect((await getContact(owner, anna.id))?.contactFrequency).toBeNull();
    expect(await listDueContacts(owner, "2026-10-24", null)).toEqual([]);
  });
});

// One page of the list: the group filter, the counters and the labels of a row.
describe("listContactsPage", () => {
  beforeEach(setUp);

  const listPage = (options: {
    groupId?: number | null;
    query?: string;
    page?: number;
    pageSize?: number;
  }) =>
    listContactsPage({
      ownerId: owner,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      words: toSearchWords(options.query ?? ""),
      groupId: options.groupId ?? null,
    });

  const namesOf = (list: { contacts: { name: string }[] }) =>
    list.contacts.map((contact) => contact.name);

  // Twelve tennis players "Игрок А"…"Игрок Л" and five people who do not play.
  async function addTennisClub() {
    const tennis = await addGroup(owner, "Теннис");
    const players = await addContacts(
      owner,
      Array.from({ length: 12 }, (_, index) => `Игрок ${String.fromCharCode(1040 + index)}`),
    );
    for (const player of players) await addToGroups(player.id, tennis.id);
    await addContacts(owner, ["Зоя", "Лев", "Мила", "Нина", "Олег"]);
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
    const friends = await addGroup(owner, "Друзья");
    const members = await addContacts(owner, ["Анна", "Иван", "Ольга"]);
    for (const member of members) await addToGroups(member.id, friends.id);
    await addContacts(owner, ["Ян", "Антон"]);

    const list = await listPage({ groupId: friends.id, query: "ан", page: 1, pageSize: 100 });

    expect(namesOf(list)).toEqual(["Анна", "Иван"]);
    expect(list.page).toBe(1);
  });

  it("searches only among the people of the group", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const smirnova = await addContact(owner, { name: "Анна Смирнова" });
    await addContact(owner, { name: "Анна Петрова" });
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
    const tennis = await addGroup(owner, "Теннис");
    const members = await addContacts(owner, [
      "Анна Первая",
      "Анна Вторая",
      "Анна Третья",
      ...Array.from({ length: 9 }, (_, index) => `Игрок ${index}`),
    ]);
    for (const member of members) await addToGroups(member.id, tennis.id);
    await addContacts(owner, ["Анна Чужая"]);

    const list = await listPage({ groupId: tennis.id, query: "анна" });

    expect(list.matchedCount).toBe(3);
    expect(list.totalCount).toBe(12);
  });

  it("tells an empty group from an empty list", async () => {
    const squash = await addGroup(owner, "Сквош");
    await addContacts(owner, ["Анна", "Борис"]);

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
    const tennis = await addGroup(owner, "Теннис");
    const friends = await addGroup(owner, "Друзья");
    const anna = await addContact(owner, { name: "Анна" });
    await addContact(owner, { name: "Борис" });
    await addToGroups(anna.id, tennis.id, friends.id);

    const list = await listPage({});

    expect(list.contacts[0].groups).toEqual([
      { id: friends.id, name: "Друзья" },
      { id: tennis.id, name: "Теннис" },
    ]);
    expect(list.contacts[1].groups).toEqual([]);
  });

  it("gives the groups to the people found by a search too", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const anna = await addContact(owner, { name: "Анна" });
    await addToGroups(anna.id, tennis.id);

    const list = await listPage({ query: "анн" });

    expect(list.contacts[0].groups).toEqual([{ id: tennis.id, name: "Теннис" }]);
  });

  describe("the search as it was before the groups", () => {
    it("finds the words in any order", async () => {
      await addContacts(owner, ["Иван Петров", "Пётр Иванов"]);

      expect(namesOf(await listPage({ query: "петров ив" }))).toEqual(["Иван Петров"]);
    });

    it("treats ё as е", async () => {
      await addContacts(owner, ["Алёна", "Борис"]);

      expect(namesOf(await listPage({ query: "алена" }))).toEqual(["Алёна"]);
    });

    it("finds a % or a _ as itself, not as a wildcard", async () => {
      await addContacts(owner, ["Иван", "100% уверен", "а_б"]);

      expect(namesOf(await listPage({ query: "%" }))).toEqual(["100% уверен"]);
      expect(namesOf(await listPage({ query: "_" }))).toEqual(["а_б"]);
    });

    it("splits many found people into pages", async () => {
      await addContacts(
        owner,
        Array.from({ length: 120 }, (_, index) => `Найден ${index}`),
      );
      await addContacts(
        owner,
        Array.from({ length: 30 }, (_, index) => `Другой ${index}`),
      );

      const list = await listPage({ query: "найден", pageSize: 50 });

      expect(list.contacts).toHaveLength(50);
      expect(list.matchedCount).toBe(120);
      expect(list.totalCount).toBe(150);
      expect(list.pageCount).toBe(3);
    });

    it("counts everybody without a search", async () => {
      await addContacts(owner, ["Анна", "Борис", "Вера"]);

      const list = await listPage({});

      expect(list.matchedCount).toBe(3);
      expect(list.totalCount).toBe(3);
    });

    it("opens the last page when the page is too far", async () => {
      await addContacts(
        owner,
        Array.from({ length: 60 }, (_, index) => `Человек ${index}`),
      );

      const list = await listPage({ page: 99, pageSize: 25 });

      expect(list.page).toBe(3);
      expect(list.contacts).toHaveLength(10);
    });
  });
});

// "Чьи данные" of the data-ownership spec and the counter of the contact-list spec, with two
// users: `owner` (A) and `stranger` (B).
describe("each user's own contacts", () => {
  beforeEach(setUp);

  const pageOf = (ownerId: number, options: { query?: string; groupId?: number | null } = {}) =>
    listContactsPage({
      ownerId,
      page: 1,
      pageSize: 50,
      words: toSearchWords(options.query ?? ""),
      groupId: options.groupId ?? null,
    });

  const namesOf = (list: { contacts: { name: string }[] }) =>
    list.contacts.map((contact) => contact.name);

  it("lists only the user's contacts", async () => {
    await addContacts(owner, ["Пётр", "Ольга"]);
    await addContacts(stranger, ["Борис"]);

    expect(namesOf(await pageOf(stranger))).toEqual(["Борис"]);
    expect(namesOf(await pageOf(owner))).toEqual(["Ольга", "Пётр"]);
  });

  it("does not find another user's contact by name", async () => {
    await addContacts(owner, ["Пётр"]);

    const list = await pageOf(stranger, { query: "пётр" });

    expect(list.contacts).toEqual([]);
    expect(list.matchedCount).toBe(0);
  });

  it("saves a new contact as the user's own", async () => {
    const { id } = await insertContact(owner, contactInput({ name: "Пётр", notes: "Занял 5000" }));

    const [row] = await runQuery("read", (db) =>
      db.select({ ownerId: contacts.ownerId }).from(contacts).where(eq(contacts.id, id)),
    );
    expect(row.ownerId).toBe(owner);
    expect(await getContact(owner, id)).toMatchObject({ name: "Пётр", notes: "Занял 5000" });
    expect(await getContact(stranger, id)).toBeNull();
  });

  it("does not open another user's contact by its number", async () => {
    const petr = await addContact(owner, { name: "Пётр" });

    expect(await getContact(stranger, petr.id)).toBeNull();
    expect(await findContactPage(stranger, petr.id, 50)).toBeNull();
  });

  it("does not change another user's contact or its groups", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const petr = await addContact(owner, { name: "Пётр", notes: "Занял 5000" });
    await addToGroups(petr.id, tennis.id);

    const result = await updateContactById(
      stranger,
      petr.id,
      contactInput({ name: "Взломан", notes: "", newGroupNames: ["Сквош"] }),
    );

    expect(result).toBeNull();
    expect(await getContact(owner, petr.id)).toMatchObject({ name: "Пётр", notes: "Занял 5000" });
    expect(await groupNamesOf(petr.id)).toEqual(["Теннис"]);
    expect(await listGroups(stranger)).toEqual([]);
  });

  it("finds the page of a contact among the user's contacts only", async () => {
    await addContacts(stranger, ["Аркадий", "Вадим"]);
    const [, gleb] = await addContacts(owner, ["Борис", "Глеб"]);

    expect(await findContactPage(owner, gleb.id, 1)).toBe(2);
  });

  it("shows an empty list to a user without contacts while others have them", async () => {
    await addContacts(owner, ["Пётр", "Ольга", "Иван"]);

    const list = await pageOf(stranger);

    expect(list.contacts).toEqual([]);
    expect(list.totalCount).toBe(0);
    expect(list.allCount).toBe(0);
  });

  it("counts only the user's contacts", async () => {
    await addContacts(
      owner,
      Array.from({ length: 10 }, (_, index) => `Человек ${index}`),
    );
    await addContacts(stranger, ["Борис", "Вера", "Глеб"]);

    const list = await pageOf(stranger);

    expect(list.totalCount).toBe(3);
    expect(list.matchedCount).toBe(3);
    expect(list.allCount).toBe(3);
  });

  it("counts the found and the people of a group among the user's contacts only", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const members = await addContacts(owner, ["Анна Первая", "Анна Вторая", "Игрок"]);
    for (const member of members) await addToGroups(member.id, tennis.id);
    await addContacts(owner, ["Анна Чужая"]);
    await addContacts(stranger, ["Анна Борисова", "Анна Иванова"]);

    const found = await pageOf(owner, { query: "анна" });
    expect([found.matchedCount, found.totalCount, found.allCount]).toEqual([3, 4, 4]);

    const inGroup = await pageOf(owner, { groupId: tennis.id });
    expect([inGroup.matchedCount, inGroup.totalCount, inGroup.allCount]).toEqual([3, 3, 4]);

    const foundInGroup = await pageOf(owner, { groupId: tennis.id, query: "анна" });
    expect([foundInGroup.matchedCount, foundInGroup.totalCount]).toEqual([2, 3]);
  });

  it("shows nobody of another user's group", async () => {
    const theirs = await addGroup(stranger, "Теннис");
    const boris = await addContact(stranger, { name: "Борис" });
    await addToGroups(boris.id, theirs.id);
    await addContacts(owner, ["Пётр"]);

    const list = await pageOf(owner, { groupId: theirs.id });

    expect(list.contacts).toEqual([]);
    expect(list.totalCount).toBe(0);
  });
});
