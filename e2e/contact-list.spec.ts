import { expect, test, type Locator, type Page } from "@playwright/test";

import { addContacts, resetDatabase } from "./database";

// Where the page switcher stands: "Место переключателя" of openspec/specs/contact-list/spec.md.

// 60 people, already in alphabetical order: two pages of 50.
const PEOPLE = Array.from(
  { length: 60 },
  (_, index) => `Контакт ${String(index + 1).padStart(2, "0")}`,
);

const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 800 };

// The switcher is there twice, for a computer and for a phone; one of them is hidden.
function switcher(page: Page) {
  return page
    .getByRole("navigation", { name: "Страницы списка" })
    .getByRole("list")
    .filter({ visible: true });
}

function counter(page: Page) {
  return page.getByText("60 контактов", { exact: true });
}

function sizePicker(page: Page) {
  return page.getByRole("group", { name: "Сколько показывать на странице" });
}

function listRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

type Box = { x: number; y: number; width: number; height: number };

// boundingBox() does not wait: the list streams in a moment after the page.
async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

const right = (box: Box) => box.x + box.width;
const bottom = (box: Box) => box.y + box.height;
const middle = (box: Box) => box.y + box.height / 2;

test.beforeEach(async () => {
  await resetDatabase();
  await addContacts(PEOPLE);
});

test("on a computer the switcher stands in the row of the counter, next to «По»", async ({
  page,
}) => {
  await page.setViewportSize(COMPUTER);
  await page.goto("/");

  const counterBox = await boxOf(counter(page));
  const switcherBox = await boxOf(switcher(page));
  const sizesBox = await boxOf(sizePicker(page));

  // One row: the counter and «По» are level with the switcher.
  for (const box of [counterBox, sizesBox]) {
    expect(middle(box)).toBeGreaterThan(switcherBox.y);
    expect(middle(box)).toBeLessThan(bottom(switcherBox));
  }
  // The counter on the left; on the right the switcher, right before «По».
  expect(right(counterBox)).toBeLessThan(switcherBox.x);
  expect(right(switcherBox)).toBeLessThan(sizesBox.x);
  expect(sizesBox.x - right(switcherBox)).toBeLessThan(30);

  // Above the list, and only there; no "Страница … из …".
  expect(bottom(switcherBox)).toBeLessThanOrEqual((await boxOf(listRows(page).first())).y);
  await expect(page.getByRole("navigation", { name: "Страницы списка" })).toHaveCount(1);
  await expect(page.getByText(/Страница \d+ из \d+/)).toHaveCount(0);
});

test("on a phone the switcher has a row of its own under the counter", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");

  const counterBox = await boxOf(counter(page));
  const switcherBox = await boxOf(switcher(page));
  const sizesBox = await boxOf(sizePicker(page));

  // «60 контактов» and «По» share a row.
  expect(middle(sizesBox)).toBeGreaterThan(counterBox.y);
  expect(middle(sizesBox)).toBeLessThan(bottom(counterBox));
  // The switcher is under that row, above the list, within the screen.
  expect(switcherBox.y).toBeGreaterThanOrEqual(bottom(counterBox));
  expect(bottom(switcherBox)).toBeLessThanOrEqual((await boxOf(listRows(page).first())).y);
  expect(switcherBox.x).toBeGreaterThanOrEqual(0);
  expect(right(switcherBox)).toBeLessThanOrEqual(PHONE.width);
});

for (const [device, viewport] of [
  ["computer", COMPUTER],
  ["phone", PHONE],
] as const) {
  test(`${device}: at the end of a page the switcher is at the top of the screen`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(listRows(page)).toHaveCount(50);

    await listRows(page).last().scrollIntoViewIfNeeded();
    await expect(listRows(page).last()).toBeInViewport();
    await expect(listRows(page).first()).not.toBeInViewport();
    expect((await boxOf(switcher(page))).y).toBeLessThan(200);

    // The next page opens from its start, with the search row at the top.
    await switcher(page).getByLabel("Следующая страница").click();
    await expect(page).toHaveURL(/\/\?page=2$/);
    await expect(listRows(page).first()).toContainText(PEOPLE[50]);
    await expect(page.getByLabel("Поиск по имени")).toBeInViewport();
    await expect(listRows(page).first()).toBeInViewport();
  });
}
