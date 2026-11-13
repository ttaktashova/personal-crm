import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  addContact,
  addContacts,
  addGroup,
  addUser,
  countUsers,
  expireSignInLinks,
  resetDatabase,
  sessionExpiries,
  setLastVisit,
} from "./database";
import { clearInbox, emailsTo, waitForEmail } from "./mailpit";
import { requestLink, signIn } from "./sign-in";

// Sign-in of openspec/changes/login/specs/sign-in/spec.md (specs/02-пользователи-вход.md),
// in a real browser against the app, a real database and the Mailpit catcher.

const ANNA = "anna@example.com";
const BORIS = "boris@example.com";

const SENT = (email: string) => `Ссылка для входа отправлена на ${email}`;
const CHECK_ADDRESS = "Проверьте адрес почты";
const TOO_OFTEN = "Слишком часто, попробуйте через несколько минут";
const EXPIRED = "Ссылка устарела, запросите новую";

const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 800 };

function emailField(page: Page) {
  return page.getByLabel("Почта");
}

function getLinkButton(page: Page) {
  return page.getByRole("button", { name: "Получить ссылку" });
}

function signOutButton(page: Page) {
  return page.getByRole("button", { name: "Выйти" });
}

function header(page: Page) {
  return page.getByRole("banner");
}

function listRows(page: Page) {
  return page.locator('li[id^="contact-"]');
}

// The sign-in page: the title, the field and the button, nothing of the app.
async function expectSignInPage(page: Page) {
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  await expect(emailField(page)).toBeVisible();
  await expect(getLinkButton(page)).toBeVisible();
  await expect(page).toHaveTitle("Вход · Черный список");
}

async function expectExpiredPage(page: Page) {
  await expect(page).toHaveURL(/\/login\/expired/);
  await expect(page.getByText(EXPIRED)).toBeVisible();
  await expect(page).toHaveTitle("Ссылка устарела · Черный список");
}

// Types `typed` and presses «Получить ссылку».
async function submitEmail(page: Page, typed: string) {
  await page.goto("/login");
  await emailField(page).fill(typed);
  await getLinkButton(page).click();
}

