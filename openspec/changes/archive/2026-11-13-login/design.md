# Design

## Context

Мотивация — в `proposal.md` (Why), требования — в `specs/`. Что есть сейчас и что мешает «просто добавить вход»:

- **Один владелец на всё.** В `contacts` и `groups` нет владельца. Все запросы — в `src/lib/` (`contacts.ts`, `groups.ts`, `interactions.ts`, `keep-in-touch.ts`) и в серверных действиях `src/app/contacts/*-actions.ts`; они читают и меняют все строки таблиц. Уникальный индекс `groups_name_key` — по названию на всю базу.
- **Запросы только через `runQuery`** (`src/db/index.ts`): сам объект `db` не экспортируется, чтобы ошибка с данными не попала в журнал (`error-logging`).
- **Миграции** применяет `scripts/migrate.mjs` разовым контейнером при выкатке; все новые — в одной транзакции. Локально — `pnpm db:migrate` (drizzle-kit), в тестах — `recreateMigratedDatabase` (`src/test/database-admin.ts`) и помощник в `src/db/migrations.test.ts`. В свежей базе миграция `0005` создаёт пять групп — значит, владелец нужен им даже в пустой тестовой базе.
- **Next.js 16** с `cacheComponents: true`: чтение `headers()`/`cookies()` (а значит, и входа) — только внутри `<Suspense>`. Компоненты главной и карточки уже стоят в своих `Suspense`. `middleware.ts` теперь называется `proxy.ts`; гайды — `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` и `02-guides/authentication.md` (Data Access Layer).
- **Better Auth 1.7.15** (проверено 03.11.2026 по коду пакета и документации):
  - вход по ссылке — плагин `magicLink`. Ссылка одноразовая: строка в таблице `verification` удаляется при входе. Срок задаётся в секундах. Старые ссылки при запросе новой **не гаснут**. Устаревшая, использованная и испорченная ссылка дают одну ошибку `INVALID_TOKEN` и уводят на `errorCallbackURL?error=…`;
  - почту Better Auth приводит к маленьким буквам только для пользователя. Пробелы не убирает: zod внутри отвергает « a@b.com»;
  - встроенный лимит считает запросы по IP, только в production и только для HTTP-запросов, а не для вызовов `auth.api.*` с сервера. По почте он считать не умеет;
  - `hooks.before` выполняется и для HTTP, и для `auth.api.*`. Он может отказать (`APIError`) и переписать тело запроса;
  - `databaseHooks.user.create.after` выполняется после вставки пользователя, но не в одной транзакции с ней;
  - `advanced.database.generateId: "serial"` даёт целые id от Postgres;
  - продление входа (`updateAge`) в Next.js срабатывает только в Route Handler или серверном действии: при отрисовке серверных компонентов куку записать нельзя.
- **Nodemailer 10.3.1** со своими типами (`@types/nodemailer` не нужен). **Mailpit v1.33.0**: SMTP на 1025, страница и API на 8025. **Resend:** SMTP `smtp.resend.com:465`, пользователь `resend`, пароль — ключ API. Домен отправителя подтверждается записями DNS.
- **Тексты** — в стиле приложения, на «вы» (решение владельца, `proposal.md` → Open Questions).

## Goals / Non-Goals

**Goals:**

- Владелец проверяется там, где данные: каждая функция чтения и изменения в `src/lib/` принимает `ownerId` обязательным параметром и фильтрует по нему. Забыть его нельзя — не скомпилируется.
- Один путь запроса ссылки, и все правила почты и лимита — в одном месте внутри Better Auth.
- Миграция данных атомарна: либо всё досталось владельцу и стало обязательным, либо ничего не изменилось.
- Куда идут письма, решают настройки. Одна сборка работает локально, в CI и на сервере.
- Правила входа проверяются тестами Vitest на настоящей базе, путь через браузер и почту — e2e через Mailpit.

**Non-Goals:**

- Ограничение запросов по IP и защита от рассылки на тысячи разных адресов (см. Risks).
- Смена `OWNER_EMAIL` после выкатки, перенос данных между пользователями.
- Возврат после входа на страницу, которую открывали до входа.
- Всё из раздела «Не делать» спеки 02: пароли, соцсети, коды, профиль, удаление аккаунта, общий доступ, роли.

## Decisions

### 1. Три слоя проверки входа

