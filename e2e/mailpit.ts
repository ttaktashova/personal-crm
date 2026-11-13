import { expect } from "@playwright/test";

// The Mailpit catcher of docker-compose.yml and of the E2E job in CI. The app under test sends
// its emails there (SMTP_URL in playwright.config.ts); the tests read them through its API.
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
export const MAILPIT_SMTP_URL = process.env.MAILPIT_SMTP_URL ?? "smtp://127.0.0.1:1025";

type Address = { Name: string; Address: string };

type MessageSummary = { ID: string; Created: string };

type Message = {
  From: Address;
  To: Address[];
  Subject: string;
  Text: string;
  HTML: string;
};

export type Email = {
  from: Address;
  to: string[];
  subject: string;
  text: string;
  html: string;
  // The sign-in link: the first http(s) address of the text version.
  link: string;
};

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${MAILPIT_URL}${path}`, init);
  } catch (error) {
    throw new Error("Cannot reach Mailpit. Start it with: docker compose up -d", { cause: error });
  }
  if (!response.ok) throw new Error(`Mailpit answered ${response.status} to ${path}`);
  return response;
}

async function mailpit<T>(path: string): Promise<T> {
  return (await request(path)).json() as Promise<T>;
}

// Deletes every email, so a test sees only its own. Mailpit answers "ok" as plain text.
export async function clearInbox(): Promise<void> {
  await request("/api/v1/messages", { method: "DELETE" });
}

// The emails to `address`, oldest first.
export async function emailsTo(address: string): Promise<Email[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const { messages } = await mailpit<{ messages: MessageSummary[] | null }>(
    `/api/v1/search?query=${query}`,
  );
  const found = (messages ?? []).toSorted((a, b) => a.Created.localeCompare(b.Created));

  return Promise.all(
    found.map(async ({ ID }) => {
      const message = await mailpit<Message>(`/api/v1/message/${ID}`);
      return {
        from: message.From,
        to: message.To.map((to) => to.Address),
        subject: message.Subject,
        text: message.Text,
        html: message.HTML,
        link: message.Text.match(/https?:\/\/\S+/)?.[0] ?? "",
      };
    }),
  );
}

// Waits until `count` emails to `address` have come and returns the newest one.
export async function waitForEmail(address: string, count = 1): Promise<Email> {
  await expect
    .poll(async () => (await emailsTo(address)).length, {
      message: `${count} email(s) to ${address} in Mailpit`,
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(count);
  return (await emailsTo(address)).at(-1)!;
}
