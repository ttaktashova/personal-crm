import type { Page } from "@playwright/test";

// The value of a contact card field, found by its label.
export function cardField(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.locator("dt").getByText(label, { exact: true }) })
    .locator("dd");
}
