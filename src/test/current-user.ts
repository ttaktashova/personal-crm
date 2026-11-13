import { vi } from "vitest";

import type { CurrentUser } from "@/lib/session";

// Stands in for @/lib/session in the tests of server actions: there is no request with a
// sign-in cookie outside a running Next.js server. In a test file:
//   vi.mock("@/lib/session", () => import("@/test/current-user"));
// then signInAs(user) or signOut() before the call.

let current: CurrentUser | null = null;

export function signInAs(user: { id: number; email: string }): void {
  current = { id: user.id, email: user.email };
}

export function signOut(): void {
  current = null;
}

// What requireUser does without a sign-in: Next's redirect() throws, so the action stops.
export class RedirectedToSignIn extends Error {
  constructor() {
    super("Redirected to /login");
    this.name = "RedirectedToSignIn";
  }
}

export const getCurrentUser = vi.fn(async () => current);

export const requireUser = vi.fn(async (): Promise<CurrentUser> => {
  if (!current) throw new RedirectedToSignIn();
  return current;
});
