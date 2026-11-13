import "server-only";

import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

// Where the app's emails go is decided by one setting, SMTP_URL, not by the code: the same
// build sends them to the Mailpit catcher on a computer and in CI (smtp://127.0.0.1:1025)
// and to real mailboxes through Resend on the server (smtps://resend:<key>@smtp.resend.com:465).
// The transport is made at the first email, so building the app needs no SMTP_URL.

let transport: Transporter | undefined;

export async function sendMail(message: SendMailOptions): Promise<void> {
  if (!transport) {
    const url = process.env.SMTP_URL;
    if (!url) {
      throw Object.assign(new Error("SMTP_URL is not set"), { code: "SMTP_URL_NOT_SET" });
    }
    transport = nodemailer.createTransport(url);
  }
  await transport.sendMail(message);
}
