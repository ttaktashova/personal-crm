import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQuery } from "@/db";
import { sessions, signInEmails, users, verifications } from "@/db/schema";
import { addGroup, addUser } from "@/test/factories";
import { clearSentEmails, failNextSend, sentEmails } from "@/test/fake-mail";
import { resetDatabase } from "@/test/reset-database";
import { openLink, requestLink, sessionOf } from "@/test/sign-in";

import { listGroups } from "./groups";
import { parseId } from "./ids";
import { createStarterGroups } from "./starter-groups";

// The rules of sign-in of the sign-in spec, through Better Auth's server API on the test
// database. The emails stay in memory (@/test/fake-mail).
vi.mock("@/lib/mail", () => import("@/test/fake-mail"));

const ANNA = "anna@example.com";
const EXPIRED = "/login/expired?error=INVALID_TOKEN";
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await resetDatabase();
  clearSentEmails();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const linksTo = (email: string) =>
  sentEmails.filter((sent) => sent.to === email).map((sent) => sent.url);

// Moves the expiry of every unused link: "-14" means the link was asked 14 minutes ago.
async function ageLinks(minutes: number) {
  await runQuery("ageLinks", (db) =>
    db
      .update(verifications)
      .set({ expiresAt: sql`${verifications.expiresAt} - make_interval(mins => ${minutes})` }),
  );
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("asking for a link", () => {
  it("drops the spaces and the capitals: the email and the link are for anna@example.com", async () => {
    await requestLink("  Anna@Example.COM  ");

    expect(sentEmails.map((sent) => sent.to)).toEqual([ANNA]);
    const [link] = await runQuery("links", (db) => db.select().from(verifications));
    expect(JSON.parse(link.value)).toMatchObject({ type: "magic-link", email: ANNA });
    // The database keeps a hash of the code, not the working link.
    const code = new URL(sentEmails[0].url).searchParams.get("token")!;
    expect(code).toMatch(/^[A-Za-z]{32}$/);
    expect(link.identifier).not.toContain(code);
  });

  it("refuses a wrong address that skipped the form, and sends nothing", async () => {
    const error = await rejection(requestLink("not-an-email"));

    expect(error).toMatchObject({ body: { code: "INVALID_EMAIL" } });
    expect(sentEmails).toHaveLength(0);
    expect(await runQuery("links", (db) => db.$count(verifications))).toBe(0);
    expect(await runQuery("emails", (db) => db.$count(signInEmails))).toBe(0);
  });

  it("puts the link to /api/auth/magic-link/verify in the email", async () => {
    await requestLink(ANNA);

    const url = new URL(sentEmails[0].url);
    expect(url.origin + url.pathname).toBe("http://127.0.0.1:3100/api/auth/magic-link/verify");
    expect(url.searchParams.get("callbackURL")).toBe("/");
    expect(url.searchParams.get("errorCallbackURL")).toBe("/login/expired");
  });
});

describe("opening a link", () => {
  it("creates the user at the first sign-in, with an empty name, and opens the main page", async () => {
    await requestLink(ANNA);

    const opened = await openLink(sentEmails[0].url);

    expect(opened.location).toBe("/");
    expect(opened.cookie).not.toBeNull();
    const all = await runQuery("users", (db) =>
      db.select({ email: users.email, name: users.name }).from(users),
    );
    expect(all).toEqual([{ email: ANNA, name: "" }]);
    expect((await sessionOf(opened.cookie!))?.user.email).toBe(ANNA);
  });

  it("lets a link in only once", async () => {
    await requestLink(ANNA);
    const [url] = linksTo(ANNA);

    expect((await openLink(url)).location).toBe("/");
    const second = await openLink(url);

    expect(second).toEqual({ location: EXPIRED, cookie: null });
    expect(await runQuery("sessions", (db) => db.$count(sessions))).toBe(1);
  });

  it("lets a link in 14 minutes after it was asked", async () => {
    await requestLink(ANNA);
    await ageLinks(14);

    expect((await openLink(linksTo(ANNA)[0])).location).toBe("/");
  });

  it("does not let a link in 16 minutes after it was asked", async () => {
    await requestLink(ANNA);
    await ageLinks(16);

    expect(await openLink(linksTo(ANNA)[0])).toEqual({ location: EXPIRED, cookie: null });
  });

  it("turns the older link off when a new one is asked", async () => {
    await requestLink(ANNA);
    await requestLink(ANNA);
    const [first, second] = linksTo(ANNA);

    expect(await openLink(first)).toEqual({ location: EXPIRED, cookie: null });
    expect((await openLink(second)).location).toBe("/");
  });

  it("does not turn off the link of another address", async () => {
    await requestLink(ANNA);
    await requestLink("boris@example.com");

    expect((await openLink(linksTo(ANNA)[0])).location).toBe("/");
  });

  it("keeps the sign-in for 30 days", async () => {
    await requestLink(ANNA);
    const { cookie } = await openLink(linksTo(ANNA)[0]);

    const session = await sessionOf(cookie!);
    const daysLeft = (session!.session.expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(daysLeft).toBeGreaterThan(29.99);
    expect(daysLeft).toBeLessThanOrEqual(30);
  });

  it("gives two sign-ins for two links, and both work", async () => {
    await requestLink(ANNA);
    const computer = await openLink(linksTo(ANNA)[0]);
    await requestLink(ANNA);
    const phone = await openLink(linksTo(ANNA)[1]);

    expect(computer.cookie).not.toEqual(phone.cookie);
    expect((await sessionOf(computer.cookie!))?.user.email).toBe(ANNA);
    expect((await sessionOf(phone.cookie!))?.user.email).toBe(ANNA);
    expect(await runQuery("users", (db) => db.$count(users))).toBe(1);
  });
});

describe("the limit of emails", () => {
  it("stops the fourth email in 10 minutes, whatever the case of the address", async () => {
    for (let i = 0; i < 3; i++) await requestLink(ANNA);

    const error = await rejection(requestLink("ANNA@example.com"));

    expect(error).toMatchObject({ body: { code: "TOO_MANY_EMAILS" } });
    expect(sentEmails).toHaveLength(3);
  });

  it("does not count an email that did not go", async () => {
    failNextSend();
    const error = await rejection(requestLink(ANNA));

    expect(error).toMatchObject({ body: { code: "EMAIL_NOT_SENT" } });
    expect(sentEmails).toHaveLength(0);

    for (let i = 0; i < 3; i++) await requestLink(ANNA);
    expect(sentEmails).toHaveLength(3);
  });
});

describe("the log", () => {
  function spyOnConsole() {
    return (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  }

  function logged(spies: ReturnType<typeof spyOnConsole>) {
    return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
  }

  it("has neither the address nor the link after a sign-in", async () => {
    const spies = spyOnConsole();

    await requestLink(ANNA);
    const url = linksTo(ANNA)[0];
    await openLink(url);
    await openLink(url);

    const code = new URL(url).searchParams.get("token")!;
    expect(logged(spies)).not.toContain(ANNA);
    expect(logged(spies)).not.toContain(code);
  });

  it("says the email did not go, without the address", async () => {
    const spies = spyOnConsole();
    failNextSend();

    await rejection(requestLink(ANNA));

    expect(logged(spies)).toContain("Sign-in email failed (code ESOCKET, command CONN)");
    expect(logged(spies)).not.toContain(ANNA);
  });
});

// "Стартовые группы" of the contact-groups spec: a new user gets five empty groups of their own
// at the first sign-in; the owner, whom the migration created, gets none.
describe("the starting groups", () => {
  const STARTER_GROUPS = ["Бывшие", "Должники", "Коллеги", "Не любят котиков", "Родственники"];

  async function signInFirstTime(email: string) {
    await requestLink(email);
    const { cookie } = await openLink(linksTo(email).at(-1)!);
    const session = await sessionOf(cookie!);
    return parseId(session!.user.id)!;
  }

  it("are five empty groups of a new user's own", async () => {
    const id = await signInFirstTime(ANNA);

    expect(await listGroups(id)).toEqual(
      STARTER_GROUPS.map((name) => ({ id: expect.any(Number), name, contactCount: 0 })),
    );
  });

  it("are not added to the owner, whom the migration created", async () => {
    const owner = await addUser(ANNA);
    await addGroup(owner.id, "Друзья");
    await addGroup(owner.id, "Теннис");

    expect(await signInFirstTime(ANNA)).toBe(owner.id);

    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Друзья", "Теннис"]);
  });

  it("are not added twice", async () => {
    const id = await signInFirstTime(ANNA);

    await createStarterGroups(id);

    expect(await listGroups(id)).toHaveLength(5);
  });

  it("are each user's own: two new users get five each", async () => {
    const anna = await signInFirstTime(ANNA);
    const boris = await signInFirstTime("boris@example.com");

    expect(await listGroups(anna)).toHaveLength(5);
    expect(await listGroups(boris)).toHaveLength(5);
  });
});
