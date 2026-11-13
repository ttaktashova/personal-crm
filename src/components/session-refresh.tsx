"use client";

import { useEffect } from "react";

// "Вход держится 30 дней с последнего захода": Better Auth moves the end of a sign-in only
// when the session is asked for in a route handler, not while a page renders. So every time
// the app is opened the browser asks once; at most once a day it moves the end in the
// database and in the cookie (session.updateAge in src/lib/auth.ts), otherwise it writes nothing.
export function SessionRefresh() {
  useEffect(() => {
    fetch("/api/auth/get-session", { cache: "no-store" }).catch(() => {
      // Offline: the next visit does it.
    });
  }, []);
  return null;
}
