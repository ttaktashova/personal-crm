import { beforeEach, describe, expect, it, vi } from "vitest";

import { runQuery } from "@/db";
import { contacts } from "@/db/schema";
import { getContact } from "@/lib/contacts";
import { todayIsoDate } from "@/lib/dates";
import { listInteractions } from "@/lib/interactions";
import { listDueContacts } from "@/lib/keep-in-touch";
import { addContact, addRevenge, addUser } from "@/test/factories";
import { signInAs } from "@/test/current-user";
import { resetDatabase } from "@/test/reset-database";

import { createContact, deleteContact, stopReminders, updateContact } from "./actions";

// Outside a running Next.js server revalidatePath throws: there is no page cache to clear.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The signed-in user comes from the test, not from a cookie.
vi.mock("@/lib/session", () => import("@/test/current-user"));

let owner: number;

// Every test starts empty, with one user signed in.
async function setUp() {
  await resetDatabase();
  const user = await addUser("anna@example.com");
  owner = user.id;
  signInAs(user);
}

describe("stopReminders: «Простить» in «Пора мстить»", () => {
  beforeEach(setUp);

  it("sets «Не задано», moves «изменён» to today and keeps the records", async () => {
    const longAgo = new Date("2026-01-15T09:00:00Z");
    const boris = await addContact(owner, {
      name: "Борис",
      contactFrequency: "month",
      createdAt: longAgo,
      updatedAt: longAgo,
    });
    await addRevenge(boris.id, "2026-08-01");

    expect(await stopReminders(boris.id)).toEqual({ status: "stopped" });

    const after = await getContact(owner, boris.id);
    expect(after?.contactFrequency).toBeNull();
    expect(todayIsoDate(after!.updatedAt)).toBe(todayIsoDate());
    expect(after?.createdAt).toEqual(longAgo);
    expect(await listInteractions(owner, boris.id)).toMatchObject([
      { occurredOn: "2026-08-01", summary: "Отомстил" },
    ]);
    expect(await listDueContacts(owner, todayIsoDate(), null)).toEqual([]);
  });

  it("answers not-found when the contact was deleted", async () => {
    const boris = await addContact(owner, { name: "Борис", contactFrequency: "month" });
    await deleteContact(boris.id);

    expect(await stopReminders(boris.id)).toEqual({ status: "not-found" });
  });
});

// The window sends every field; only the birthday changes from test to test.
const formValues = (birthday: { day: string; month: string; year: string }) => ({
  name: "Анна",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
  contactFrequency: "",
  birthday,
});

const NO_BIRTHDAY = { day: "", month: "", year: "" };

const allContacts = () =>
  runQuery("allContacts", (db) => db.select().from(contacts).orderBy(contacts.id));

describe("createContact and updateContact: the birthday", () => {
  beforeEach(setUp);

  it("saves a date with a year and a date without one", async () => {
    const withYear = await createContact(formValues({ day: "17", month: "11", year: "1990" }));
    const withoutYear = await createContact(formValues({ day: "17", month: "11", year: "" }));

    expect(withYear.status).toBe("saved");
    expect(withoutYear.status).toBe("saved");
    expect(await allContacts()).toMatchObject([
      { birthDay: 17, birthMonth: 11, birthYear: 1990 },
      { birthDay: 17, birthMonth: 11, birthYear: null },
    ]);
  });

  it("saves a contact without a birthday", async () => {
    await createContact(formValues(NO_BIRTHDAY));

    expect(await allContacts()).toMatchObject([
      { birthDay: null, birthMonth: null, birthYear: null },
    ]);
  });

  it("changes the date and moves «изменён» to today", async () => {
    const longAgo = new Date("2026-01-15T09:00:00Z");
    const anna = await addContact(owner, {
      name: "Анна",
      birthDay: 17,
      birthMonth: 11,
      birthYear: 1990,
      createdAt: longAgo,
      updatedAt: longAgo,
    });

    const result = await updateContact(anna.id, formValues({ day: "3", month: "3", year: "" }));

    expect(result).toEqual({ status: "saved", id: anna.id });
    const after = await getContact(owner, anna.id);
    expect(after).toMatchObject({ birthDay: 3, birthMonth: 3, birthYear: null });
    expect(todayIsoDate(after!.updatedAt)).toBe(todayIsoDate());
  });

  it("clears the date: all three columns empty, «изменён» moves to today", async () => {
    const longAgo = new Date("2026-01-15T09:00:00Z");
    const anna = await addContact(owner, {
      name: "Анна",
      birthDay: 17,
      birthMonth: 11,
      birthYear: 1990,
      createdAt: longAgo,
      updatedAt: longAgo,
    });

    await updateContact(anna.id, formValues(NO_BIRTHDAY));

    const after = await getContact(owner, anna.id);
    expect(after).toMatchObject({ birthDay: null, birthMonth: null, birthYear: null });
    expect(todayIsoDate(after!.updatedAt)).toBe(todayIsoDate());
  });

  // "Запрос не из формы": the window has no month 13, a direct call can send it.
  it("refuses month 13 from a request past the window and changes nothing", async () => {
    const anna = await addContact(owner, {
      name: "Анна",
      birthDay: 17,
      birthMonth: 11,
      birthYear: 1990,
    });
    const before = await allContacts();
    const monthThirteen = formValues({ day: "1", month: "13", year: "" });

    expect(await createContact(monthThirteen)).toEqual({
      status: "invalid",
      fieldErrors: { birthday: "Такой даты нет" },
    });
    expect(await updateContact(anna.id, monthThirteen)).toEqual({
      status: "invalid",
      fieldErrors: { birthday: "Такой даты нет" },
    });
    expect(await allContacts()).toEqual(before);
  });
});
