import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

import { authDatabase } from "@/db";
import { DatabaseError } from "@/db/database-error";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { parseId } from "@/lib/ids";
import { sendSignInEmail } from "@/lib/sign-in-email";
import { signInEmailSchema } from "@/lib/sign-in-email-schema";
import {
  deleteOtherSignInLinks,
  releaseSignInEmail,
  reserveSignInEmail,
} from "@/lib/sign-in-limit";
import { createStarterGroups } from "@/lib/starter-groups";

// Sign-in by a link from an email (Better Auth with its magic-link plugin): the sign-in spec.
// Secret and address come from BETTER_AUTH_SECRET and BETTER_AUTH_URL; the address builds
// the links in the emails, so the app has to be opened at it.

const SIGN_IN_PATH = "/sign-in/magic-link";
const LINK_PREFIX = "magic-link:";
const DAY_SECONDS = 24 * 60 * 60;

// Codes the server action (src/app/login/actions.ts) turns into the messages under the field.
export const SIGN_IN_ERROR_CODES = {
  invalidEmail: "INVALID_EMAIL",
  tooManyEmails: "TOO_MANY_EMAILS",
  emailNotSent: "EMAIL_NOT_SENT",
} as const;

// A failed request as the log may see it: Better Auth's status and code, or the codes of a
// database error. The adapter's own errors carry the query values (the address, the link's
// hash), so their message is never logged (error-logging).
function describeError(error: unknown): string {
  if (isAPIError(error)) {
    const code = (error.body as { code?: unknown } | undefined)?.code;
    return `status ${error.status}${typeof code === "string" ? `, code ${code}` : ""}`;
  }
  return new DatabaseError("auth", error).message;
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(authDatabase, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  // Integer ids from Postgres, like every other table.
  advanced: { database: { generateId: "serial" } },
  // 30 days since the last visit on the device, moved forward at most once a day. Every
  // visit asks for the session (SessionRefresh in the header): see src/lib/session.ts.
  session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },
  // Its limit counts requests per IP over HTTP only. The emails are limited per address in
  // the hook below; a link has 32 random letters, nothing to guess.
  rateLimit: { enabled: false },
  // A link is asked for only through the server action, never over HTTP: one way in.
  disabledPaths: [SIGN_IN_PATH],
  hooks: {
    // Runs for auth.api calls too, so the rules hold for any caller, not only the form.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;

      const parsed = signInEmailSchema.safeParse(ctx.body?.email);
      if (!parsed.success) {
        throw new APIError("BAD_REQUEST", {
          code: SIGN_IN_ERROR_CODES.invalidEmail,
          message: "The email address is not valid",
        });
      }
      const email = parsed.data;

      if ((await reserveSignInEmail(email)).status === "limited") {
        throw new APIError("TOO_MANY_REQUESTS", {
          code: SIGN_IN_ERROR_CODES.tooManyEmails,
          message: "Too many sign-in emails to this address",
        });
      }

      // The link row and the email get the address as it is stored: lowercase, no spaces.
      return { context: { body: { ...ctx.body, email } } };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // A user Better Auth creates at the first sign-in starts with five empty groups of
        // their own. The owner is created by a migration, not here, so gets none. Not in one
        // transaction with the user: if it fails, the groups can be made by hand.
        after: async (user) => {
          const id = parseId(user.id);
          if (id !== null) await createStarterGroups(id);
        },
      },
    },
    verification: {
      create: {
        // A new link turns off the older ones of the same address.
        before: async (verification) => {
          if (!verification.identifier.startsWith(LINK_PREFIX)) return;
          const { email } = JSON.parse(verification.value) as { email: string };
          await deleteOtherSignInLinks(email);
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      // The database and its backups keep a hash, not a working link.
      storeToken: "hashed",
      async sendMagicLink({ email, url }) {
        if (await sendSignInEmail(email, url)) return;
        // Not sent, not counted.
        await releaseSignInEmail(email);
        throw new APIError("INTERNAL_SERVER_ERROR", {
          code: SIGN_IN_ERROR_CODES.emailNotSent,
          message: "The sign-in email was not sent",
        });
      },
    }),
    // Lets server actions set the sign-in cookie. Has to be the last plugin.
    nextCookies(),
  ],
  // Only the level and the first line of the message: Better Auth passes errors as extra
  // arguments, and a database error's message has the query values on the next line.
  logger: {
    level: "error",
    log: (level, message) => {
      console.error(`Sign-in ${level}: ${String(message).split("\n")[0]}`);
    },
  },
  // Failed requests to /api/auth/*: the codes only, see describeError.
  onAPIError: {
    onError: (error) => {
      console.error(`Sign-in request failed (${describeError(error)})`);
    },
  },
  telemetry: { enabled: false },
});
