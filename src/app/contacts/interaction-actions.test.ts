import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQuery } from "@/db";
import { interactions } from "@/db/schema";
import { listInteractions } from "@/lib/interactions";
import { listDueContacts } from "@/lib/keep-in-touch";
import { addContact, addRevenge } from "@/test/factories";
import { resetDatabase } from "@/test/reset-database";

import { deleteContact } from "./actions";
import { markContacted, updateInteraction } from "./interaction-actions";

// Outside a running Next.js server revalidatePath throws: there is no page cache to clear.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const countRecords = () => runQuery("countRecords", (db) => db.$count(interactions));

describe("markContacted: «Отомстил» in «Пора мстить»", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds «Отомстил» for today in Moscow, and the contact is no longer due", async () => {
    // 21:30 in UTC on 23.10 is already 00:30 on 24.10 in Moscow.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T21:30:00Z"));
    const anna = await addContact({ name: "Анна", contactFrequency: "week" });
    await addRevenge(anna.id, "2026-10-01");

    expect(await markContacted(anna.id)).toEqual({ status: "saved" });

    expect(await listInteractions(anna.id)).toMatchObject([
      { occurredOn: "2026-10-24", summary: "Отомстил" },
      { occurredOn: "2026-10-01" },
    ]);
    expect(await listDueContacts("2026-10-24", null)).toEqual([]);
  });

  it("answers not-found and writes nothing when the contact was deleted", async () => {
    const anna = await addContact({ name: "Анна", contactFrequency: "week" });
    await deleteContact(anna.id);

    expect(await markContacted(anna.id)).toEqual({ status: "not-found" });
    expect(await countRecords()).toBe(0);
  });
});

describe("updateInteraction", () => {
  beforeEach(resetDatabase);

  it("an earlier date of the only record makes the contact due at once", async () => {
    const anna = await addContact({ name: "Анна", contactFrequency: "month" });
    await addRevenge(anna.id, "2026-10-24");
    expect(await listDueContacts("2026-10-24", null)).toEqual([]);
    const [record] = await listInteractions(anna.id);

    const result = await updateInteraction(record.id, {
      occurredOn: "2026-09-01",
      summary: "Отомстил",
    });

    expect(result).toEqual({ status: "saved" });
    expect(await listDueContacts("2026-10-24", null)).toMatchObject([
      { name: "Анна", dueOn: "2026-10-01" },
    ]);
  });
});
