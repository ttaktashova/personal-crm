"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";

import { DatabaseError } from "@/db/database-error";
import { auth, SIGN_IN_ERROR_CODES } from "@/lib/auth";
import { signInEmailSchema } from "@/lib/sign-in-email-schema";

export type RequestSignInLinkResult =
  | { status: "sent"; email: string } // the address as it is stored: lowercase, no spaces
  | { status: "invalid" }
  | { status: "too-often" }
  | { status: "send-failed" };

// "Получить ссылку" on /login. The answer is the same whether anyone has signed in with this
// address before or not. The rules of the address and the limit live in Better Auth's hook
// (src/lib/auth.ts); the check here only saves a call for an obviously wrong address.
export async function requestSignInLink(formData: FormData): Promise<RequestSignInLinkResult> {
  const parsed = signInEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "invalid" };
  const email = parsed.data;

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error)) {
      const code = (error.body as { code?: unknown } | undefined)?.code;
      if (code === SIGN_IN_ERROR_CODES.invalidEmail) return { status: "invalid" };
      if (code === SIGN_IN_ERROR_CODES.tooManyEmails) return { status: "too-often" };
      if (code === SIGN_IN_ERROR_CODES.emailNotSent) return { status: "send-failed" };
    }
    // Anything else, e.g. the database is down: only codes reach the log, never the address.
    throw new DatabaseError("requestSignInLink", error);
  }

  return { status: "sent", email };
}
