import { beforeEach, describe, expect, it } from "vitest";

import { todayIsoDate } from "@/lib/dates";
import { addContact, addGroup, addToGroups, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { listUpcomingBirthdays } from "./birthdays";

// "Кто попадает", "Порядок", the group and "только свои" of the birthdays spec.

const TODAY = "2026-11-14";

// The signed-in user of most tests, and another one whose people must not count.
let owner: number;
let stranger: number;

async function setUp() {
  await resetDatabase();
  owner = (await addUser("anna@example.com")).id;
  stranger = (await addUser("boris@example.com")).id;
}

// A person born on this day and month; the year does not count, so it is often left out.
function addBorn(name: string, day: number, month: number, year: number | null = null) {
  return addContact(owner, { name, birthDay: day, birthMonth: month, birthYear: year });
}

const namesOf = (people: { name: string }[]) => people.map((person) => person.name);

describe("listUpcomingBirthdays: who is in the block", () => {
  beforeEach(setUp);

  it("a birthday today", async () => {
    const anna = await addBorn("Анна", 14, 11, 1990);

    expect(await listUpcomingBirthdays(owner, TODAY, null)).toEqual([
      { id: anna.id, name: "Анна", nextOn: "2026-11-14" },
    ]);
  });

  it("a birthday exactly a week ahead is in, eight days ahead is not", async () => {
    await addBorn("Анна", 21, 11);
    await addBorn("Борис", 22, 11);

    expect(await listUpcomingBirthdays(owner, TODAY, null)).toMatchObject([
      { name: "Анна", nextOn: "2026-11-21" },
    ]);
  });

  it("a birthday yesterday is not", async () => {
    await addBorn("Анна", 13, 11, 1990);

    expect(await listUpcomingBirthdays(owner, TODAY, null)).toEqual([]);
  });

  it("across the New Year: 3 January on 28 December", async () => {
    await addBorn("Анна", 3, 1, 1985);

    expect(await listUpcomingBirthdays(owner, "2026-12-28", null)).toMatchObject([
      { name: "Анна", nextOn: "2027-01-03" },
    ]);
  });

  it("a birthday without a year", async () => {
    await addBorn("Анна", 16, 11);

    expect(await listUpcomingBirthdays(owner, TODAY, null)).toMatchObject([
      { name: "Анна", nextOn: "2026-11-16" },
    ]);
  });

  it.each(["2027-02-25", "2027-02-28"])(
    "29 February is not in a common year: not on %s",
    async (today) => {
      await addBorn("Анна", 29, 2);

      expect(await listUpcomingBirthdays(owner, today, null)).toEqual([]);
    },
  );

  it("29 February is in a leap year", async () => {
    await addBorn("Анна", 29, 2, 1992);

    expect(await listUpcomingBirthdays(owner, "2028-02-25", null)).toMatchObject([
      { name: "Анна", nextOn: "2028-02-29" },
    ]);
  });

  it("29 February when neither this year nor the next is a leap one: not in, no error", async () => {
    await addBorn("Анна", 29, 2);

    expect(await listUpcomingBirthdays(owner, "2026-03-01", null)).toEqual([]);
  });

  it("«today» is the one in Moscow: 23:30 UTC on 13.11 is already 14.11", async () => {
    await addBorn("Анна", 14, 11);
    const today = todayIsoDate(new Date("2026-11-13T23:30:00Z"));

    expect(await listUpcomingBirthdays(owner, today, null)).toMatchObject([
      { name: "Анна", nextOn: "2026-11-14" },
    ]);
  });

  it("a contact without a birthday is never in", async () => {
    await addContact(owner, { name: "Анна" });

    expect(await listUpcomingBirthdays(owner, TODAY, null)).toEqual([]);
  });
});

describe("listUpcomingBirthdays: the order", () => {
  beforeEach(setUp);

  it("the nearest first", async () => {
    await addBorn("Анна", 20, 11);
    await addBorn("Борис", 14, 11);
    await addBorn("Вера", 17, 11);

    expect(namesOf(await listUpcomingBirthdays(owner, TODAY, null))).toEqual([
      "Борис",
      "Вера",
      "Анна",
    ]);
  });

  it("30 December before 2 January", async () => {
    await addBorn("Анна", 2, 1);
    await addBorn("Борис", 30, 12);

    expect(namesOf(await listUpcomingBirthdays(owner, "2026-12-28", null))).toEqual([
      "Борис",
      "Анна",
    ]);
  });

  it("on one day by the alphabet", async () => {
    // Saved in reverse, so the order of the ids is not the order of the block.
    await addBorn("Борис", 17, 11);
    await addBorn("Анна", 17, 11, 1990);

    expect(namesOf(await listUpcomingBirthdays(owner, TODAY, null))).toEqual(["Анна", "Борис"]);
  });
});

describe("listUpcomingBirthdays: the group", () => {
  beforeEach(setUp);

  it("shows only the people of the chosen group", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const family = await addGroup(owner, "Семья");
    const anna = await addBorn("Анна", 15, 11);
    const boris = await addBorn("Борис", 16, 11);
    await addToGroups(anna.id, tennis.id);
    await addToGroups(boris.id, family.id);

    expect(namesOf(await listUpcomingBirthdays(owner, TODAY, tennis.id))).toEqual(["Анна"]);
  });

  it("is empty when nobody of the group has a birthday soon", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const family = await addGroup(owner, "Семья");
    const boris = await addBorn("Борис", 16, 11);
    await addToGroups(boris.id, family.id);
    const anna = await addBorn("Анна", 1, 1);
    await addToGroups(anna.id, tennis.id);

    expect(await listUpcomingBirthdays(owner, TODAY, tennis.id)).toEqual([]);
  });

  it("shows everybody with no group", async () => {
    const tennis = await addGroup(owner, "Теннис");
    const anna = await addBorn("Анна", 15, 11);
    await addBorn("Борис", 16, 11);
    await addToGroups(anna.id, tennis.id);

    expect(namesOf(await listUpcomingBirthdays(owner, TODAY, null))).toEqual(["Анна", "Борис"]);
  });
});

// "Чужой день рождения" of the data-ownership spec.
describe("listUpcomingBirthdays: only the owner's people", () => {
  beforeEach(setUp);

  it("does not show another user's contact with a birthday tomorrow", async () => {
    await addBorn("Анна", 15, 11);

    expect(await listUpcomingBirthdays(stranger, TODAY, null)).toEqual([]);
    expect(namesOf(await listUpcomingBirthdays(owner, TODAY, null))).toEqual(["Анна"]);
  });
});
