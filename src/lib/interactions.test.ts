import { beforeEach, describe, expect, it } from "vitest";

import { addContact, addRevenge, addUser } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { listInteractions } from "./interactions";

// The revenge records of a contact belong to the contact's owner.
describe("listInteractions", () => {
  let owner: number;
  let stranger: number;

  beforeEach(async () => {
    await resetDatabase();
    owner = (await addUser("anna@example.com")).id;
    stranger = (await addUser("boris@example.com")).id;
    // So that no contact has the id of a user.
    await addContact(stranger, { name: "Вера" });
    await addContact(stranger, { name: "Глеб" });
  });

  it("gives the owner the records of their contact, newest first", async () => {
    const petr = await addContact(owner, { name: "Пётр" });
    await addRevenge(petr.id, "2026-09-01");
    await addRevenge(petr.id, "2026-10-01");

    expect(await listInteractions(owner, petr.id)).toMatchObject([
      { occurredOn: "2026-10-01", summary: "Отомстил" },
      { occurredOn: "2026-09-01", summary: "Отомстил" },
    ]);
  });

  it("gives nothing of another user's contact", async () => {
    const petr = await addContact(owner, { name: "Пётр" });
    await addRevenge(petr.id, "2026-10-01");

    expect(await listInteractions(stranger, petr.id)).toEqual([]);
  });
});