1. **`src/proxy.ts`** — быстрая проверка без базы: нет куки входа (`getSessionCookie` из `better-auth/cookies`) — перенаправление на `/login`. Не трогает `/login…`, `/api/auth/…`, `/health`, `/_next/…` и иконки. Proxy только отсекает тех, у кого куки нет совсем, и не защищает: кука может быть устаревшей.
2. **`src/lib/session.ts`** (`server-only`) — настоящая проверка. `getCurrentUser = cache(...)` вызывает `auth.api.getSession({ headers: await headers() })` и возвращает `{ id: number, email }` или `null`. `requireUser()` при `null` делает `redirect("/login")`. Его вызывают каждая страница (в своём `Suspense`-компоненте), `generateMetadata` карточки и каждое серверное действие — первой строкой.
3. **Функции данных в `src/lib/`** принимают `ownerId: number` первым параметром, и каждый запрос содержит условие на владельца.

Почему так, а не иначе:

- **Только proxy** — не защита: его не проходят серверные действия, вызванные напрямую, и он не видит устаревший вход (Next docs: «verify inside each Server Function»).
- **Читать вход внутри функций `src/lib/`** — тогда их не протестировать без Next.js, а сейчас все они тестируются на настоящей базе напрямую. Явный `ownerId` позволяет в тесте подставить A и B.
- **`/login` → главная для вошедшего** решает страница `/login` по настоящей проверке, а не proxy. Иначе устаревшая кука даст петлю `/login` → `/` → `/login`.

### 2. Модель данных

Таблицы Better Auth пишем руками в `src/db/schema.ts` по списку полей из `@better-auth/core` (`get-tables.ts`). Имена таблиц во множественном числе, как у нас: адаптер получает `schema: { user: users, session: sessions, account: accounts, verification: verifications }`. Поля в TypeScript — как у Better Auth (`emailVerified`, `expiresAt`), колонки — snake_case. При старте Better Auth сам сверяет схему со своей (`validateSchema`).

```
users            id integer identity PK · name text NOT NULL ('' — имя не спрашиваем)
                 email text NOT NULL UNIQUE (маленькими буквами) · email_verified boolean NOT NULL
                 image text · created_at, updated_at timestamptz NOT NULL
sessions         id integer identity PK · token text NOT NULL UNIQUE · expires_at timestamptz NOT NULL
                 user_id integer NOT NULL → users ON DELETE CASCADE (INDEX)
                 ip_address, user_agent text · created_at, updated_at
accounts         id · account_id, provider_id text NOT NULL · user_id → users ON DELETE CASCADE
                 поля токенов и пароля (пустые: входа через сервисы и паролей нет) · created_at, updated_at
verifications    id · identifier text NOT NULL (INDEX) · value text NOT NULL
                 expires_at timestamptz NOT NULL · created_at, updated_at
sign_in_emails   id integer identity PK · email text NOT NULL · sent_at timestamptz NOT NULL DEFAULT now()
                 INDEX (email, sent_at)                    учёт писем для лимита, живёт 10 минут

contacts   + owner_id integer NOT NULL → users           INDEX contacts_owner_id_idx (owner_id)
groups     + owner_id integer NOT NULL → users
           UNIQUE INDEX groups_name_key ON (owner_id, replace(lower(name collate "ru-RU-x-icu"), 'ё', 'е'))
interactions, contact_groups — без изменений: владелец — у контакта
```

- **Целые id пользователей** (`generateId: "serial"`), а не текстовые Better Auth: так же, как у всех таблиц, и миграции проще вставить владельца. В TypeScript Better Auth отдаёт id строкой — `getCurrentUser` превращает его в число через `parseId`.
- **`owner_id` у контактов и групп без каскада.** Удаления пользователей в фиче нет. Если кто-то удалит пользователя руками, база откажет, а не сотрёт его данные.
- **Записи о мести и связи «человек в группе» без своего владельца:** они принадлежат контакту. Запросы к ним проверяют владельца через `contacts`, а `setContactGroups` берёт группы только этого владельца. Можно было бы закрепить это в базе составными ключами (`contact_groups.owner_id` + ключи на `(id, owner_id)`), но это ещё одна колонка, которую нужно держать в согласии. Проверки в коде покрыты тестами на каждую функцию.
- **Имя индекса `groups_name_key` прежнее** — `isDuplicateName` в `groups.ts` продолжает узнавать повтор по нему.
- **Свой учёт писем `sign_in_emails`, а не лимит Better Auth:** тот считает по IP и не видит вызовов с сервера (Context).

