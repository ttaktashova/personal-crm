import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runQuery } from "@/db";
import { signInEmails, verifications } from "@/db/schema";
import { resetDatabase } from "@/test/reset-database";

import { deleteOtherSignInLinks, releaseSignInEmail, reserveSignInEmail } from "./sign-in-limit";

// "Лимит писем" of the sign-in spec: no more than 3 emails to one address in 10 minutes.

const ANNA = "anna@example.com";
const BORIS = "boris@example.com";

const START = new Date("2026-11-13T10:00:00Z");
const after = (minutes: number, seconds = 0) =>
  new Date(START.getTime() + (minutes * 60 + seconds) * 1000);

async function reserveTimes(email: string, times: Date[]) {
  const results = [];
  for (const now of times) results.push((await reserveSignInEmail(email, now)).status);
  return results;
}

async function emailRows() {
  return runQuery("emailRows", (db) =>
    db
      .select({ email: signInEmails.email, sentAt: signInEmails.sentAt })
      .from(signInEmails)
      .orderBy(signInEmails.id),
  );
}

describe("reserveSignInEmail", () => {
  beforeEach(resetDatabase);

  it("lets three emails through in 10 minutes and stops the fourth", async () => {
    expect(await reserveTimes(ANNA, [START, after(1), after(2), after(3)])).toEqual([
      "reserved",
      "reserved",
      "reserved",
      "limited",
    ]);
    // The refused one is not counted.
    expect(await emailRows()).toHaveLength(3);
  });

  it("lets the fourth through once the first is more than 10 minutes old", async () => {
    await reserveTimes(ANNA, [START, after(1), after(2)]);

    expect(await reserveTimes(ANNA, [after(9, 59)])).toEqual(["limited"]);
    expect(await reserveTimes(ANNA, [after(10, 1)])).toEqual(["reserved"]);
  });

  it("does not let the limit of one address stop another", async () => {
    await reserveTimes(ANNA, [START, after(1), after(2), after(3)]);

    expect(await reserveTimes(BORIS, [after(4)])).toEqual(["reserved"]);
  });

  it("deletes the rows that are more than 10 minutes old, of any address", async () => {
    await reserveTimes(BORIS, [START]);
    await reserveTimes(ANNA, [after(5)]);

    await reserveTimes(ANNA, [after(12)]);

    expect(await emailRows()).toEqual([
      { email: ANNA, sentAt: after(5) },
      { email: ANNA, sentAt: after(12) },
    ]);
  });

  it("does not let two requests at once both take the last place", async () => {
    await reserveTimes(ANNA, [START, after(1)]);

    const results = await Promise.all([
      reserveSignInEmail(ANNA, after(2)),
      reserveSignInEmail(ANNA, after(2)),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["limited", "reserved"]);
    expect(await emailRows()).toHaveLength(3);
  });
});

describe("releaseSignInEmail", () => {
  beforeEach(resetDatabase);

  it("gives back one place: the last email of the address", async () => {
    await reserveTimes(ANNA, [START, after(1), after(2)]);
    await reserveTimes(BORIS, [after(2)]);

    await releaseSignInEmail(ANNA);

    expect(await emailRows()).toEqual([
      { email: ANNA, sentAt: START },
      { email: ANNA, sentAt: after(1) },
      { email: BORIS, sentAt: after(2) },
    ]);
    expect(await reserveTimes(ANNA, [after(3)])).toEqual(["reserved"]);
  });
});

describe("deleteOtherSignInLinks", () => {
  beforeEach(resetDatabase);

  const link = (code: string, email: string) => ({
    identifier: `magic-link:${code}`,
    value: JSON.stringify({ type: "magic-link", email }),
    expiresAt: after(15),
  });

  it("deletes only the sign-in links of this address", async () => {
    await runQuery("addVerifications", (db) =>
      db.insert(verifications).values([
        link("first", ANNA),
        link("second", ANNA),
        link("boris", BORIS),
        // Not a sign-in link, though the value names the same address.
        {
          identifier: "email-verification:x",
          value: JSON.stringify({ email: ANNA }),
          expiresAt: after(15),
        },
      ]),
    );

    await deleteOtherSignInLinks(ANNA);

    const left = await runQuery("leftVerifications", (db) =>
      db
        .select({ identifier: verifications.identifier })
        .from(verifications)
        .orderBy(sql`${verifications.id}`),
    );
    expect(left.map((row) => row.identifier)).toEqual(["magic-link:boris", "email-verification:x"]);
  });
});
