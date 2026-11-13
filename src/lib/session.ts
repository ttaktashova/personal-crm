import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { DatabaseError } from "@/db/database-error";
import { auth } from "@/lib/auth";
import { parseId } from "@/lib/ids";

// Who is signed in on this device: the real check, against the sessions in the database.
// src/proxy.ts only sends away those who have no sign-in cookie at all; a cookie can be stale.

export type CurrentUser = { id: number; email: string };

// Null without a sign-in or when it has ended. Deduplicated per request: the header, the page
// and its metadata ask once. Read inside <Suspense>: it depends on the request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const requestHeaders = await headers();

  let session;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch (error) {
    // The adapter's errors carry the query values: only the codes go further.
    throw new DatabaseError("getCurrentUser", error);
  }
  if (!session) return null;

  // Better Auth gives the integer id of Postgres as a string.
  const id = parseId(session.user.id);
  return id === null ? null : { id, email: session.user.email };
});

// The signed-in user, or the sign-in page. The first line of every page that shows data and of
// every server action: a server action can be called directly, past any page and the proxy.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