### 3. Миграции: четыре файла, одна транзакция

- `0006` — `pnpm db:generate`: таблицы Better Auth и `sign_in_emails`. Существующие таблицы не трогает.
- `0007` — `pnpm db:generate` по схеме, где `owner_id` пока **может быть пустым**: колонки `owner_id` с внешними ключами, `contacts_owner_id_idx`, замена `groups_name_key` на индекс с `owner_id`.
- `0008_assign_data_to_owner.sql` — `drizzle-kit generate --custom`, перенос данных (ниже).
- `0009` — `pnpm db:generate` по схеме с `owner_id NOT NULL`: `SET NOT NULL`.

drizzle-kit сам сгенерировал бы `ADD COLUMN owner_id integer NOT NULL`, а на таблице с данными это падает. Поэтому шагов несколько, но выкатка применяет их одной транзакцией: упала `0008` — нет ни таблиц, ни колонок, работает прежняя версия. Порядок файлов совпадает с порядком реализации в tasks: после каждой группы задач проект собирается и тесты зелёные. Индекс с пустым `owner_id` между `0007` и `0009` не мешает: на выкатке это одна транзакция, а в разработке — пара коммитов.

`0008` — один блок `DO $$ … $$`:

1. Почта владельца: `lower(btrim(current_setting('app.owner_email', true)))`. Пусто или не похоже на почту (простое правило: `x@y.z` без пробелов, не длиннее 254) — `RAISE EXCEPTION 'OWNER_EMAIL is not set or is not an email'`. Значения в тексте ошибки нет.
2. `insert into users (name, email, email_verified, …) values ('', <почта>, true, now(), now()) on conflict (email) do nothing`, затем его `id`.
3. `update contacts set owner_id = <id> where owner_id is null`, то же для `groups`. `interactions` и `contact_groups` не трогаются — число строк в них не меняется.

**Как миграция узнаёт почту.** SQL-миграция не видит переменных окружения. Поэтому тот, кто применяет миграции, кладёт `OWNER_EMAIL` в настройку Postgres на своём соединении: `select set_config('app.owner_email', $1, false)`, затем `migrate()` на том же соединении (`max: 1`). Таких мест два:

- `src/db/migrate.ts` — `applyMigrations(url, ownerEmail, folder)`. Через него идут `pnpm db:migrate` (новый `scripts/migrate-local.ts`: читает `.env` как Next.js и берёт `getDatabaseUrl()` и `OWNER_EMAIL`), тестовые базы (`database-admin.ts`) и `migrations.test.ts`;
- `scripts/migrate.mjs` — та же пара строк на чистом JS для образа, с пометкой «то же, что в `src/db/migrate.ts`: менять оба» (в проекте так уже сделано с правилами полей ошибок).

`migrate.mjs` и `migrate-local.ts` проверяют `OWNER_EMAIL` до подключения и печатают `Migrations failed: OWNER_EMAIL is not set or is not an email` (то же простое правило, что в `0008`) — без значений. Без этой проверки журнал выкатки показал бы только код `P0001`. Настройка нужна всегда, не только для `0008`: одно правило проще. Прямой `drizzle-kit migrate` упадёт на `0008` с тем же текстом.

Отвергнуто:

- **Почта прямо в SQL** — попала бы в публичный git (решение владельца).
- **«Первый вошедший получает всё»** — отвергнуто владельцем.
- **Пустой `owner_id` и раздача данных при первом входе владельца** — колонка надолго осталась бы необязательной, а каждый запрос должен был бы помнить про `null`.

Тестовые базы получают тестовую почту владельца `owner@example.com` (Vitest — в `global-setup`, e2e — в `prepare-database.ts`).

### 4. Better Auth — `src/lib/auth.ts` (`server-only`)

