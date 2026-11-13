import { beforeEach, describe, expect, it } from "vitest";

import { addContact, addGroup, addRevenge, addToGroups, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { listDueContacts } from "./keep-in-touch";

const TODAY = "2026-10-31";

// The signed-in user of most tests, and another one whose people must not count.
let owner: number;
let stranger: number;

async function setUp() {
  await resetDatabase();
  owner = (await addUser("anna@example.com")).id;
  stranger = (await addUser("boris@example.com")).id;
}

// A person who is due: a week passed since the last revenge, or there was none yet.
async function addDue(name: string, lastRevenge: string | null = "2026-10-01") {
  const contact = await addContact(owner, { name, contactFrequency: "week" });
  if (lastRevenge) await addRevenge(contact.id, lastRevenge);
  return contact;
}

const namesOf = (due: { name: string }[]) => due.map((contact) => contact.name);

describe("listDueContacts", () => {
  beforeEach(setUp);

  it("shows only the people of the chosen group", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const family = await addGroup(owner, "Семья");
    const anna = await addDue("Анна");
    const boris = await addDue("Борис");
    await addToGroups(anna.id, tennis.id);
    await addToGroups(boris.id, family.id);

    expect(namesOf(await listDueContacts(owner, TODAY, tennis.id))).toEqual(["Анна"]);
  });

  it("counts only the group: eight of twelve", async () => {
    const friends = await addGroup(owner, "Друзья");
    for (let index = 0; index < 12; index++) {
      const contact = await addDue(`Человек ${String(index).padStart(2, "0")}`);
      if (index < 8) await addToGroups(contact.id, friends.id);
    }

    const inGroup = await listDueContacts(owner, TODAY, friends.id);
    const everybody = await listDueContacts(owner, TODAY, null);

    expect(inGroup).toHaveLength(8);
    expect(everybody).toHaveLength(12);
  });

  it("is empty when nobody of the group is due", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const family = await addGroup(owner, "Семья");
    const boris = await addDue("Борис");
    await addToGroups(boris.id, family.id);
    await addContact(owner, { name: "Анна" });

    expect(await listDueContacts(owner, TODAY, tennis.id)).toEqual([]);
  });

  it("shows everybody in the usual order with no group", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const lateInTerm = await addDue("Анна", "2026-10-01"); // due 08.10
    await addDue("Борис", null); // no revenge yet: first
    const earlyInTerm = await addDue("Вера", "2026-09-20"); // due 27.09
    await addToGroups(lateInTerm.id, tennis.id);
    await addToGroups(earlyInTerm.id, tennis.id);

    expect(namesOf(await listDueContacts(owner, TODAY, null))).toEqual(["Борис", "Вера", "Анна"]);
    expect(namesOf(await listDueContacts(owner, TODAY, tennis.id))).toEqual(["Вера", "Анна"]);
  });

  it("does not show the people whose term has not come", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const fresh = await addDue("Анна", "2026-10-30");
    await addToGroups(fresh.id, tennis.id);

    expect(await listDueContacts(owner, TODAY, tennis.id)).toEqual([]);
    expect(await listDueContacts(owner, TODAY, null)).toEqual([]);
  });
});

describe("listDueContacts: when revenge is due", () => {
  beforeEach(setUp);

  it.each([
    ["week", "2026-10-17"],
    ["month", "2026-09-24"],
    ["quarter", "2026-07-24"],
    ["year", "2025-10-24"],
  ] as const)("%s: due exactly on its day, not the day before", async (frequency, lastRevenge) => {
    const anna = await addContact(owner, { name: "Анна", contactFrequency: frequency });
    await addRevenge(anna.id, lastRevenge);

    expect(await listDueContacts(owner, "2026-10-23", null)).toEqual([]);
    expect(await listDueContacts(owner, "2026-10-24", null)).toMatchObject([
      { name: "Анна", contactFrequency: frequency, dueOn: "2026-10-24" },
    ]);
  });

  it("a month after 31.01 is 28.02", async () => {
    const anna = await addContact(owner, { name: "Анна", contactFrequency: "month" });
    await addRevenge(anna.id, "2026-01-31");

    expect(await listDueContacts(owner, "2026-02-27", null)).toEqual([]);
    expect(await listDueContacts(owner, "2026-02-28", null)).toMatchObject([
      { dueOn: "2026-02-28" },
    ]);
  });

  it("is due at once when there has been no revenge yet, even once a year", async () => {
    await addContact(owner, { name: "Анна", contactFrequency: "year" });

    expect(await listDueContacts(owner, TODAY, null)).toMatchObject([
      { name: "Анна", dueOn: null },
    ]);
  });

  it("counts from the last revenge, not from the last change of the card", async () => {
    // The notes were edited yesterday; the last revenge was in August.
    const anna = await addContact(owner, {
      name: "Анна",
      contactFrequency: "month",
      notes: "Опять «забыла» вернуть зарядку",
      updatedAt: new Date("2026-10-23T12:00:00Z"),
    });
    await addRevenge(anna.id, "2026-08-01");

    expect(await listDueContacts(owner, "2026-10-24", null)).toMatchObject([
      { name: "Анна", dueOn: "2026-09-01" },
    ]);
  });

  it("never shows a contact without a frequency", async () => {
    const anna = await addContact(owner, { name: "Анна" });
    await addRevenge(anna.id, "2025-01-01");

    expect(await listDueContacts(owner, TODAY, null)).toEqual([]);
  });
});

