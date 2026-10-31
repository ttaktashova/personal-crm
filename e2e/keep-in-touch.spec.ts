import { expect, test, type Locator, type Page } from "@playwright/test";

import { todayIsoDate } from "../src/lib/dates";

import { cardField } from "./contact-card";
import {
  addContact,
  addGroup,
  addRevenge,
  deleteContact,
  resetDatabase,
  type ContactFrequency,
} from "./database";

// "Пора мстить" of openspec/specs/keep-in-touch/spec.md, in a real browser against the app
// and a real database. The rules of the term and the order have unit tests; here are
// the owner's paths through the main page and the card.

// The app's "today": the server counts the terms in Moscow time.
const TODAY = todayIsoDate();

// "YYYY-MM-DD" a number of days before today.
function daysAgo(days: number): string {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// "2026-10-24" → "24.10.2026"
function shortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// "2026-10-04" → "4 октября 2026"
function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const NOT_FOUND = "Этот контакт не найден. Возможно, его удалили.";
const NOT_SAVED = "Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.";

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора мстить" });
}

// One row per person in the block; the "+ещё …" row has no link.
function dueRows(page: Page) {
  return dueBlock(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link") });
}

function showMore(page: Page) {
  return dueBlock(page).getByRole("button", { name: /^\+ещё/ });
}

function nobodyDue(page: Page) {
  return page.getByRole("heading", { name: "Пока некому мстить" });
}

// The block shows exactly these people, in this order.
async function expectDue(page: Page, names: string[]) {
  const rows = dueRows(page);
  await expect(rows).toHaveCount(names.length);
  await expect(rows).toContainText(names);
}

async function expectDueLabel(page: Page, name: string, label: string) {
  await expect(dueRows(page).filter({ hasText: name })).toContainText(label);
}

// The sad cat card instead of the block.
async function expectNobodyDue(page: Page) {
  await expect(nobodyDue(page)).toBeVisible();
  await expect(dueBlock(page)).toBeHidden();
  // The cat is only a picture: a screen reader reads the text alone.
  const cat = page
    .locator("section")
    .filter({ has: nobodyDue(page) })
    .locator("svg");
  await expect(cat).toBeVisible();
  await expect(cat).toHaveAttribute("aria-hidden", "true");
}

// boundingBox() does not wait: the list under the block streams in a moment later.
async function expectAbove(upper: Locator, lower: Locator) {
  await expect(upper).toBeVisible();
  await expect(lower).toBeVisible();
  const upperBox = await upper.boundingBox();
  const lowerBox = await lower.boundingBox();
  expect(upperBox!.y + upperBox!.height).toBeLessThanOrEqual(lowerBox!.y);
}

async function chooseFrequency(page: Page, dialog: Locator, label: string) {
  const field = dialog.getByLabel("Как часто припоминать");
  await field.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(field).toContainText(label);
}

test.beforeEach(async () => {
  await resetDatabase();
});

test("a person with a frequency is due at once, and «Отомстил» settles it", async ({ page }) => {
  const person = "Анна Смирнова";
  let cardUrl = "";

  await test.step("with no contacts at all there is nobody to take revenge on", async () => {
    await page.goto("/");
    await expectNobodyDue(page);
    const emptyList = page.getByText("Здесь пока никого нет");
    await expect(emptyList).toBeVisible();
    await expectAbove(nobodyDue(page), emptyList);
  });

  await test.step("a new person with «Раз в год»", async () => {
    await page.getByRole("button", { name: "Добавить черта" }).click();
    const dialog = page.getByRole("dialog", { name: "Новый чертила" });
    await dialog.getByLabel("Имя").fill(person);
    await chooseFrequency(page, dialog, "Раз в год");
    await dialog.getByRole("button", { name: "Добавить черта" }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("is due at once: there has been no revenge yet", async () => {
    await expectDue(page, [person]);
    await expectDueLabel(page, person, "Раз в год · ещё не мстили");
    await expectAbove(dueBlock(page), page.getByLabel("Поиск по имени"));
  });

  await test.step("on a computer the buttons are words", async () => {
    for (const label of ["Отомстил", "Простить"]) {
      const button = dueBlock(page).getByRole("button", { name: `${label}: ${person}` });
      await expect(button.getByText(label, { exact: true })).toBeVisible();
      await expect(button.locator("svg")).toBeHidden();
    }
  });

  await test.step("the name opens the card, with «Раз в год» in it", async () => {
    await dueBlock(page).getByRole("link", { name: person }).click();
    await expect(page).toHaveURL(/\/contacts\/\d+$/);
    cardUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(person);
    await expect(cardField(page, "Как часто припоминать")).toHaveText("Раз в год");
    await expect(cardField(page, "Последняя месть")).toContainText("Пока не мстили");
  });

  await test.step("«Отомстил» for the last one: the cat at once", async () => {
    await page.goto("/");
    await dueBlock(page)
      .getByRole("button", { name: `Отомстил: ${person}` })
      .click();
    await expectNobodyDue(page);
  });

  await test.step("the card has today's revenge", async () => {
    await page.goto(cardUrl);
    await expect(cardField(page, "Последняя месть")).toContainText(`${shortDate(TODAY)} Отомстил`);
  });
});

test("«Простить» and «Не задано» take a person out of the block", async ({ page }) => {
  const boris = await addContact({
    name: "Борис Гусев",
    contactFrequency: "month",
    createdAt: new Date(`${daysAgo(200)}T09:00:00Z`),
  });
  await addRevenge(boris, daysAgo(60));
  const vera = await addContact({ name: "Вера Лунина", contactFrequency: "month" });
  await addRevenge(vera, daysAgo(60));

  await test.step("«Простить» takes Борис out at once", async () => {
    await page.goto("/");
    await expectDue(page, ["Борис Гусев", "Вера Лунина"]);
    await dueBlock(page).getByRole("button", { name: "Простить: Борис Гусев" }).click();
    await expectDue(page, ["Вера Лунина"]);
  });

  await test.step("his card: «Не задано», changed today, the revenge kept", async () => {
    await page.goto(`/contacts/${boris}`);
    await expect(cardField(page, "Как часто припоминать")).toHaveText("Не задано");
    await expect(page.getByText(`· изменён ${longDate(TODAY)}`)).toBeVisible();
    await expect(cardField(page, "Последняя месть")).toContainText(
      `${shortDate(daysAgo(60))} Отомстил`,
    );
  });

  await test.step("«Не задано» in the edit window takes Вера out too", async () => {
    await page.goto(`/contacts/${vera}`);
    await page.getByRole("button", { name: "Редактировать" }).click();
    const dialog = page.getByRole("dialog", { name: "Редактировать контакт" });
    await expect(dialog.getByLabel("Как часто припоминать")).toContainText("Раз в месяц");
    await chooseFrequency(page, dialog, "Не задано");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(cardField(page, "Как часто припоминать")).toHaveText("Не задано");

    await page.goto("/");
    await expectNobodyDue(page);
  });
});

// Twelve people due, in the order of the block: no revenge yet by the alphabet,
// then the earliest term first. A week after the last revenge the term comes.
const DUE: { name: string; frequency: ContactFrequency; lastRevengeDaysAgo: number | null }[] = [
  { name: "Алла Ершова", frequency: "week", lastRevengeDaysAgo: null },
  { name: "Яков Петров", frequency: "month", lastRevengeDaysAgo: null },
  { name: "Борис Гусев", frequency: "week", lastRevengeDaysAgo: 40 },
  { name: "Вера Лунина", frequency: "week", lastRevengeDaysAgo: 30 },
  { name: "Глеб Орлов", frequency: "week", lastRevengeDaysAgo: 20 },
  { name: "Дина Котова", frequency: "week", lastRevengeDaysAgo: 15 },
  { name: "Егор Мухин", frequency: "week", lastRevengeDaysAgo: 12 },
  { name: "Жанна Белова", frequency: "week", lastRevengeDaysAgo: 11 },
  { name: "Зоя Ким", frequency: "week", lastRevengeDaysAgo: 10 },
  { name: "Иван Седов", frequency: "week", lastRevengeDaysAgo: 9 },
  { name: "Кира Лосева", frequency: "week", lastRevengeDaysAgo: 8 },
  { name: "Лев Тихонов", frequency: "week", lastRevengeDaysAgo: 7 },
];
const DUE_NAMES = DUE.map((person) => person.name);

test("the block shows five, the rest on demand, and only the chosen group", async ({ page }) => {
  // Saved in reverse, so the order of the ids is not the order of the block.
  const ids = new Map<string, number>();
  for (const person of DUE.toReversed()) {
    const id = await addContact({ name: person.name, contactFrequency: person.frequency });
    if (person.lastRevengeDaysAgo !== null)
      await addRevenge(id, daysAgo(person.lastRevengeDaysAgo));
    ids.set(person.name, id);
  }
  const idsOf = (names: string[]) => names.map((name) => ids.get(name)!);
  // Eight, six and five of the twelve, and a group where nobody is due.
  await addGroup("Друзья", idsOf(DUE_NAMES.slice(0, 8)));
  const neighbours = ["Алла Ершова", "Борис Гусев", "Зоя Ким", "Иван Седов", "Кира Лосева"];
  await addGroup("Соседи", idsOf([...neighbours, "Лев Тихонов"]));
  await addGroup("Семья", idsOf(DUE_NAMES.slice(3, 8)));
  await addGroup("Теннис", [await addContact({ name: "Мария Штерн" })]);
  const groups = page.getByRole("navigation", { name: "Группы" });

  await test.step("the first five above the search, then «+ещё 7 людишек»", async () => {
    await page.goto("/");
    await expectDue(page, DUE_NAMES.slice(0, 5));
    await expect(showMore(page)).toHaveText("+ещё 7 людишек");
    await expectAbove(dueBlock(page), page.getByLabel("Поиск по имени"));
  });

  await test.step("«+ещё 7 людишек» opens all twelve and goes away", async () => {
    await showMore(page).click();
    await expectDue(page, DUE_NAMES);
    await expect(showMore(page)).toBeHidden();
  });

  await test.step("every row says how often and since when", async () => {
    await expectDueLabel(page, "Алла Ершова", "Раз в неделю · ещё не мстили");
    await expectDueLabel(page, "Яков Петров", "Раз в месяц · ещё не мстили");
    await expectDueLabel(page, "Борис Гусев", `Раз в неделю · пора с ${shortDate(daysAgo(33))}`);
    await expectDueLabel(page, "Кира Лосева", "Раз в неделю · пора со вчера");
    await expectDueLabel(page, "Лев Тихонов", "Раз в неделю · пора сегодня");
  });

  // Each group below is chosen with the block opened in full: a new group starts
  // with the first five again.

  await test.step("«Друзья»: five of eight, «+ещё 3 людишки»", async () => {
    await groups.getByRole("link", { name: "Друзья" }).click();
    await expectDue(page, DUE_NAMES.slice(0, 5));
    await expect(showMore(page)).toHaveText("+ещё 3 людишки");
  });

  await test.step("«Соседи»: five of six, «+ещё 1 людишка»", async () => {
    await showMore(page).click();
    await expectDue(page, DUE_NAMES.slice(0, 8));

    await groups.getByRole("link", { name: "Соседи" }).click();
    await expectDue(page, neighbours);
    await expect(showMore(page)).toHaveText("+ещё 1 людишка");
  });

  await test.step("«Все» after a group: five of twelve again", async () => {
    await showMore(page).click();
    await expectDue(page, [...neighbours, "Лев Тихонов"]);

    await groups.getByRole("link", { name: "Все" }).click();
    await expectDue(page, DUE_NAMES.slice(0, 5));
    await expect(showMore(page)).toHaveText("+ещё 7 людишек");
  });

  await test.step("«Семья»: all five, no «+ещё»", async () => {
    await groups.getByRole("link", { name: "Семья" }).click();
    await expectDue(page, DUE_NAMES.slice(3, 8));
    await expect(showMore(page)).toBeHidden();
  });

  await test.step("«Теннис»: nobody to take revenge on", async () => {
    await groups.getByRole("link", { name: "Теннис" }).click();
    await expectNobodyDue(page);
  });

  await test.step("«Все»: everybody again", async () => {
    await groups.getByRole("link", { name: "Все" }).click();
    await expectDue(page, DUE_NAMES.slice(0, 5));
    await expect(showMore(page)).toHaveText("+ещё 7 людишек");
  });
});

test("icons on a phone; a deleted contact or no network shows a message", async ({
  page,
  context,
}) => {
  const anna = await addContact({ name: "Анна Смирнова", contactFrequency: "week" });
  const boris = await addContact({ name: "Борис Гусев", contactFrequency: "week" });
  await addContact({ name: "Вера Лунина", contactFrequency: "week" });

  await test.step("on a phone: two 44×44 icons right of the name, named for a screen reader", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const row = dueRows(page).filter({ hasText: "Анна Смирнова" });
    const nameBox = await row.getByRole("link").boundingBox();

    for (const [label, icon] of [
      ["Отомстил", "lucide-check"],
      ["Простить", "lucide-bell-off"],
    ]) {
      const button = row.getByRole("button", { name: `${label}: Анна Смирнова` });
      await expect(button.locator(`svg.${icon}`)).toBeVisible();
      await expect(button.getByText(label, { exact: true })).toBeHidden();
      const box = await button.boundingBox();
      expect(box).toMatchObject({ width: 44, height: 44 });
      expect(box!.x).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width);
    }
  });

  await test.step("hovering an icon tells what it does", async () => {
    await dueBlock(page).getByRole("button", { name: "Простить: Анна Смирнова" }).hover();
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText("Простить");
  });

  await test.step("a contact deleted in another tab: a message, and the row goes", async () => {
    await deleteContact(anna);
    await dueBlock(page).getByRole("button", { name: "Отомстил: Анна Смирнова" }).click();
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await expectDue(page, ["Борис Гусев", "Вера Лунина"]);

    // A fresh page, so the message above is gone.
    await page.reload();
    await deleteContact(boris);
    await dueBlock(page).getByRole("button", { name: "Простить: Борис Гусев" }).click();
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await expectDue(page, ["Вера Лунина"]);
  });

  await test.step("no network: a message, and the person stays", async () => {
    await page.reload();
    await context.setOffline(true);
    await dueBlock(page).getByRole("button", { name: "Отомстил: Вера Лунина" }).click();
    await expect(page.getByText(NOT_SAVED)).toBeVisible();
    await expectDue(page, ["Вера Лунина"]);

    // Nothing reached the server.
    await context.setOffline(false);
    await page.reload();
    await expectDue(page, ["Вера Лунина"]);
  });
});