- `database: drizzleAdapter(authDatabase, { provider: "pg", schema: {...} })` — `better-auth/adapters/drizzle`: работает с одним пакетом `better-auth`, отдельный `@better-auth/drizzle-adapter` не нужен. `authDatabase` — новый экспорт `src/db/index.ts` на том же пуле соединений, с комментарием «только для Better Auth: всё остальное — через `runQuery`».
- `advanced.database.generateId: "serial"`. `secret` и `baseURL` — из `BETTER_AUTH_SECRET` и `BETTER_AUTH_URL`.
- `session: { expiresIn: 30 дней, updateAge: 1 день }`, `cookieCache` выключен (по умолчанию с базой выключен): выход на одном устройстве сразу виден, а лишний запрос к базе на нашем объёме незаметен.
- `rateLimit: { enabled: false }` — см. §6 и Risks.
- `disabledPaths: ["/sign-in/magic-link"]`. Запросить ссылку можно только через серверное действие (§5); по HTTP этот адрес отвечает 404. Переход по ссылке (`/magic-link/verify`), `get-session` и выход работают как обычно.
- `plugins: [magicLink({ expiresIn: 900, storeToken: "hashed", sendMagicLink }), nextCookies()]`. `storeToken: "hashed"`: в базе и бэкапах лежит хеш, а не рабочая ссылка. `nextCookies()` — последним, иначе серверные действия не ставят куки.
- `hooks.before` для `/sign-in/magic-link` — правила почты и лимит (§6).
- `databaseHooks.verification.create.before` — гасит старые ссылки (§7).
- `databaseHooks.user.create.after` — стартовые группы нового пользователя (§9).
- `logger: { level: "error", log: (level, message) => console.error(...) }` — печатаем только уровень и текст, без остальных аргументов: в них бывает ошибка базы с почтой и хешем ссылки (`error-logging`).

Route Handler — `src/app/api/auth/[...all]/route.ts`: `toNextJsHandler(auth)`.

### 5. Страница входа и серверные действия

- `src/app/login/page.tsx` — заголовок «Вход» и форма. Внутри `Suspense`: если `getCurrentUser()` не `null` — `redirect("/")`.
- `src/components/sign-in-form.tsx` (клиент) — поле «Почта» (`type="email"`, `autoComplete="email"`), кнопка «Получить ссылку», `noValidate`. Подсказку браузера отключаем, чтобы ошибку всегда давал сервер и всегда одним текстом под полем. Пока запрос идёт, кнопка выключена. Ответ `sent` — на месте формы «Ссылка для входа отправлена на <почта>».
- `src/app/login/actions.ts` → `requestSignInLink(formData)`:
  1. `signInEmailSchema` (`src/lib/sign-in-email-schema.ts`, zod: `trim` → `toLowerCase` → `max(254)` → `email()`) — ошибка → `{ status: "invalid" }`;
  2. `auth.api.signInMagicLink({ body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" }, headers: await headers() })`;
  3. коды `APIError` → `invalid` / `too-often` / `send-failed`; успех → `{ status: "sent", email }`.
- `src/app/login/expired/page.tsx` — «Ссылка устарела, запросите новую», кнопка «Получить новую ссылку» → `/login`. Сюда ведёт любой `?error=`: у Better Auth устаревшая, использованная и испорченная ссылка — один код.
- `src/app/sign-out-action.ts` → `signOut()`: `auth.api.signOut({ headers })` удаляет вход этого устройства и куку, затем `redirect("/login")`.

Почему серверное действие, а не `authClient.signIn.magicLink` из браузера: так же устроены все формы проекта, в браузер не уходит клиент Better Auth, и путь запроса один (HTTP-адрес закрыт).

### 6. Правила почты и лимит — `hooks.before`

Хук на путь `/sign-in/magic-link` работает и для `auth.api.*`. Значит, правила действуют для любого, кто вызовет вход на сервере, а не только для формы:

1. `signInEmailSchema` на `ctx.body.email`. Неправильная → `APIError("BAD_REQUEST", { code: "INVALID_EMAIL" })`. Правильная → тело переписывается нормализованной почтой: в `verification.value` и в письмо попадает уже `anna@example.com`.
2. `reserveSignInEmail(email, now)` (`src/lib/sign-in-limit.ts`), в транзакции:
   - `pg_advisory_xact_lock(hashtext(email))` — два одновременных запроса не проскочат вместе;
   - удаление строк старше 10 минут;
   - если для этой почты осталось 3 строки → `{ status: "limited" }`, иначе вставка строки → `reserved`.

   `limited` → `APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_EMAILS" })`.
3. Письмо не ушло (§8) → `releaseSignInEmail(email)` удаляет последнюю строку этой почты: «в лимит не считается».

