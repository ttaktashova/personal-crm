import { expect, type Page } from "@playwright/test";

import { emailsTo, waitForEmail } from "./mailpit";

// Sign-in the way a person does it: the page /login, the email in Mailpit, the link from it.

// "Получить ссылку" for `typed`, as typed into the field. Returns the email that came.
export async function requestLink(page: Page, typed: string) {
  const address = typed.trim().toLowerCase();
  const before = (await emailsTo(address)).length;

  await page.goto("/login");
  await page.getByLabel("Почта").fill(typed);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText(`Ссылка для входа отправлена на ${address}`)).toBeVisible();

  return waitForEmail(address, before + 1);
}

// Signs in on `page` (its browser context keeps the cookie) and waits for the main page.
export async function signIn(page: Page, email: string): Promise<void> {
  const { link } = await requestLink(page, email);
  await page.goto(link);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
}
