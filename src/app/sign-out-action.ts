"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DatabaseError } from "@/db/database-error";
import { auth } from "@/lib/auth";

// «Выйти» in the header: ends the sign-in of this device only and deletes its cookie;
// the other devices stay inside. Then the sign-in page.
export async function signOut(): Promise<void> {
  const requestHeaders = await headers();
  try {
    await auth.api.signOut({ headers: requestHeaders });
  } catch (error) {
    // Better Auth's own answer means there was no sign-in left to end: nothing to do.
    if (!isAPIError(error)) throw new DatabaseError("signOut", error);
  }
  redirect("/login");
}
