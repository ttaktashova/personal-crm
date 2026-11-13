import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearSentEmails, failNextSend, sentEmails } from "@/test/fake-mail";
import { resetDatabase } from "@/test/reset-database";

import { requestSignInLink } from "./actions";

// The form on /login, as the server sees it. The emails stay in memory.
vi.mock("@/lib/mail", () => import("@/test/fake-mail"));
// Outside a running Next.js server there are no request headers.
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

function form(email: string | null): FormData {
  const data = new FormData();
  if (email !== null) data.set("email", email);
  return data;
}

beforeEach(async () => {
  await resetDatabase();
  clearSentEmails();
});

describe("requestSignInLink", () => {
  it("sends the link and answers with the address as it is stored", async () => {
    expect(await requestSignInLink(form("  Anna@Example.COM  "))).toEqual({
      status: "sent",
      email: "anna@example.com",
    });
    expect(sentEmails.map((sent) => sent.to)).toEqual(["anna@example.com"]);
  });

  it("answers invalid to a wrong, empty or missing address, and sends nothing", async () => {
    for (const email of ["anna@", "", "   ", null]) {
      expect(await requestSignInLink(form(email))).toEqual({ status: "invalid" });
    }
    expect(sentEmails).toHaveLength(0);
  });

  it("answers too-often to the fourth request in 10 minutes", async () => {
    for (let i = 0; i < 3; i++) await requestSignInLink(form("anna@example.com"));

    expect(await requestSignInLink(form("anna@example.com"))).toEqual({ status: "too-often" });
    expect(sentEmails).toHaveLength(3);
  });

  it("answers send-failed when the email did not go", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failNextSend();

    expect(await requestSignInLink(form("anna@example.com"))).toEqual({ status: "send-failed" });
  });
});
