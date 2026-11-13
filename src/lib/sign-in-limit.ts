import "server-only";

import { eq, sql } from "drizzle-orm";

import { runQuery } from "@/db";
import { signInEmails, verifications } from "@/db/schema";

// "Лимит писем": no more than 3 sign-in emails to one address in 10 minutes, whoever asks —
// the form or a request that skips it. Better Auth's own limit counts by IP and only for HTTP
// requests, so the emails are counted here, in sign_in_emails. Called from the hooks of
// src/lib/auth.ts with an address that is already lowercase and without spaces.

export const SIGN_IN_EMAIL_LIMIT = 3;
const WINDOW_MS = 10 * 60 * 1000;

export type ReserveResult = { status: "reserved" } | { status: "limited" };

// Takes a place for one more email to `email`, or says the limit is reached. `now` is a
// parameter so the tests can move the clock.
export async function reserveSignInEmail(email: string, now = new Date()): Promise<ReserveResult> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  return runQuery("reserveSignInEmail", (db) =>
    db.transaction(async (tx) => {
      // Two requests for one address wait for each other, so both cannot take the last place.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

      // Rows of any address older than the window are of no use. Rows another request is
      // deleting right now are skipped, so two addresses never wait for each other.
      await tx.execute(sql`
        delete from ${signInEmails}
        where id in (
          select id from ${signInEmails}
          where sent_at <= ${windowStart.toISOString()}::timestamptz
          for update skip locked
        )
      `);

      const sent = await tx.$count(signInEmails, eq(signInEmails.email, email));
      if (sent >= SIGN_IN_EMAIL_LIMIT) return { status: "limited" } as const;

      await tx.insert(signInEmails).values({ email, sentAt: now });
      return { status: "reserved" } as const;
    }),
  );
}

// The email did not go: it is not counted. Gives back the newest place of the address.
export async function releaseSignInEmail(email: string): Promise<void> {
  await runQuery("releaseSignInEmail", (db) =>
    db.execute(sql`
      delete from ${signInEmails}
      where id = (
        select id from ${signInEmails}
        where email = ${email}
        order by sent_at desc, id desc
        limit 1
      )
    `),
  );
}

// "Новая ссылка гасит старые": called right before a new sign-in link of `email` is saved.
// A link row is identifier "magic-link:<hash>" with value {"type":"magic-link","email":"…"};
// Better Auth has no option for this. The CASE reads the value only of link rows: other
// kinds of rows may hold something that is not JSON.
export async function deleteOtherSignInLinks(email: string): Promise<void> {
  await runQuery("deleteOtherSignInLinks", (db) =>
    db.execute(sql`
      delete from ${verifications}
      where case
        when identifier like 'magic-link:%' then (value::jsonb ->> 'email') = ${email}
        else false
      end
    `),
  );
}