`now` — параметр: тесты проверяют «через 10 минут» без ожидания. Встроенный лимит Better Auth выключен: по почте он не считает, вызовов с сервера не видит. Он мешал бы только переходам по ссылкам: 5 в минуту с одного IP, а в e2e все браузеры — с 127.0.0.1. Подбор ссылки ему защищать не нужно: в коде 32 случайные буквы.

### 7. Новая ссылка гасит старые — `databaseHooks.verification.create.before`

Строка ссылки: `identifier = "magic-link:<хеш>"`, `value = {"type":"magic-link","email":"…"}`. Перед вставкой новой строки с `identifier` на `magic-link:` хук удаляет прежние строки этой почты (`deleteOtherSignInLinks(email)` в `src/lib/sign-in-limit.ts`):

```
identifier like 'magic-link:%' and (value::jsonb ->> 'email') = <почта>
```

Почта в `value` уже нормализована (§6). Отдельной опции у Better Auth нет. Если формат `value` изменится при обновлении библиотеки, это поймают тесты «Две ссылки подряд» (Vitest и e2e).

### 8. Письма — `src/lib/mail.ts` и `src/lib/sign-in-email.ts`

- `mail.ts`: транспорт `nodemailer.createTransport(process.env.SMTP_URL)` создаётся при первой отправке, поэтому сборке настройка не нужна. Одна строка решает, куда идут письма:
  - локально и в CI: `smtp://127.0.0.1:1025` (Mailpit, без логина);
  - на сервере: `smtps://resend:<ключ>@smtp.resend.com:465`.
- Отправитель: имя «Черный список» — текст интерфейса, в коде; адрес — из `EMAIL_FROM` (`noreply@mail.crm.testblacklist.ru`). В `.env` нет кириллицы и кавычек.
- `sign-in-email.ts` → `buildSignInEmail(url)` даёт `{ subject, html, text }`:
  - тема «Вход в Черный список»;
  - HTML: кнопка-ссылка «Войти», «Ссылка работает 15 минут», «Если вы не запрашивали вход — просто проигнорируйте письмо»;
  - текст: то же и сама ссылка.

  Почтовые программы не понимают CSS-переменные, поэтому цвета кнопки — значения токенов из `globals.css`, переписанные в шаблон с пометкой «копия токенов `--primary`/`--primary-foreground`». Это единственное место без токенов.
- `sendMagicLink` → `sendSignInEmail(email, url)`. Ошибка Nodemailer → в журнал `Sign-in email failed (code ECONNREFUSED)` (только код, по тому же правилу, что в `database-error.ts`), `releaseSignInEmail`, затем `APIError("INTERNAL_SERVER_ERROR", { code: "EMAIL_NOT_SENT" })`. Ни почты, ни ссылки в журнале нет.

### 9. Стартовые группы нового пользователя

`STARTER_GROUP_NAMES` в `src/lib/starter-groups.ts`: «Бывшие», «Должники», «Коллеги», «Не любят котиков», «Родственники». `createStarterGroups(ownerId)`: `insert … on conflict do nothing`, можно вызвать повторно. Вызывается из `databaseHooks.user.create.after` — только для пользователей, которых создал Better Auth при первом входе. Владельца создаёт миграция, поэтому новых групп у него не появится: так и требуется.

### 10. Вход держится 30 дней — `SessionRefresh`

Продление (`updateAge`) срабатывает только в Route Handler (Context). Клиентский компонент `SessionRefresh` в шапке вошедшего пользователя при каждом открытии приложения делает `fetch("/api/auth/get-session")`. Если со вчерашнего продления прошли сутки, Better Auth сдвигает срок в базе и в куке на 30 дней. Иначе ничего не пишет.

Отвергнуто: продлевать в `proxy.ts`. Это запрос к базе на каждый адрес, включая предзагрузку ссылок, а Next не советует ходить в базу из proxy.

### 11. Чьи данные — функции и действия

- `contacts.ts`: `listContactsPage({ ownerId, … })` (все три запроса и `allCount`), `findContactPage(ownerId, id, size)`, `getContact(ownerId, id)`, `insertContact(ownerId, input)` (вставляет `owner_id`), `updateContactById(ownerId, id, input)`.
- `groups.ts`: `listGroups(ownerId)`, `listContactGroups(ownerId, contactIds)`, `createGroup` / `renameGroup` / `deleteGroup(ownerId, …)`.
- `setContactGroups(tx, ownerId, contactId, …)`: новые группы создаются у владельца, совпадение ищется среди его групп, вставка связей берёт только его группы — номер чужой группы пропускается, как удалённой.
- `interactions.ts`: `listInteractions(ownerId, contactId)` через `contacts`. Запросы в `interaction-actions.ts`:
  - вставка — `select … from contacts where id = $1 and owner_id = $2`;
  - изменение и удаление — `where id = $1 and contact_id in (select id from contacts where owner_id = $2)`.
