import { beforeEach, describe, expect, it } from "vitest";

import { addContact, addGroup, addRevenge, addToGroups } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { listDueContacts } from "./keep-in-touch";

const TODAY = "2026-10-31";

// A person who is due: a week passed since the last revenge, or there was none yet.
async function addDue(name: string, lastRevenge: string | null = "2026-10-01") {
  const contact = await addContact({ name, contactFrequency: "week" });
  if (lastRevenge) await addRevenge(contact.id, lastRevenge);
  return contact;
}

const namesOf = (due: { name: string }[]) => due.map((contact) => contact.name);

describe("listDueContacts", () => {
  beforeEach(resetDatabase);

  it("shows only the people of the chosen group", async () => {
    const tennis = await addGroup("Теннис");
    const family = await addGroup("Семья");
    const anna = await addDue("Анна");
    const boris = await addDue("Борис");
    await addToGroups(anna.id, tennis.id);
    await addToGroups(boris.id, family.id);

    expect(namesOf(await listDueContacts(TODAY, tennis.id))).toEqual(["Анна"]);
  });

  it("counts only the group: eight of twelve", async () => {
    const friends = await addGroup("Друзья");
    for (let index = 0; index < 12; index++) {
      const contact = await addDue(`Человек ${String(index).padStart(2, "0")}`);
      if (index < 8) await addToGroups(contact.id, friends.id);
    }

    const inGroup = await listDueContacts(TODAY, friends.id);
    const everybody = await listDueContacts(TODAY, null);

    expect(inGroup).toHaveLength(8);
    expect(everybody).toHaveLength(12);
  });

  it("is empty when nobody of the group is due", async () => {
    const tennis = await addGroup("Теннис");
    const family = await addGroup("Семья");
    const boris = await addDue("Борис");
    await addToGroups(boris.id, family.id);
    await addContact({ name: "Анна" });

    expect(await listDueContacts(TODAY, tennis.id)).toEqual([]);
  });

  it("shows everybody in the usual order with no group", async () => {
    const tennis = await addGroup("Теннис");
    const lateInTerm = await addDue("Анна", "2026-10-01"); // due 08.10
    await addDue("Борис", null); // no revenge yet: first
    const earlyInTerm = await addDue("Вера", "2026-09-20"); // due 27.09
    await addToGroups(lateInTerm.id, tennis.id);
    await addToGroups(earlyInTerm.id, tennis.id);

    expect(namesOf(await listDueContacts(TODAY, null))).toEqual(["Борис", "Вера", "Анна"]);
    expect(namesOf(await listDueContacts(TODAY, tennis.id))).toEqual(["Вера", "Анна"]);
  });

  it("does not show the people whose term has not come", async () => {
    const tennis = await addGroup("Теннис");
    const fresh = await addDue("Анна", "2026-10-30");
    await addToGroups(fresh.id, tennis.id);

    expect(await listDueContacts(TODAY, tennis.id)).toEqual([]);
    expect(await listDueContacts(TODAY, null)).toEqual([]);
  });
});
