import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runQuery } from "@/db";
import { contactGroups, contacts, groups, interactions } from "@/db/schema";
import type { ContactFormValues } from "@/lib/contact-schema";
import { RedirectedToSignIn, signInAs, signOut } from "@/test/current-user";
import { addContact, addGroup, addRevenge, addToGroups, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { createContact, deleteContact, stopReminders, updateContact } from "./actions";
import { createGroup, deleteGroup, renameGroup } from "./group-actions";
import {
  addInteraction,
  deleteInteraction,
  markContacted,
  updateInteraction,
} from "./interaction-actions";

// "Чужое не меняется прямым запросом" and "Без входа сервер ничего не отдаёт и не меняет" of
// the data-ownership spec: the server actions called directly, the way a hand-made request
// would, past any page. A (anna) owns the data, B (boris) is signed in and tries.

// Outside a running Next.js server revalidatePath throws: there is no page cache to clear.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The signed-in user comes from the test, not from a cookie.
vi.mock("@/lib/session", () => import("@/test/current-user"));

type User = { id: number; email: string };

let anna: User;
let boris: User;
// A's data: a contact with a record, in a group.
let petr: number;
let petrRecord: number;
let tennis: number;

const contactValues = (overrides: Partial<ContactFormValues> = {}): ContactFormValues => ({
  name: "Взломан",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
  contactFrequency: "",
  ...overrides,
});

// Everything in the tables that the actions change, to see that nothing moved.
async function everything() {
  return runQuery("everything", async (db) => ({
    contacts: await db.select().from(contacts).orderBy(asc(contacts.id)),
    interactions: await db.select().from(interactions).orderBy(asc(interactions.id)),
    groups: await db.select().from(groups).orderBy(asc(groups.id)),
    links: await db.select().from(contactGroups),
  }));
}

beforeEach(async () => {
  await resetDatabase();
  anna = await addUser("anna@example.com");
  boris = await addUser("boris@example.com");

  const group = await addGroup(anna.id, "Теннис");
  tennis = group.id;
  const contact = await addContact(anna.id, {
    name: "Пётр",
    notes: "Занял 5000",
    contactFrequency: "week",
  });
  petr = contact.id;
  await addToGroups(petr, tennis);
  await addRevenge(petr, "2026-10-01");
  const [record] = await runQuery("record", (db) =>
    db.select({ id: interactions.id }).from(interactions),
  );
  petrRecord = record.id;
});

describe("another user's contact", () => {
  beforeEach(() => signInAs(boris));

  it("is not changed, deleted, forgiven or marked: «not found»", async () => {
    const before = await everything();

    expect(await updateContact(petr, contactValues({ groupIds: [tennis] }))).toEqual({
      status: "not-found",
    });
    expect(await deleteContact(petr)).toEqual({ status: "not-found" });
    expect(await stopReminders(petr)).toEqual({ status: "not-found" });
    expect(await markContacted(petr)).toEqual({ status: "not-found" });

    expect(await everything()).toEqual(before);
  });

  it("gets no records, and its records are not changed or deleted", async () => {
    const before = await everything();
    const record = { occurredOn: "2026-10-02", summary: "Взломан" };

    expect(await addInteraction(petr, record)).toEqual({ status: "not-found" });
    expect(await updateInteraction(petrRecord, record)).toEqual({ status: "not-found" });
    expect(await deleteInteraction(petrRecord)).toEqual({ status: "not-found" });

    expect(await everything()).toEqual(before);
  });
});

describe("another user's group", () => {
  beforeEach(() => signInAs(boris));

  it("is not renamed or deleted, and the answer has only the user's groups", async () => {
    const own = await addGroup(boris.id, "Коллеги");
    const before = await everything();
    const ownList = [{ id: own.id, name: "Коллеги", contactCount: 0 }];

    expect(await renameGroup(tennis, "Сквош")).toEqual({ status: "not-found", groups: ownList });
    expect(await deleteGroup(tennis)).toEqual({ status: "not-found", groups: ownList });

    expect(await everything()).toEqual(before);
  });

  it("does not stop a group of the same name: «Теннис» of B is B's own", async () => {
    const result = await createGroup("Теннис");

    expect(result).toMatchObject({
      status: "saved",
      groups: [{ name: "Теннис", contactCount: 0 }],
    });
    if (result.status !== "saved") return;
    expect(result.groups[0].id).not.toBe(tennis);
  });

  it("does not take the user's contact in", async () => {
    const saved = await createContact(contactValues({ name: "Борис", groupIds: [tennis] }));

    expect(saved.status).toBe("saved");
    const links = await runQuery("links", (db) => db.select().from(contactGroups));
    expect(links).toEqual([{ contactId: petr, groupId: tennis }]);
  });
});

describe("a new contact", () => {
  it("belongs to the user who is signed in", async () => {
    signInAs(boris);

    const saved = await createContact(contactValues({ name: "Борис" }));

    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;
    const all = await everything();
    expect(all.contacts.find((contact) => contact.id === saved.id)?.ownerId).toBe(boris.id);
  });
});

describe("without a sign-in", () => {
  beforeEach(() => signOut());

  it("no action reads or changes anything", async () => {
    const before = await everything();
    const record = { occurredOn: "2026-10-02", summary: "Взломан" };

    const calls: [string, () => Promise<unknown>][] = [
      ["createContact", () => createContact(contactValues())],
      ["updateContact", () => updateContact(petr, contactValues())],
      ["deleteContact", () => deleteContact(petr)],
      ["stopReminders", () => stopReminders(petr)],
      ["addInteraction", () => addInteraction(petr, record)],
      ["markContacted", () => markContacted(petr)],
      ["updateInteraction", () => updateInteraction(petrRecord, record)],
      ["deleteInteraction", () => deleteInteraction(petrRecord)],
      ["createGroup", () => createGroup("Сквош")],
      ["renameGroup", () => renameGroup(tennis, "Сквош")],
      ["deleteGroup", () => deleteGroup(tennis)],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toBeInstanceOf(RedirectedToSignIn);
    }

    expect(await everything()).toEqual(before);
  });
});
