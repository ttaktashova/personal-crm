import { expect, test, type Locator, type Page } from "@playwright/test";

import { todayIsoDate } from "../src/lib/dates";

import { cardField } from "./contact-card";
import { addContact, addGroup, addUser, resetDatabase, type Birthday } from "./database";
import { clearInbox } from "./mailpit";
import { signIn } from "./sign-in";

// "Дата рождения" and «Скоро день рождения» of openspec/specs/birthdays/spec.md, with the
// window and card parts of contact-list and contact-card and «Чужой день рождения» of
// data-ownership, in a real browser against the app and a real database. The rules of the
// date and of the block have unit tests; here are the owner's paths.

// The app's "today": the server counts it in Moscow time.
const TODAY = todayIsoDate();

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

// The fields of the contact window, in order, by their visible names.
const WINDOW_FIELDS = [
  "Имя",
  "Откуда знакомы",
  "Группы",
  "Телефон",
  "Почта",
  "Дата рождения",
  "Как часто припоминать",
  "Заметки",
];

// The fields of the card, in order.
const CARD_FIELDS = [
  "Откуда знакомы",
  "Группы",
  "Телефон",
  "Почта",
  "Дата рождения",
  "Как часто припоминать",
  "Последняя месть",
  "Заметки",
];

const BORN_1990 = { day: 17, month: 11, year: 1990 };

function newContactWindow(page: Page) {
  return page.getByRole("dialog", { name: "Новый чертила" });
}

function editWindow(page: Page) {
  return page.getByRole("dialog", { name: "Редактировать контакт" });
}

// The names of the window's fields as the owner sees them: labels, and the legend of
// "Дата рождения", whose three parts are named for a screen reader only.
function windowFieldNames(dialog: Locator) {
  return dialog.locator("form").locator("label, legend");
}

function birthdayParts(dialog: Locator) {
  const field = dialog.getByRole("group", { name: "Дата рождения" });
  return {
    field,
    day: field.getByLabel("День", { exact: true }),
    month: field.getByLabel("Месяц", { exact: true }),
    year: field.getByLabel("Год", { exact: true }),
  };
}

// The first item of the list: it clears the month, and the grey hint comes back.
const NO_MONTH = "Не указан";

async function chooseMonth(page: Page, dialog: Locator, label: string) {
  const { month } = birthdayParts(dialog);
  await month.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  // Contains, not equals: the list shows an arrow after its text.
  await expect(month).toContainText(label === NO_MONTH ? "Месяц" : label);
}

async function fillBirthday(
  page: Page,
  dialog: Locator,
  { day, month, year }: { day: string; month: string; year: string },
) {
  const parts = birthdayParts(dialog);
  await parts.day.fill(day);
  await chooseMonth(page, dialog, month);
  await parts.year.fill(year);
}

// The list on the main page: a person's row links to the card. Not exact: a person just
// added is marked "Новый" inside the link.
function listLink(page: Page, name: string) {
  return page.locator('li[id^="contact-"]').getByRole("link", { name });
}

// Without a sign-in the app opens the sign-in page: every test signs in first.
const OWNER = "owner@example.com";
let owner: number;

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await clearInbox();
  owner = await addUser(OWNER);
  await signIn(page, OWNER);
});