// A second device: a browser context of its own, with no cookies of the first one.
async function withOtherDevice(browser: Browser, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test.beforeEach(async () => {
  await resetDatabase();
  await clearInbox();
});

test("main scenario: sign in by the link from the email, then sign out", async ({ page }) => {
  await addContacts(await addUser(ANNA), ["Борис Гусев", "Вера Лунина"]);

  await test.step("1. without a sign-in the app opens the sign-in page", async () => {
    await page.goto("/");
    await expectSignInPage(page);
  });

  await test.step("2. the address: «Ссылка для входа отправлена на …», the email comes", async () => {
    await emailField(page).fill(ANNA);
    await getLinkButton(page).click();
    await expect(page.getByText(SENT(ANNA))).toBeVisible();
    await expect(emailField(page)).toBeHidden();
    expect((await waitForEmail(ANNA)).subject).toBe("Вход в Черный список");
  });

  await test.step("3. the link from the email: inside, with the contacts", async () => {
    await page.goto((await waitForEmail(ANNA)).link);
    await expect(page).toHaveURL("/");
    await expect(listRows(page)).toHaveCount(2);
    await expect(header(page).getByText(ANNA)).toBeVisible();
  });

  await test.step("4. «Выйти»: the sign-in page again", async () => {
    await signOutButton(page).click();
    await expectSignInPage(page);
  });
});

test.describe("without a sign-in", () => {
  test("the main page opens the sign-in page, without contacts", async ({ page }) => {
    await addContacts(await addUser(ANNA), ["Борис Гусев"]);

    await page.goto("/");

    await expectSignInPage(page);
    await expect(page.getByText("Борис Гусев")).toHaveCount(0);
  });

  test("a card opens the sign-in page, without the contact", async ({ page }) => {
    const id = await addContact(await addUser(ANNA), { name: "Борис Гусев" });

    await page.goto(`/contacts/${id}`);

    await expectSignInPage(page);
    await expect(page.getByText("Борис Гусев")).toHaveCount(0);
  });

  test("/health answers 200 for the deploy", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("the header has the logo and the name only", async ({ page }) => {
    await page.goto("/login");

    await expect(header(page).getByText("черный список")).toBeVisible();
    await expect(header(page).getByText("@")).toHaveCount(0);
    await expect(signOutButton(page)).toHaveCount(0);
    await expect(page.getByText("личный блокнотик")).toHaveCount(0);
  });
});

test("a signed-in user who opens /login gets the main page", async ({ page }) => {
  await signIn(page, ANNA);

  await page.goto("/login");

  await expect(page).toHaveURL("/");
  await expect(signOutButton(page)).toBeVisible();
});

test.describe("asking for a link", () => {
  test("«Получить ссылку»: the message instead of the form, the email to the address", async ({
    page,
  }) => {
    await submitEmail(page, ANNA);

    await expect(page.getByText(SENT(ANNA))).toBeVisible();
    expect((await waitForEmail(ANNA)).to).toEqual([ANNA]);
  });

  test("Enter sends it the same way", async ({ page }) => {
    await page.goto("/login");
    await emailField(page).fill(ANNA);
    await emailField(page).press("Enter");

    await expect(page.getByText(SENT(ANNA))).toBeVisible();
    await waitForEmail(ANNA);
  });

  test("a known and a new address get the same answer and the same email", async ({ page }) => {
    await addUser(ANNA);

    await submitEmail(page, ANNA);
    await expect(page.getByText(SENT(ANNA))).toBeVisible();
    await submitEmail(page, BORIS);
    await expect(page.getByText(SENT(BORIS))).toBeVisible();

    const known = await waitForEmail(ANNA);
    const fresh = await waitForEmail(BORIS);
    expect(fresh.from).toEqual(known.from);
    expect(fresh.subject).toBe(known.subject);
    expect(fresh.text.replace(fresh.link, "<link>")).toBe(known.text.replace(known.link, "<link>"));
  });

  test("spaces and capitals: the email goes to anna@example.com", async ({ page }) => {
    await submitEmail(page, "  Anna@Example.COM  ");

    await expect(page.getByText(SENT(ANNA))).toBeVisible();
    expect((await waitForEmail(ANNA)).to).toEqual([ANNA]);
  });

  test("the email: from «Черный список», «Вход в Черный список», the button and the lines", async ({
    page,
  }) => {
    await submitEmail(page, ANNA);

    const email = await waitForEmail(ANNA);
    expect(email.from).toEqual({
      Name: "Черный список",
      Address: "noreply@mail.crm.testblacklist.ru",
    });
    expect(email.subject).toBe("Вход в Черный список");
    expect(email.html).toContain(">Войти</a>");
    expect(email.text).toContain("Ссылка работает 15 минут");
    expect(email.text).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
    expect(email.link).toMatch(/^http:\/\/127\.0\.0\.1:3100\/api\/auth\/magic-link\/verify\?/);
  });

  test("a made-up address gets its email in Mailpit and signs in", async ({ page }) => {
    await signIn(page, "friend@example.com");

    await expect(header(page).getByText("friend@example.com")).toBeVisible();
  });
});

test.describe("a wrong address", () => {
  test("«anna@»: the message under the field, the text stays, no email", async ({ page }) => {
    await submitEmail(page, "anna@");

    await expect(page.getByText(CHECK_ADDRESS)).toBeVisible();
    await expect(emailField(page)).toHaveValue("anna@");
    expect(await emailsTo("anna@")).toHaveLength(0);
  });

  test("an empty field and a field of spaces", async ({ page }) => {
    await page.goto("/login");
    await getLinkButton(page).click();
    await expect(page.getByText(CHECK_ADDRESS)).toBeVisible();

    await emailField(page).fill("   ");
    await getLinkButton(page).click();
    await expect(page.getByText(CHECK_ADDRESS)).toBeVisible();
    await expect(emailField(page)).toBeVisible();
  });

  test("an address of 255 characters", async ({ page }) => {
    const tooLong = "a".repeat(255 - "@example.com".length) + "@example.com";

    await submitEmail(page, tooLong);

    await expect(page.getByText(CHECK_ADDRESS)).toBeVisible();
    expect(await emailsTo(tooLong)).toHaveLength(0);
  });

  test("a request that skips the form gets 404 and no email", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/magic-link", {
      data: { email: "not-an-email" },
    });
    expect(response.status()).toBe(404);

    const valid = await request.post("/api/auth/sign-in/magic-link", { data: { email: ANNA } });
    expect(valid.status()).toBe(404);
    expect(await emailsTo(ANNA)).toHaveLength(0);
  });
});