describe("listDueContacts: order", () => {
  beforeEach(setUp);

  const today = "2026-10-24";

  // Saved in another order than expected, so the order of the ids proves nothing.

  it("no revenge yet first, then the earliest term", async () => {
    const boris = await addContact(owner, { name: "Борис", contactFrequency: "week" });
    await addRevenge(boris.id, "2026-10-10"); // due 17.10
    const anna = await addContact(owner, { name: "Анна", contactFrequency: "month" });
    await addRevenge(anna.id, "2026-09-01"); // due 01.10
    await addContact(owner, { name: "Вера", contactFrequency: "quarter" });

    expect(namesOf(await listDueContacts(owner, today, null))).toEqual(["Вера", "Анна", "Борис"]);
  });

  it("due today goes below due the day before yesterday", async () => {
    const dina = await addContact(owner, { name: "Дина", contactFrequency: "week" });
    await addRevenge(dina.id, "2026-10-17"); // due 24.10
    const gleb = await addContact(owner, { name: "Глеб", contactFrequency: "week" });
    await addRevenge(gleb.id, "2026-10-15"); // due 22.10

    expect(namesOf(await listDueContacts(owner, today, null))).toEqual(["Глеб", "Дина"]);
  });

  it("the same term goes by the alphabet", async () => {
    const boris = await addContact(owner, { name: "Борис", contactFrequency: "week" });
    await addRevenge(boris.id, "2026-10-10"); // due 17.10
    const anna = await addContact(owner, { name: "Анна", contactFrequency: "week" });
    await addRevenge(anna.id, "2026-10-10"); // due 17.10

    expect(namesOf(await listDueContacts(owner, today, null))).toEqual(["Анна", "Борис"]);
  });

  it("no revenge yet goes by the alphabet too, above everybody with a term", async () => {
    await addContact(owner, { name: "Вера", contactFrequency: "month" });
    const boris = await addContact(owner, { name: "Борис", contactFrequency: "week" });
    await addRevenge(boris.id, "2026-10-01"); // due 08.10
    await addContact(owner, { name: "Алина", contactFrequency: "year" });

    expect(namesOf(await listDueContacts(owner, today, null))).toEqual(["Алина", "Вера", "Борис"]);
  });
});

// "«Пора мстить» — только свои" of the data-ownership spec.
describe("listDueContacts: each user's own people", () => {
  beforeEach(setUp);

  it("does not count another user's people who are due", async () => {
    const petr = await addContact(owner, { name: "Пётр", contactFrequency: "week" });
    await addRevenge(petr.id, "2026-10-01");
    await addContact(owner, { name: "Ольга", contactFrequency: "month" });
    await addContact(stranger, { name: "Борис" });

    expect(await listDueContacts(stranger, TODAY, null)).toEqual([]);
    expect(namesOf(await listDueContacts(owner, TODAY, null))).toEqual(["Ольга", "Пётр"]);
  });

  it("shows nobody of another user's group", async () => {
    const theirs = await addGroup(owner, "Теннис");
    const petr = await addContact(owner, { name: "Пётр", contactFrequency: "week" });
    await addToGroups(petr.id, theirs.id);

    expect(await listDueContacts(stranger, TODAY, theirs.id)).toEqual([]);
  });
});
