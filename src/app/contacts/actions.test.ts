import { beforeEach, describe, expect, it, vi } from "vitest";

import { getContact } from "@/lib/contacts";
import { todayIsoDate } from "@/lib/dates";
import { listInteractions } from "@/lib/interactions";
import { listDueContacts } from "@/lib/keep-in-touch";
import { addContact, addRevenge } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { deleteContact, stopReminders } from "./actions";

// Outside a running Next.js server revalidatePath throws: there is no page cache to clear.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("stopReminders: «Простить» in «Пора мстить»", () => {
  beforeEach(resetDatabase);

  it("sets «Не задано», moves «изменён» to today and keeps the records", async () => {
    const longAgo = new Date("2026-01-15T09:00:00Z");
    const boris = await addContact({
      name: "Борис",
      contactFrequency: "month",
      createdAt: longAgo,
      updatedAt: longAgo,
    });
    await addRevenge(boris.id, "2026-08-01");

    expect(await stopReminders(boris.id)).toEqual({ status: "stopped" });

    const after = await getContact(boris.id);
    expect(after?.contactFrequency).toBeNull();
    expect(todayIsoDate(after!.updatedAt)).toBe(todayIsoDate());
    expect(after?.createdAt).toEqual(longAgo);
    expect(await listInteractions(boris.id)).toMatchObject([
      { occurredOn: "2026-08-01", summary: "Отомстил" },
    ]);
    expect(await listDueContacts(todayIsoDate(), null)).toEqual([]);
  });

  it("answers not-found when the contact was deleted", async () => {
    const boris = await addContact({ name: "Борис", contactFrequency: "month" });
    await deleteContact(boris.id);

    expect(await stopReminders(boris.id)).toEqual({ status: "not-found" });
  });
});
