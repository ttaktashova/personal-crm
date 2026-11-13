import { beforeEach, describe, expect, it, vi } from "vitest";

import { getContact } from "@/lib/contacts";
import { todayIsoDate } from "@/lib/dates";
import { listInteractions } from "@/lib/interactions";
import { listDueContacts } from "@/lib/keep-in-touch";
import { addContact, addRevenge, addUser } from "@/test/factories";
import { signInAs } from "@/test/current-user";
import { resetDatabase } from "@/test/reset-database";

import { deleteContact, stopReminders } from "./actions";

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
