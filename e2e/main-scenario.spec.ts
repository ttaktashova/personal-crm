import { expect, test, type Page } from "@playwright/test";

import { cardField } from "./contact-card";
import { addContacts, resetDatabase } from "./database";

// The main scenario of specs/01-продуктовая-идея.md, in a real browser against the app
// and a real database: open the list → add a person → find them by name → add a note →
// the card keeps it, and another browser sees the same contacts.

// 12 × 5 = 60 people, already in alphabetical order: more than one page of 50.
const SURNAMES = [
  "Абрамов",
  "Белов",
  "Волков",
  "Громов",
  "Дьяков",
  "Егоров",
  "Жуков",
  "Зайцев",
  "Ильин",
  "Комаров",
  "Лебедев",
  "Морозов",
];
const FIRST_NAMES = ["Антон", "Борис", "Виктор", "Глеб", "Денис"];
const PEOPLE = SURNAMES.flatMap((surname) => FIRST_NAMES.map((first) => `${surname} ${first}`));

// Comes after everybody above, so the new person lands on the second page.
const NEW_PERSON = "Носков Аркадий";
const FIRST_NOTE = "Занял 5000 до зарплаты и пропал";
const ADDED_NOTE = "Вернул 1000, остальное обещает «потом»";

// One row per person in the list.
function listRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

// The list shows exactly these people, in this order.
async function expectList(page: Page, names: string[]) {
  const rows = listRows(page);
  await expect(rows).toHaveCount(names.length);
  await expect(rows).toContainText(names);
}

// The switcher marks the open page and shows the last one. It is there twice,
// for a computer and for a phone; one of them is hidden.
async function expectPages(page: Page, current: number, last: number) {
  const switcher = page.getByRole("navigation", { name: "Страницы списка" });
  await expect(switcher.locator('[aria-current="page"]').filter({ visible: true })).toHaveText(
    String(current),
  );
  await expect(
    switcher.getByText(String(last), { exact: true }).filter({ visible: true }),
  ).toBeVisible();
}

test.beforeEach(async () => {
  await resetDatabase();
  // Saved in reverse, so the order of the ids is not the alphabet: the list has to sort by name.
  await addContacts(PEOPLE.toReversed());
});

test("main scenario: open the list, add a person, find them, add a note", async ({
  page,
  browser,
}) => {
  await test.step("the list opens on the first page, the rest are behind the switcher", async () => {
    await page.goto("/");
    await expect(page.getByText("60 контактов", { exact: true })).toBeVisible();
    await expectList(page, PEOPLE.slice(0, 50));
    await expectPages(page, 1, 2);

    // The switcher is there twice, for a computer and for a phone; one of them is hidden.
    await page
      .getByRole("navigation", { name: "Страницы списка" })
      .getByLabel("Следующая страница")
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/\?page=2$/);
    await expectList(page, PEOPLE.slice(50));
    await expectPages(page, 2, 2);
  });

  await test.step("25 or 100 people per page can be chosen instead of 50", async () => {
    const pageSizes = page.getByRole("group", { name: "Сколько показывать на странице" });

    await pageSizes.getByRole("link", { name: "100" }).click();
    await expectList(page, PEOPLE);
    await expect(page.getByRole("navigation", { name: "Страницы списка" })).toBeHidden();

    await pageSizes.getByRole("link", { name: "25" }).click();
    await expectList(page, PEOPLE.slice(0, 25));
    await expectPages(page, 1, 3);

    // Back to 50 for the rest of the scenario.
    await pageSizes.getByRole("link", { name: "50" }).click();
    await expectList(page, PEOPLE.slice(0, 50));
  });

  await test.step("a new person appears in the list", async () => {
    await page.getByRole("button", { name: "Добавить черта" }).click();
    const dialog = page.getByRole("dialog", { name: "Новый чертила" });
    await dialog.getByLabel("Имя").fill(NEW_PERSON);
    await dialog.getByLabel("Откуда знакомы").fill("Сосед по даче");
    await dialog.getByLabel("Заметки").fill(FIRST_NOTE);
    await dialog.getByRole("button", { name: "Добавить черта" }).click();
    await expect(dialog).toBeHidden();

    // The list opens on the page where the new person stands, marked "Новый".
    await expect(page.getByText("61 контакт", { exact: true })).toBeVisible();
    await expectList(page, [...PEOPLE.slice(50), NEW_PERSON]);
    await expect(listRows(page).filter({ hasText: NEW_PERSON })).toContainText("Новый");
  });

  await test.step("found by name, the note added in the card is saved", async () => {
    await page.getByLabel("Поиск по имени").fill("Носков");
    await expect(page.getByText("Найдено: 1 из 61")).toBeVisible();
    await expectList(page, [NEW_PERSON]);

    await listRows(page).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEW_PERSON);
    await expect(cardField(page, "Заметки")).toHaveText(FIRST_NOTE);
    // The field was left as it was in the window.
    await expect(cardField(page, "Как часто припоминать")).toHaveText("Не задано");

    await page.getByRole("button", { name: "Редактировать" }).click();
    const dialog = page.getByRole("dialog", { name: "Редактировать контакт" });
    const notes = dialog.getByLabel("Заметки");
    await expect(notes).toHaveValue(FIRST_NOTE);
    await notes.fill(`${FIRST_NOTE}\n${ADDED_NOTE}`);
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();

    await expect(cardField(page, "Заметки")).toHaveText(`${FIRST_NOTE}\n${ADDED_NOTE}`);
    // Not only on the screen: the card loaded again from the server has it too.
    await page.reload();
    await expect(cardField(page, "Заметки")).toHaveText(`${FIRST_NOTE}\n${ADDED_NOTE}`);
  });

  await test.step("another browser at the same address sees the same contacts", async () => {
    // A context of its own shares no cookies and no storage with the first one,
    // like another browser: whatever it shows comes from the server.
    const otherBrowser = await browser.newContext();
    try {
      const other = await otherBrowser.newPage();

      await other.goto(page.url());
      await expect(other.getByRole("heading", { level: 1 })).toHaveText(NEW_PERSON);
      await expect(cardField(other, "Заметки")).toHaveText(`${FIRST_NOTE}\n${ADDED_NOTE}`);

      await other.goto("/");
      await expect(other.getByText("61 контакт", { exact: true })).toBeVisible();
      await expectList(other, PEOPLE.slice(0, 50));
    } finally {
      await otherBrowser.close();
    }
  });
});
