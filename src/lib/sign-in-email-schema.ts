import { z } from "zod";

// The address on the sign-in page: one rule for the server action and for Better Auth's
// own hook (src/lib/auth.ts), so a request that skips the form is checked the same way.
// Stored and compared without spaces at the edges and in lowercase. The message is
// user-facing, hence in Russian; every mistake gets the same one.
const MESSAGE = "Проверьте адрес почты";

export const MAX_EMAIL_LENGTH = 254;

export const signInEmailSchema = z
  .string(MESSAGE)
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, MESSAGE)
  .pipe(z.email(MESSAGE));