- `actions.ts`: `stopReminders`, `deleteContact` — условие на `owner_id`. Ответы для чужого — те же `not-found`, что для удалённого.
- `keep-in-touch.ts`: `listDueContacts(ownerId, today, groupId)` — `c.owner_id = $owner`.
- Страницы: `NewContact`, `GroupFilter`, `DueContacts`, `Directory`, `ContactCard` и `generateMetadata` карточки берут `ownerId` из `requireUser()`. Чужая группа в `?group=` не находится в `listGroups(ownerId)` и считается неправильной сама.
- Серверные действия: первая строка — `const user = await requireUser()`.

### 12. Шапка

`SiteHeader`: логотип со ссылкой; справа `<Suspense fallback={null}><AccountMenu /></Suspense>`. `AccountMenu` (сервер) вызывает `getCurrentUser()`: без входа (страница входа) не показывает ничего, с входом — почту (`truncate min-w-0`), кнопку «Выйти» (форма с `signOut`) и `SessionRefresh`. Плашка «личный блокнотик» удаляется. Размеры и цвета — токенами, как в остальной шапке.

### 13. Тесты

- **Vitest** (на базе `_test`, как сейчас):
  - `factories.ts` получает `addUser(email)`, остальные фабрики — `ownerId`;
  - тесты всех функций §11 на двух пользователях: чужого не видно в списке, поиске, счётчике, «Пора мстить», группах; чужое не меняется и даёт `not-found`; у A и B по «Друзья»; свой контакт не попадает в чужую группу;
  - тесты миграций: база на `0005` с контактами, записями и группами → все миграции с почтой владельца → те же числа строк, всё у владельца, почта нормализована. Без почты миграция падает, данные прежние;
  - тесты `signInEmailSchema`, `reserveSignInEmail` (с `now`), `buildSignInEmail`;
  - тесты `auth.api` прямо из Vitest: `signInMagicLink` с подменённым `src/lib/mail.ts` ловит ссылку, `magicLinkVerify` проверяет один раз, срок, новую ссылку, лимит, письмо не ушло, журнал без почты. Нужны `BETTER_AUTH_SECRET` (случайный, создаётся в `vitest.config.ts`) и `BETTER_AUTH_URL`;
  - серверные действия тестируются с подменой `@/lib/session` (текущий пользователь) и `next/cache`, как сейчас.
- **e2e** (Playwright, настоящая база и Mailpit, без моков):
  - `e2e/mailpit.ts` — очистить ящик (`DELETE /api/v1/messages`), дождаться письма на адрес (`GET /api/v1/search?query=to:"…"`), достать ссылку из `Text`;
  - `e2e/sign-in.ts` — `signIn(page, email)` через страницу входа и письмо;
  - `e2e/sign-in.spec.ts` — главный сценарий входа и критерий «A и B». Прежние спеки остаются отдельными и перед шагами входят: `addUser` → данные с `ownerId` → `signIn`;
  - срок ссылки и входа e2e не ждёт, а сдвигает `expires_at` / `updated_at` прямо в e2e-базе (помощники в `e2e/database.ts`);
  - `playwright.config.ts` задаёт серверу `SMTP_URL` на Mailpit (как сейчас `DATABASE_URL` на e2e-базу), `BETTER_AUTH_URL=http://127.0.0.1:3100`, случайный `BETTER_AUTH_SECRET` и `EMAIL_FROM`. Настоящее письмо из e2e уйти не может, что бы ни было в `.env`.
- **Без автотестов** (правило CLAUDE.md про сервер и CI): письмо через Resend, одна сборка на сервере, выкатка без `OWNER_EMAIL`. Их проверяем настоящей выкаткой по шагам из tasks.

### 14. Локально, CI, сервер

