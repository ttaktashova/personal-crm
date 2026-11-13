import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Better Auth's addresses: the link from the email (/api/auth/magic-link/verify), the session
// that SessionRefresh asks for (/api/auth/get-session) and sign-out. Asking for a link over
// HTTP answers 404 (disabledPaths in src/lib/auth.ts).
export const { GET, POST } = toNextJsHandler(auth);
