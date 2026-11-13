import { auth } from "@/lib/auth";

// Sign-in through Better Auth's own server API, the way the app calls it, without a browser.
// The test file replaces @/lib/mail with @/test/fake-mail, so the links come from `sentEmails`.

// What the server action asks for (src/app/login/actions.ts).
export async function requestLink(email: string): Promise<void> {
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers: new Headers(),
  });
}

export type OpenedLink = {
  // Where the browser goes next: "/" after a sign-in, "/login/expired?error=…" otherwise.
  location: string;
  // "better-auth.session_token=…" for the Cookie header, or null without a sign-in.
  cookie: string | null;
};

// Opens a link from an email: what /api/auth/magic-link/verify does when the browser follows it.
export async function openLink(url: string): Promise<OpenedLink> {
  const query = Object.fromEntries(new URL(url).searchParams) as {
    token: string;
    callbackURL?: string;
    errorCallbackURL?: string;
  };
  const response = await auth.api.magicLinkVerify({
    query,
    headers: new Headers(),
    asResponse: true,
  });

  const location = new URL(response.headers.get("location") ?? "", "http://app.invalid");
  const cookie =
    response.headers
      .getSetCookie()
      .find((value) => value.includes("session_token="))
      ?.split(";")[0] ?? null;
  return { location: location.pathname + location.search, cookie };
}

// The sign-in behind a cookie, as the app sees it; null when it is gone or has expired.
export async function sessionOf(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}
