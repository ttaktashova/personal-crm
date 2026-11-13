import "server-only";

import { sendMail } from "@/lib/mail";

// The email with the sign-in link: "Письмо со ссылкой" of the sign-in spec. Texts are
// user-facing, hence in Russian. The sender's name is part of the interface; its address
// comes from EMAIL_FROM.

const SENDER_NAME = "Черный список";
const SUBJECT = "Вход в Черный список";
const EXPIRY_LINE = "Ссылка работает 15 минут.";
const IGNORE_LINE = "Если вы не запрашивали вход — просто проигнорируйте письмо.";

// Mail programs do not read CSS variables, so the button colors are written out here.
// A copy of the tokens --primary and --primary-foreground of src/app/globals.css: change both.
const BUTTON_BACKGROUND = "#ff4a2e";
const BUTTON_TEXT = "#17110f";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type SignInEmail = { subject: string; html: string; text: string };

// The HTML version has the «Войти» button; the text one, for programs that show text only,
// has the link itself.
export function buildSignInEmail(url: string): SignInEmail {
  const href = escapeHtml(url);
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>${SUBJECT}</title>
  </head>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
    <h1 style="margin:0 0 20px;font-size:22px">${SUBJECT}</h1>
    <p style="margin:0 0 20px">
      <a href="${href}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:${BUTTON_BACKGROUND};color:${BUTTON_TEXT};font-weight:bold;text-decoration:none">Войти</a>
    </p>
    <p style="margin:0 0 8px">${EXPIRY_LINE}</p>
    <p style="margin:0">${IGNORE_LINE}</p>
  </body>
</html>
`;
  const text = `${SUBJECT}

Войти: ${url}

${EXPIRY_LINE}
${IGNORE_LINE}
`;
  return { subject: SUBJECT, html, text };
}

const SAFE_TOKEN = /^[0-9A-Z_]{1,64}$/; // "ESOCKET", "CONN", "EAUTH"

// The code of a failed send, and the step it failed at, if they look like codes. The message
// and the server's response are never logged: they can hold the address and the link.
function describeSendError(error: unknown): string {
  const fields = error as { code?: unknown; command?: unknown };
  const code =
    typeof fields?.code === "string" && SAFE_TOKEN.test(fields.code) ? fields.code : null;
  const command =
    typeof fields?.command === "string" && SAFE_TOKEN.test(fields.command) ? fields.command : null;

  const details = [`code ${code ?? "unknown"}`];
  if (command) details.push(`command ${command}`);
  return details.join(", ");
}

// Sends the sign-in email to `email`. False when it did not go; the log then says why,
// without the address and the link (error-logging).
export async function sendSignInEmail(email: string, url: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("Sign-in email failed (code EMAIL_FROM_NOT_SET)");
    return false;
  }

  try {
    await sendMail({
      from: { name: SENDER_NAME, address: from },
      to: email,
      ...buildSignInEmail(url),
    });
    return true;
  } catch (error) {
    console.error(`Sign-in email failed (${describeSendError(error)})`);
    return false;
  }
}
