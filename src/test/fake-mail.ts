import type { SendMailOptions } from "nodemailer";
import { vi } from "vitest";

// Stands in for @/lib/mail in the tests of sign-in: the emails stay in `sentEmails`, nothing
// goes over the network. In a test file:
//   vi.mock("@/lib/mail", () => import("@/test/fake-mail"));

export type SentEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  // The sign-in link: the first http(s) address of the text version.
  url: string;
};

export const sentEmails: SentEmail[] = [];

export const sendMail = vi.fn(async (message: SendMailOptions): Promise<void> => {
  const text = String(message.text ?? "");
  sentEmails.push({
    to: String(message.to),
    subject: String(message.subject),
    text,
    html: String(message.html ?? ""),
    url: text.match(/https?:\/\/\S+/)?.[0] ?? "",
  });
});

// The next send fails the way Nodemailer fails when the mail server does not answer.
export function failNextSend(): void {
  sendMail.mockImplementationOnce(async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1025"), {
      code: "ESOCKET",
      command: "CONN",
    });
  });
}

// For beforeEach: no emails, and every send goes again.
export function clearSentEmails(): void {
  sentEmails.length = 0;
  sendMail.mockClear();
}