- `docker-compose.yml`: сервис `mailpit` (`axllent/mailpit:v1.33.0`), порты `127.0.0.1:1025` и `127.0.0.1:8025`.
- `.env.example` (без значений): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_URL`, `EMAIL_FROM`, `OWNER_EMAIL`.
- `ci.yml`, задача E2E: сервис Mailpit с портами 1025 и 8025. Задача Checks: `OWNER_EMAIL` не нужен — тестовая почта задаётся в коде тестов.
- `Dockerfile`: в шаге сборки — пустышка `BETTER_AUTH_SECRET`, как сейчас `DATABASE_URL`, только в строке `RUN`. В образ она не попадает.
- `deploy/compose.yaml`: приложению — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_URL`, `EMAIL_FROM`; контейнеру `migrate` — `OWNER_EMAIL`. Все в виде `${VAR:?set VAR in .env}`: без строки compose откажется работать до бэкапа и миграций.
- `deploy/server.env.example`: те же строки с подсказками, как получить значения.
- nginx не меняется: адреса ссылок строит `BETTER_AUTH_URL`, а не заголовки запроса.

## Risks / Trade-offs

- [Нет ограничения по IP: можно запросить ссылки на тысячи разных адресов и потратить лимит Resend] → Для круга друзей риск мал, спека этого не требует. Если случится — добавить лимит на запросы с одного IP в `hooks.before`.
- [`user.create.after` не в одной транзакции с пользователем: если вставка групп упадёт, пользователь останется без стартовых групп, и повторно хук не сработает] → Пять строк в той же базе, где только что создан пользователь. Падение почти невозможно, а последствие безвредно: группы можно завести руками.
- [Гашение старых ссылок опирается на внутренний формат `verification.value`] → Тесты «Две ссылки подряд» в Vitest и e2e. Версия Better Auth закреплена в `pnpm-lock.yaml`, обновление проходит через CI.
- [Ошибки адаптера Better Auth могут нести почту и хеш ссылки] → Свой `logger` печатает только текст без аргументов. Тест: при сбое в журнале нет почты.
- [Опечатка в `OWNER_EMAIL` на сервере — данные достанутся чужому адресу, владелец увидит пустой список] → До выкатки владелец сверяет строку в `.env` (шаг в tasks). Если всё же случилось — откат по плану ниже, исправить `.env`, выкатить снова.
- [Вход не продлится, если `SessionRefresh` не сработал] → e2e «Заходит регулярно» проверяет, что срок в базе сдвинулся.
- [`redirect()` из компонента внутри `Suspense` отдаёт 200 и уводит уже в браузере] → Тех, у кого куки нет совсем, proxy уводит настоящим 307. Устаревшую куку проверяют e2e-тесты «Не заходил больше 30 дней» и «Выйти».
- [Локально вход держится только на адресе из `BETTER_AUTH_URL`: кука для `localhost` не видна на `127.0.0.1`] → README: открывать приложение по адресу из `BETTER_AUTH_URL`.
- [e2e дольше: каждый тест входит через письмо] → Пара секунд на тест. Лимит 3 письма не мешает: база очищается перед каждым тестом вместе с `sign_in_emails`.

## Migration Plan

1. **До merge (делает владелец, агент подсказывает):**
   - аккаунт Resend, домен `mail.crm.testblacklist.ru`, записи DNS в Timeweb из вкладки Records, дождаться «Verified», ключ API;
   - строки в `/opt/personal-crm/.env` на сервере;
   - строки в локальном `.env`.
2. **До merge:** показать владельцу `0008_assign_data_to_owner.sql` (правило CLAUDE.md: миграция меняет существующие данные).
3. **Merge → выкатка как обычно:** образ → бэкап базы → миграции `0006`–`0009` одной транзакцией → новое приложение → smoke `/health` (работает без входа).
4. **Проверка руками:**
   - https://app.testblacklist.ru открывает страницу входа;
   - вход со своей почтой — все прежние контакты, группы, «Пора мстить»;
   - вход другом — пустой список и пять новых групп.
5. **Откат (только вручную, запускает владелец), строго в таком порядке:**
   - `restore.sh <бэкап, снятый перед этой выкаткой>` — база без пользователей и владельцев;
   - `deploy.sh "$(cat /opt/personal-crm/previous-image)"` — прежняя версия.

   Порядок важен. Прежняя версия на новой базе не смогла бы добавлять контакты (`owner_id` обязателен) и показала бы всем все данные без входа. Новая версия на старой базе только отвечает ошибками и ничего не раскрывает. README получает этот порядок.
