import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// A quick check without the database: no sign-in cookie at all — the sign-in page, with a real
// redirect. It is not the protection: a cookie can be stale, and server actions are checked
// by requireUser (src/lib/session.ts). Signed-in users on /login are sent to the main page
// by the page itself, which checks the cookie for real: a stale one would loop here.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  // The app's own address, like the links in the emails: the sign-in works only there, and it
  // does not depend on the headers nginx passes on.
  return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL || request.url));
}

export const config = {
  matcher: [
    // Everything but the sign-in pages, Better Auth's addresses (the link from the email
    // among them), the deploy's /health and the files of the pages.
    "/((?!login|api/auth|health|_next/static|_next/image|icon.svg|favicon.ico).*)",
  ],
};
