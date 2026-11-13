import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMail } from "@/lib/mail";

import { buildSignInEmail, sendSignInEmail } from "./sign-in-email";

// "Письмо со ссылкой" and "Ссылка и почта не попадают в журнал" of the sign-in spec.
// The email goes through a Nodemailer transport that keeps it in memory: no network.

const memory = nodemailer.createTransport({ jsonTransport: true });

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));

type SentMessage = {
  from: { name: string; address: string };
  to: { address: string }[];
  subject: string;
  html: string;
  text: string;
};

let sent: SentMessage[] = [];

beforeEach(() => {
  sent = [];
  vi.stubEnv("EMAIL_FROM", "noreply@mail.crm.testblacklist.ru");
  vi.mocked(sendMail).mockImplementation(async (message) => {
    const info = await memory.sendMail(message);
    sent.push(JSON.parse(info.message as unknown as string));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const URL_WITH_AMPERSAND =
  "http://127.0.0.1:3100/api/auth/magic-link/verify?token=abcDEF123&callbackURL=%2F";

describe("buildSignInEmail", () => {
  it("has the subject, the «Войти» button and the two lines", () => {
    const email = buildSignInEmail("http://127.0.0.1:3100/verify?token=abc");

    expect(email.subject).toBe("Вход в Черный список");
    expect(email.html).toMatch(
      /<a [^>]*href="http:\/\/127\.0\.0\.1:3100\/verify\?token=abc"[^>]*>Войти<\/a>/,
    );
    expect(email.html).toContain("Ссылка работает 15 минут");
    expect(email.html).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
  });

  it("has the link itself in the plain text version", () => {
    const email = buildSignInEmail(URL_WITH_AMPERSAND);

    expect(email.text).toContain(URL_WITH_AMPERSAND);
    expect(email.text).toContain("Ссылка работает 15 минут");
    expect(email.text).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
  });

  it("escapes & in the link of the HTML version", () => {
    const email = buildSignInEmail(URL_WITH_AMPERSAND);

    expect(email.html).toContain(
      'href="http://127.0.0.1:3100/api/auth/magic-link/verify?token=abcDEF123&amp;callbackURL=%2F"',
    );
    expect(email.html).not.toContain("abcDEF123&callbackURL");
  });
});

describe("sendSignInEmail", () => {
  it("sends from «Черный список» at EMAIL_FROM to the address", async () => {
    expect(await sendSignInEmail("anna@example.com", URL_WITH_AMPERSAND)).toBe(true);

    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message.from).toEqual({
      name: "Черный список",
      address: "noreply@mail.crm.testblacklist.ru",
    });
    expect(message.to).toEqual([expect.objectContaining({ address: "anna@example.com" })]);
    expect(message.subject).toBe("Вход в Черный список");
    expect(message.text).toContain(URL_WITH_AMPERSAND);
    expect(message.html).toContain(">Войти</a>");
  });

  it("logs that the email did not go, without the address and the link", async () => {
    // What Nodemailer throws when the mail server does not answer.
    const refused = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:1025 while sending to anna@example.com"),
      {
        code: "ESOCKET",
        command: "CONN",
        response: `550 <anna@example.com> ${URL_WITH_AMPERSAND}`,
      },
    );
    vi.mocked(sendMail).mockRejectedValueOnce(refused);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendSignInEmail("anna@example.com", URL_WITH_AMPERSAND)).toBe(false);

    expect(log).toHaveBeenCalledWith("Sign-in email failed (code ESOCKET, command CONN)");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("anna@example.com");
    expect(logged).not.toContain("abcDEF123");
  });

  it("does not send without EMAIL_FROM and says so in the log", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendSignInEmail("anna@example.com", URL_WITH_AMPERSAND)).toBe(false);

    expect(sent).toHaveLength(0);
    expect(log).toHaveBeenCalledWith("Sign-in email failed (code EMAIL_FROM_NOT_SET)");
  });
});