test("the window «Новый чертила» has an empty «Дата рождения» after «Почта»", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить черта" }).click();
  const dialog = newContactWindow(page);

  await test.step("the fields in order, «Дата рождения» between «Почта» and the frequency", async () => {
    await expect(windowFieldNames(dialog)).toHaveText(WINDOW_FIELDS);
  });

  await test.step("all empty but the frequency, which is «Не задано»", async () => {
    for (const label of ["Имя", "Откуда знакомы", "Телефон", "Почта", "Заметки"]) {
      await expect(dialog.getByLabel(label, { exact: true })).toHaveValue("");
    }
    await expect(dialog.getByLabel("Группы", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Как часто припоминать")).toContainText("Не задано");
  });

  await test.step("three empty parts with the hints «День», «Месяц» and «Год»", async () => {
    const { day, month, year } = birthdayParts(dialog);
    await expect(day).toHaveValue("");
    await expect(day).toHaveAttribute("placeholder", "День");
    await expect(month).toContainText("Месяц");
    // The hint is grey, like the hints of the text fields.
    await expect(month).toHaveAttribute("data-placeholder");
    await expect(year).toHaveValue("");
    await expect(year).toHaveAttribute("placeholder", "Год");
  });

  await test.step("the buttons «Добавить черта» and «Отмена»", async () => {
    await expect(dialog.getByRole("button", { name: "Добавить черта" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Отмена" })).toBeVisible();
  });
});

test("a new contact without a birthday and one without a year", async ({ page }) => {
  await page.goto("/");

  await test.step("the field left as it was: «не указано» in the card", async () => {
    await page.getByRole("button", { name: "Добавить черта" }).click();
    const dialog = newContactWindow(page);
    await dialog.getByLabel("Имя").fill("Анна Смирнова");
    await dialog.getByRole("button", { name: "Добавить черта" }).click();
    await expect(dialog).toBeHidden();

    await listLink(page, "Анна Смирнова").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Анна Смирнова");
    await expect(cardField(page, "Дата рождения")).toHaveText("не указано");
  });

  await test.step("17, «ноября» and no year: «17 ноября» in the card", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Добавить черта" }).click();
    const dialog = newContactWindow(page);
    await dialog.getByLabel("Имя").fill("Борис Гусев");
    await fillBirthday(page, dialog, { day: "17", month: "ноября", year: "" });
    await dialog.getByRole("button", { name: "Добавить черта" }).click();
    await expect(dialog).toBeHidden();

    await listLink(page, "Борис Гусев").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Борис Гусев");
    await expect(cardField(page, "Дата рождения")).toHaveText("17 ноября");
  });
});

test("a wrong date keeps the window open with one error under the field", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить черта" }).click();
  const dialog = newContactWindow(page);
  await dialog.getByLabel("Имя").fill("Анна Смирнова");
  await fillBirthday(page, dialog, { day: "31", month: "апреля", year: "" });
  await dialog.getByRole("button", { name: "Добавить черта" }).click();

  const { field, day } = birthdayParts(dialog);
  await expect(field.getByRole("alert")).toHaveText("Такой даты нет");
  await expect(dialog).toBeVisible();
  await expect(day).toBeFocused();

  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByText("Здесь пока никого нет")).toBeVisible();
});

test("the card shows the birthday between «Почта» and the frequency", async ({ page }) => {
  const anna = await addContact(owner, { name: "Анна Смирнова", birthday: BORN_1990 });
  const boris = await addContact(owner, { name: "Борис Гусев" });

  await test.step("with a year: «17 ноября 1990», the fields in order", async () => {
    await page.goto(`/contacts/${anna}`);
    await expect(page.locator("dl > div > dt")).toHaveText(CARD_FIELDS);
    await expect(cardField(page, "Дата рождения")).toHaveText("17 ноября 1990");
  });

  await test.step("no birthday: «не указано»", async () => {
    await page.goto(`/contacts/${boris}`);
    await expect(cardField(page, "Дата рождения")).toHaveText("не указано");
  });
});

test("the edit window shows, changes and clears the birthday", async ({ page }) => {
  const anna = await addContact(owner, {
    name: "Анна Смирнова",
    birthday: BORN_1990,
    createdAt: new Date("2026-01-15T09:00:00Z"),
  });

  await test.step("eight fields in order, the date «17», «ноября», «1990»", async () => {
    await page.goto(`/contacts/${anna}`);
    await page.getByRole("button", { name: "Редактировать" }).click();
    const dialog = editWindow(page);
    await expect(windowFieldNames(dialog)).toHaveText(WINDOW_FIELDS);
    await expect(dialog.getByLabel("Имя")).toHaveValue("Анна Смирнова");
    const { day, month, year } = birthdayParts(dialog);
    await expect(day).toHaveValue("17");
    await expect(month).toContainText("ноября");
    await expect(year).toHaveValue("1990");
  });

  await test.step("3 «марта» without a year: «3 марта», changed today", async () => {
    const dialog = editWindow(page);
    await fillBirthday(page, dialog, { day: "3", month: "марта", year: "" });
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();

    await expect(cardField(page, "Дата рождения")).toHaveText("3 марта");
    await expect(page.getByText(`· изменён ${longDate(TODAY)}`)).toBeVisible();
  });

  await test.step("the day cleared, «Не указан», the year cleared: «не указано»", async () => {
    await page.getByRole("button", { name: "Редактировать" }).click();
    const dialog = editWindow(page);
    const { day, month, year } = birthdayParts(dialog);
    await expect(day).toHaveValue("3");
    await day.fill("");
    await chooseMonth(page, dialog, NO_MONTH);
    await year.fill("");
    await expect(month).toHaveAttribute("data-placeholder");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();

    await expect(cardField(page, "Дата рождения")).toHaveText("не указано");
  });
});

// «Скоро день рождения» on the main page. Dates count from the app's today, the way
// the server does, so a test means the same on any day it runs.

// "YYYY-MM-DD" a number of days after today (before it, if negative).
function daysAhead(days: number): string {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// A birthday without a year on the day that comes `days` after today.
function bornIn(days: number): Birthday {
  const [, month, day] = daysAhead(days).split("-").map(Number);
  return { day, month, year: null };
}

// "2026-11-17" → "17 ноября"
function dayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function birthdayBlock(page: Page) {
  return page.getByRole("region", { name: "Скоро день рождения" });
}

// One row per person in the block; the "+ещё …" row has no link.
function birthdayRows(page: Page) {
  return birthdayBlock(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link") });
}

function showMoreBirthdays(page: Page) {
  return birthdayBlock(page).getByRole("button", { name: /^\+ещё/ });
}

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора мстить" });
}

function nobodyDue(page: Page) {
  return page.getByRole("heading", { name: "Пока некому мстить" });
}

function groupRow(page: Page) {
  return page.getByRole("navigation", { name: "Группы" });
}

// The block shows exactly these people, in this order.
async function expectBirthdays(page: Page, names: string[]) {
  const rows = birthdayRows(page);
  await expect(rows).toHaveCount(names.length);
  await expect(rows).toContainText(names);
}

// No block. The block streams in together with «Пора мстить» or the cat card, so once
// one of them is on the page, the block would be too.
async function expectNoBirthdays(page: Page) {
  await expect(dueBlock(page).or(nobodyDue(page))).toBeVisible();
  await expect(birthdayBlock(page)).toBeHidden();
}

// boundingBox() does not wait: the parts of the page stream in one after another.
async function expectAbove(upper: Locator, lower: Locator) {
  await expect(upper).toBeVisible();
  await expect(lower).toBeVisible();
  const upperBox = await upper.boundingBox();
  const lowerBox = await lower.boundingBox();
  expect(upperBox!.y + upperBox!.height).toBeLessThanOrEqual(lowerBox!.y);
}

test("the block shows who has a birthday soon, above «Пора мстить»", async ({ page }) => {
  const vera = await addContact(owner, { name: "Вера Лунина", birthday: bornIn(3) });
  await addContact(owner, { name: "Борис Гусев", birthday: bornIn(1) });
  // Due for revenge: a frequency and no revenge yet.
  await addContact(owner, { name: "Анна Смирнова", contactFrequency: "week" });

  await test.step("under the group row and above «Пора мстить», the nearest first", async () => {
    await page.goto("/");
    await expectBirthdays(page, ["Борис Гусев", "Вера Лунина"]);
    await expectAbove(groupRow(page), birthdayBlock(page));
    await expectAbove(birthdayBlock(page), dueBlock(page));
  });

  await test.step("every row says when, without a year", async () => {
    await expect(birthdayRows(page).nth(0)).toContainText(`завтра · ${dayAndMonth(daysAhead(1))}`);
    await expect(birthdayRows(page).nth(1)).toContainText(
      `через 3 дня · ${dayAndMonth(daysAhead(3))}`,
    );
    // No buttons in the rows: only the "+ещё …" row could have one.
    await expect(birthdayBlock(page).getByRole("button")).toHaveCount(0);
  });

  await test.step("the name opens the card", async () => {
    await birthdayBlock(page).getByRole("link", { name: "Вера Лунина" }).click();
    await expect(page).toHaveURL(`/contacts/${vera}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вера Лунина");
  });
});

test("the block stands above «Пока некому мстить»", async ({ page }) => {
  await addContact(owner, { name: "Борис Гусев", birthday: bornIn(0) });

  await page.goto("/");
  await expectBirthdays(page, ["Борис Гусев"]);
  await expect(birthdayRows(page)).toContainText(`сегодня · ${dayAndMonth(TODAY)}`);
  await expectAbove(birthdayBlock(page), nobodyDue(page));
});

test("no birthdays soon, no block", async ({ page }) => {
  await test.step("no contacts at all: the cat and the empty list, no block", async () => {
    await page.goto("/");
    await expectNoBirthdays(page);
    await expect(page.getByText("Здесь пока никого нет")).toBeVisible();
  });

  await test.step("birthdays in 8 days and yesterday: «Пора мстить» right under the groups", async () => {
    await addContact(owner, { name: "Анна Смирнова", birthday: bornIn(8) });
    await addContact(owner, { name: "Борис Гусев", birthday: bornIn(-1) });
    await addContact(owner, { name: "Вера Лунина", contactFrequency: "week" });
    await page.reload();
    await expectNoBirthdays(page);
    await expect(page.getByRole("heading", { name: "Скоро день рождения" })).toBeHidden();
    await expectAbove(groupRow(page), dueBlock(page));
  });
});

test("the block goes when the only birthday in it is cleared", async ({ page }) => {
  await addContact(owner, { name: "Анна Смирнова", birthday: bornIn(2) });

  await page.goto("/");
  await expectBirthdays(page, ["Анна Смирнова"]);
  await birthdayBlock(page).getByRole("link", { name: "Анна Смирнова" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Анна Смирнова");

  await page.getByRole("button", { name: "Редактировать" }).click();
  const dialog = editWindow(page);
  const { day, year } = birthdayParts(dialog);
  await day.fill("");
  await chooseMonth(page, dialog, NO_MONTH);
  await year.fill("");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(cardField(page, "Дата рождения")).toHaveText("не указано");

  await page.goto("/");
  await expectNoBirthdays(page);
});

// Twelve people with a birthday soon, in the order of the block: the nearest first,
// on one day by the alphabet.
const SOON: { name: string; inDays: number }[] = [
  { name: "Алла Ершова", inDays: 0 },
  { name: "Борис Гусев", inDays: 0 },
  { name: "Вера Лунина", inDays: 1 },
  { name: "Глеб Орлов", inDays: 2 },
  { name: "Дина Котова", inDays: 2 },
  { name: "Егор Мухин", inDays: 3 },
  { name: "Жанна Белова", inDays: 4 },
  { name: "Зоя Ким", inDays: 5 },
  { name: "Иван Седов", inDays: 6 },
  { name: "Кира Лосева", inDays: 7 },
  { name: "Лев Тихонов", inDays: 7 },
  { name: "Яков Петров", inDays: 7 },
];
const SOON_NAMES = SOON.map((person) => person.name);

test("the block shows five, the rest on demand, and only the chosen group", async ({ page }) => {
  // Saved in reverse, so the order of the ids is not the order of the block.
  const ids = new Map<string, number>();
  for (const person of SOON.toReversed()) {
    ids.set(
      person.name,
      await addContact(owner, { name: person.name, birthday: bornIn(person.inDays) }),
    );
  }
  const idsOf = (names: string[]) => names.map((name) => ids.get(name)!);
  // Eight, six and five of the twelve, and a group where nobody has a birthday soon.
  await addGroup(owner, "Друзья", idsOf(SOON_NAMES.slice(0, 8)));
  const neighbours = ["Алла Ершова", "Вера Лунина", "Зоя Ким", "Иван Седов", "Кира Лосева"];
  await addGroup(owner, "Соседи", idsOf([...neighbours, "Яков Петров"]));
  await addGroup(owner, "Семья", idsOf(SOON_NAMES.slice(3, 8)));
  await addGroup(owner, "Теннис", [
    await addContact(owner, { name: "Мария Штерн", birthday: bornIn(8) }),
  ]);
  const groups = groupRow(page);

  await test.step("the first five, then «+ещё 7 людишек»", async () => {
    await page.goto("/");
    await expectBirthdays(page, SOON_NAMES.slice(0, 5));
    await expect(showMoreBirthdays(page)).toHaveText("+ещё 7 людишек");
  });

  await test.step("«+ещё 7 людишек» opens all twelve, goes away, the focus on the sixth", async () => {
    await showMoreBirthdays(page).click();
    await expectBirthdays(page, SOON_NAMES);
    await expect(showMoreBirthdays(page)).toBeHidden();
    await expect(birthdayRows(page).nth(5).getByRole("link")).toBeFocused();
    await expect(birthdayRows(page).nth(11)).toContainText(
      `через 7 дней · ${dayAndMonth(daysAhead(7))}`,
    );
  });

  // Each group below is chosen with the block opened in full: a new group starts
  // with the first five again.

  await test.step("«Друзья»: five of eight, «+ещё 3 людишки»", async () => {
    await groups.getByRole("link", { name: "Друзья" }).click();
    await expectBirthdays(page, SOON_NAMES.slice(0, 5));
    await expect(showMoreBirthdays(page)).toHaveText("+ещё 3 людишки");
  });

  await test.step("«Соседи»: five of six, «+ещё 1 людишка»", async () => {
    await showMoreBirthdays(page).click();
    await expectBirthdays(page, SOON_NAMES.slice(0, 8));

    await groups.getByRole("link", { name: "Соседи" }).click();
    await expectBirthdays(page, neighbours);
    await expect(showMoreBirthdays(page)).toHaveText("+ещё 1 людишка");
  });

  await test.step("«Все» after a group: five of twelve again", async () => {
    await showMoreBirthdays(page).click();
    await expectBirthdays(page, [...neighbours, "Яков Петров"]);

    await groups.getByRole("link", { name: "Все" }).click();
    await expectBirthdays(page, SOON_NAMES.slice(0, 5));
    await expect(showMoreBirthdays(page)).toHaveText("+ещё 7 людишек");
  });

  await test.step("«Семья»: all five, no «+ещё»", async () => {
    await groups.getByRole("link", { name: "Семья" }).click();
    await expectBirthdays(page, SOON_NAMES.slice(3, 8));
    await expect(showMoreBirthdays(page)).toBeHidden();
  });

  await test.step("«Теннис»: no block", async () => {
    await groups.getByRole("link", { name: "Теннис" }).click();
    // The list of «Теннис» is on the page: one person, and nobody of the others.
    await expect(page.locator('li[id^="contact-"]')).toHaveText([/Мария Штерн/]);
    await expectNoBirthdays(page);
  });

  await test.step("«Все»: everybody again", async () => {
    await groups.getByRole("link", { name: "Все" }).click();
    await expectBirthdays(page, SOON_NAMES.slice(0, 5));
    await expect(showMoreBirthdays(page)).toHaveText("+ещё 7 людишек");
  });
});

// "Чужой день рождения" of the data-ownership spec.
test("another user does not see the owner's birthdays", async ({ page, browser }) => {
  await addContact(owner, { name: "Анна Смирнова", birthday: bornIn(1) });
  await page.goto("/");
  await expectBirthdays(page, ["Анна Смирнова"]);

  const other = await browser.newContext();
  try {
    const boris = await other.newPage();
    await signIn(boris, "boris@example.com");
    await expect(boris.getByText("Здесь пока никого нет")).toBeVisible();
    await expectNoBirthdays(boris);
  } finally {
    await other.close();
  }
});