test.describe("the link", () => {
  test("a new address signs in at once: no registration, no name", async ({ page }) => {
    expect(await countUsers(ANNA)).toBe(0);

    await signIn(page, ANNA);

    await expect(page.getByRole("heading", { level: 1, name: "Косячники" })).toBeVisible();
    await expect(page.getByLabel(/имя/i)).toHaveCount(0);
    expect(await countUsers(ANNA)).toBe(1);
  });

  test("a fresh link opens the main page with the address in the header", async ({ page }) => {
    await addContacts(await addUser(ANNA), ["Борис Гусев"]);

    await signIn(page, ANNA);

    await expect(listRows(page)).toHaveCount(1);
    await expect(header(page).getByText(ANNA)).toBeVisible();
  });

  test("a card opened before the sign-in: the link opens the main page", async ({ page }) => {
    const id = await addContact(await addUser(ANNA), { name: "Борис Гусев" });
    await page.goto(`/contacts/${id}`);
    await expectSignInPage(page);

    await emailField(page).fill(ANNA);
    await getLinkButton(page).click();
    await page.goto((await waitForEmail(ANNA)).link);

    await expect(page).toHaveURL("/");
  });

  test("works once: opened again after «Выйти», it shows «Ссылка устарела»", async ({ page }) => {
    const { link } = await requestLink(page, ANNA);
    await page.goto(link);
    await expect(page).toHaveURL("/");
    await signOutButton(page).click();
    await expectSignInPage(page);

    await page.goto(link);

    await expectExpiredPage(page);
    await page.goto("/");
    await expectSignInPage(page);
  });

  test("16 minutes later it shows «Ссылка устарела»", async ({ page }) => {
    const { link } = await requestLink(page, ANNA);
    await expireSignInLinks();

    await page.goto(link);

    await expectExpiredPage(page);
    await page.goto("/");
    await expectSignInPage(page);
  });

  test("a second link turns off the first", async ({ page }) => {
    const first = await requestLink(page, ANNA);
    const second = await requestLink(page, ANNA);

    await page.goto(first.link);
    await expectExpiredPage(page);

    await page.goto(second.link);
    await expect(page).toHaveURL("/");
    await expect(signOutButton(page)).toBeVisible();
  });

  test("«Получить новую ссылку» leads to the sign-in page", async ({ page }) => {
    const { link } = await requestLink(page, ANNA);
    await expireSignInLinks();
    await page.goto(link);

    await page.getByRole("link", { name: "Получить новую ссылку" }).click();

    await expectSignInPage(page);
  });

  test("a changed or cut code shows «Ссылка устарела»", async ({ page }) => {
    const { link } = await requestLink(page, ANNA);
    const url = new URL(link);
    const token = url.searchParams.get("token")!;

    url.searchParams.set("token", token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"));
    await page.goto(url.toString());
    await expectExpiredPage(page);

    url.searchParams.set("token", token.slice(0, 10));
    await page.goto(url.toString());
    await expectExpiredPage(page);

    // The real link still works: the broken ones did not use it up.
    await page.goto(link);
    await expect(page).toHaveURL("/");
  });
});

test("the fourth email in 10 minutes: «Слишком часто…», no email", async ({ page }) => {
  for (let i = 0; i < 3; i++) await requestLink(page, ANNA);

  await submitEmail(page, ANNA);

  await expect(page.getByText(TOO_OFTEN)).toBeVisible();
  await expect(emailField(page)).toHaveValue(ANNA);
  expect(await emailsTo(ANNA)).toHaveLength(3);
});

test.describe("staying signed in", () => {
  test("a visit moves the end of the sign-in to 30 days from today", async ({ page }) => {
    await signIn(page, ANNA);

    // A visit a week after the last one, twice: each moves the end forward again.
    for (let week = 0; week < 2; week++) {
      await setLastVisit(ANNA, 7);
      await page.goto("/");
      await expect(signOutButton(page)).toBeVisible();

      await expect
        .poll(async () => {
          const [expiresAt] = await sessionExpiries(ANNA);
          return (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        })
        .toBeGreaterThan(29.9);
    }
  });

  test("no visit for 31 days: the sign-in page", async ({ page }) => {
    await signIn(page, ANNA);
    await setLastVisit(ANNA, 31);

    await page.goto("/");

    await expectSignInPage(page);
  });
});

test.describe("several devices", () => {
  test("a computer and a phone are both inside and see the same contacts", async ({
    page,
    browser,
  }) => {
    await addContacts(await addUser(ANNA), ["Борис Гусев"]);
    await signIn(page, ANNA);

    await withOtherDevice(browser, async (phone) => {
      await signIn(phone, ANNA);
      await expect(listRows(phone)).toHaveCount(1);

      // A change on the phone shows on the computer after a reload.
      await phone.getByRole("button", { name: "Добавить черта" }).click();
      const dialog = phone.getByRole("dialog", { name: "Новый чертила" });
      await dialog.getByLabel("Имя").fill("Вера Лунина");
      await dialog.getByRole("button", { name: "Добавить черта" }).click();
      await expect(dialog).toBeHidden();
    });

    await page.reload();
    await expect(listRows(page)).toHaveCount(2);
    await expect(signOutButton(page)).toBeVisible();
  });

  test("«Выйти» on the phone keeps the computer inside", async ({ page, browser }) => {
    await signIn(page, ANNA);

    await withOtherDevice(browser, async (phone) => {
      await signIn(phone, ANNA);
      await signOutButton(phone).click();
      await expectSignInPage(phone);
      await phone.goto("/");
      await expectSignInPage(phone);
    });

    await page.reload();
    await expect(page).toHaveURL("/");
    await expect(signOutButton(page)).toBeVisible();
  });
});

test.describe("the header", () => {
  test("on a computer: the logo and the name left, the address and «Выйти» right", async ({
    page,
  }) => {
    await page.setViewportSize(COMPUTER);
    await signIn(page, ANNA);

    const logo = header(page).getByRole("link", { name: "черный список" });
    const address = header(page).getByText(ANNA);
    await expect(logo).toBeVisible();
    await expect(address).toBeVisible();
    await expect(signOutButton(page)).toBeVisible();
    await expect(page.getByText("личный блокнотик")).toHaveCount(0);

    const logoBox = (await logo.boundingBox())!;
    const addressBox = (await address.boundingBox())!;
    const buttonBox = (await signOutButton(page).boundingBox())!;
    expect(logoBox.x + logoBox.width).toBeLessThan(addressBox.x);
    expect(addressBox.x + addressBox.width).toBeLessThanOrEqual(buttonBox.x);
  });

  test("a long address on a phone is cut, «Выйти» stays whole, no sideways scroll", async ({
    page,
  }) => {
    const long = "very.long.address.for.testing@example.com";
    await page.setViewportSize(PHONE);
    await signIn(page, long);

    const address = header(page).getByText(long);
    await expect(address).toBeVisible();
    // Cut with an ellipsis: the text is wider than its box.
    expect(await address.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    expect(await address.evaluate((node) => getComputedStyle(node).textOverflow)).toBe("ellipsis");

    const buttonBox = (await signOutButton(page).boundingBox())!;
    expect(buttonBox.x).toBeGreaterThanOrEqual(0);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      PHONE.width,
    );
  });
});

// "Чьи данные" of openspec/changes/login/specs/data-ownership/spec.md: two people, each
// signed in through the sign-in page and an email from Mailpit, in browsers of their own.

// «Добавить черта» with a name only.
async function addContactInApp(page: Page, name: string) {
  await page.getByRole("button", { name: "Добавить черта" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый чертила" });
  await dialog.getByLabel("Имя").fill(name);
  await dialog.getByRole("button", { name: "Добавить черта" }).click();
  await expect(dialog).toBeHidden();
  await expect(listRows(page).filter({ hasText: name })).toBeVisible();
}

// «Группы» → «Новая группа» → «Добавить», then the window closes.
async function addGroupInApp(page: Page, name: string) {
  await page.getByRole("button", { name: "Группы", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Группы" });
  await dialog.getByLabel("Новая группа").fill(name);
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(groupsInWindow(page).getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(dialog).toBeHidden();
}

function groupsInWindow(page: Page) {
  return page.getByRole("dialog", { name: "Группы" }).getByRole("list", { name: "Список групп" });
}

function groupRow(page: Page) {
  return page.getByRole("navigation", { name: "Группы" });
}

// The address of a contact's card, from the list.
async function cardHref(page: Page, name: string): Promise<string> {
  const href = await listRows(page)
    .filter({ hasText: name })
    .getByRole("link")
    .getAttribute("href");
  return href!;
}

async function expectNotFoundCard(page: Page, href: string, name: string) {
  await page.goto(href);
  await expect(page.getByText("Контакт не найден", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Контакт не найден · Черный список");
  await expect(page.getByText(name)).toHaveCount(0);
}

async function expectNobodyFound(page: Page, query: string) {
  await page.goto("/");
  await page.getByLabel("Поиск по имени").fill(query);
  await expect(page.getByText("Никого не нашли")).toBeVisible();
}

test("criterion of spec 02: B does not see the contact A added", async ({ page, browser }) => {
  await signIn(page, ANNA);
  await addContactInApp(page, "Пётр Лосев");
  const petr = await cardHref(page, "Пётр Лосев");

  await withOtherDevice(browser, async (other) => {
    await signIn(other, BORIS);
    await expect(other.getByText("Здесь пока никого нет")).toBeVisible();
    await addContactInApp(other, "Борис Гусев");

    await expect(listRows(other)).toHaveCount(1);
    await expect(listRows(other)).toContainText("Борис Гусев");
    await expectNobodyFound(other, "Пётр");
    await expectNotFoundCard(other, petr, "Пётр Лосев");
  });
});

test("two users do not see each other's contacts and groups, both ways", async ({
  page,
  browser,
}) => {
  const anna = page;
  await signIn(anna, ANNA);
  await addContactInApp(anna, "Пётр Лосев");
  await addGroupInApp(anna, "Сквош");
  const petr = await cardHref(anna, "Пётр Лосев");

  const borisContext = await browser.newContext();
  try {
    const boris = await borisContext.newPage();
    await signIn(boris, BORIS);
    await addContactInApp(boris, "Борис Гусев");
    await addGroupInApp(boris, "Шахматы");
    const borisCard = await cardHref(boris, "Борис Гусев");

    const sides = [
      {
        page: anna,
        own: "Пётр Лосев",
        ownGroup: "Сквош",
        other: "Борис Гусев",
        otherGroup: "Шахматы",
        otherCard: borisCard,
      },
      {
        page: boris,
        own: "Борис Гусев",
        ownGroup: "Шахматы",
        other: "Пётр Лосев",
        otherGroup: "Сквош",
        otherCard: petr,
      },
    ];

    for (const side of sides) {
      await test.step(`${side.own}: only their own`, async () => {
        await side.page.goto("/");
        await expect(listRows(side.page)).toHaveCount(1);
        await expect(listRows(side.page)).toContainText(side.own);
        await expect(side.page.getByText("1 контакт", { exact: true })).toBeVisible();
        await expect(groupRow(side.page).getByText(side.ownGroup, { exact: true })).toBeVisible();
        await expect(groupRow(side.page).getByText(side.otherGroup, { exact: true })).toHaveCount(
          0,
        );

        await side.page.getByRole("button", { name: "Группы", exact: true }).click();
        await expect(
          groupsInWindow(side.page).getByText(side.ownGroup, { exact: true }),
        ).toBeVisible();
        await expect(
          groupsInWindow(side.page).getByText(side.otherGroup, { exact: true }),
        ).toHaveCount(0);
        await side.page.keyboard.press("Escape");

        await expectNobodyFound(side.page, side.other.split(" ")[0]);
        await expectNotFoundCard(side.page, side.otherCard, side.other);
      });
    }

    await test.step("after a reload both still see only their own", async () => {
      for (const side of sides) {
        await side.page.goto("/");
        await side.page.reload();
        await expect(listRows(side.page)).toHaveCount(1);
        await expect(listRows(side.page)).toContainText(side.own);
      }
    });
  } finally {
    await borisContext.close();
  }
});

test("the same user in another case finds the same list", async ({ page }) => {
  await signIn(page, ANNA);
  await addContactInApp(page, "Пётр Лосев");
  await signOutButton(page).click();
  await expectSignInPage(page);

  const { link } = await requestLink(page, "ANNA@example.com");
  await page.goto(link);

  await expect(page).toHaveURL("/");
  await expect(listRows(page)).toHaveCount(1);
  await expect(listRows(page)).toContainText("Пётр Лосев");
  expect(await countUsers(ANNA)).toBe(1);
});

test("another user's group in the address shows «Все» and all of one's own", async ({
  page,
  browser,
}) => {
  await signIn(page, ANNA);
  await addGroupInApp(page, "Сквош");
  const squashHref = await groupRow(page).getByRole("link", { name: "Сквош" }).getAttribute("href");

  await withOtherDevice(browser, async (other) => {
    await signIn(other, BORIS);
    await addContactInApp(other, "Борис Гусев");
    await addContactInApp(other, "Вера Лунина");

    await other.goto(squashHref!);

    await expect(groupRow(other).getByRole("link", { name: "Все" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(listRows(other)).toHaveCount(2);
    await expect(groupRow(other).getByText("Сквош", { exact: true })).toHaveCount(0);
  });
});

// A new user: "Первый вход друга" of data-ownership, "Новый пользователь" of contact-groups and
// of contact-list.
test("a friend's first sign-in: an empty list, nobody due, five groups of their own", async ({
  page,
}) => {
  const owner = await addUser(ANNA);
  await addContacts(
    owner,
    Array.from({ length: 60 }, (_, index) => `Контакт ${index}`),
  );
  await addGroup(owner, "Теннис", []);

  await signIn(page, BORIS);

  await expect(page.getByText("Здесь пока никого нет")).toBeVisible();
  await expect(
    page.getByText("Нажмите «Добавить черта», чтобы записать первого человека."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Пока некому мстить" })).toBeVisible();

  const starters = ["Бывшие", "Должники", "Коллеги", "Не любят котиков", "Родственники"];
  await expect(groupRow(page).getByRole("link")).toHaveText(["Все", ...starters]);

  await page.getByRole("button", { name: "Группы", exact: true }).click();
  const items = groupsInWindow(page).getByRole("listitem");
  await expect(items).toHaveCount(5);
  for (const [index, name] of starters.entries()) {
    await expect(items.nth(index)).toContainText(name);
    await expect(items.nth(index)).toContainText("0 контактов");
  }
  await expect(groupsInWindow(page).getByText("Теннис")).toHaveCount(0);
});
