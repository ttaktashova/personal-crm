# Tasks

Автотестов в проекте нет, а тестовый раннер — новая библиотека (обсуждать с владельцем). Поэтому проверки ниже такие:

- `pnpm typecheck`, `pnpm lint`, `pnpm build`;
- разовые проверки через `pnpm tsx -e "…"`;
- SQL-запросы к локальной базе через `docker exec personal-crm-postgres sh -c 'psql -U "$POSTGRES_USER" -d <база> -c "…"'`: имя пользователя берётся внутри контейнера, `.env` не читаем;
- проверки журнала на рабочей сборке (`pnpm build`, `pnpm start`), как на сервере (design.md §6). Вывод `pnpm start` (stdout и stderr) пишется в файл во временной папке сессии, файл проверяется `grep -c`;
- ручные проверки в браузере.

Команды с `POSTGRES_DB=… команда` запускать из Git Bash: переменная окружения главнее `.env`. Временные базы создавать рядом с основной в локальном контейнере Postgres (`createdb` / `dropdb`), основную локальную базу не трогать и не удалять. Строку подключения на экран не выводить. Перед кодом на Next.js — прочитать нужный гайд в `node_modules/next/dist/docs/` (правило `AGENTS.md`).

Значения для проверок — из спеки: «Пётр Тестов», «Школа», «+7 900 111-22-33», «petr@example.com», «Занял и не вернул», «+7 900 444-55-66», «Рассказал всем про долг», «петров».

## 1. Утечка на нынешнем коде

- [x] 1.1 На нынешнем коде собрать и запустить рабочую сборку, вывод — в `before.log`. Пока база работает, открыть главную. Затем `docker compose stop postgres`, в окне «Новый чертила» ввести значения из спеки и нажать «Добавить черта», после этого `docker compose start postgres`. Проверка: окно открыто с введёнными данными, показано «Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.»; в `before.log` `grep -c "Failed query"` и `grep -c "Пётр Тестов"` больше 0. Если 0 — остановиться и разобраться: проверка не ловит утечку
- [x] 1.2 Подготовить проверку миграций (design.md §6), она понадобится ещё в 4.2 и 5.2:
  - временная база `crm_logs_check` (`createdb`), миграции на неё — `POSTGRES_DB=crm_logs_check pnpm db:migrate`;
  - в неё контакт: `insert into contacts (name, phone, notes) values ('Пётр Тестов', '+7 900 111-22-33', 'Занял и не вернул')`;
  - временная папка с копией `drizzle/` и лишней миграцией `0004_logs_check.sql`: `alter table contacts add constraint contacts_logs_check check (notes = '') not valid;`, `--> statement-breakpoint`, `update contacts set notes = notes;`. В копии `meta/_journal.json` — запись `idx: 4`, `tag: "0004_logs_check"`, `when` больше, чем у `0003`;
  - из временной папки запустить нынешний `scripts/migrate.mjs` с `DATABASE_URL`, собранной `getDatabaseUrl()` после `loadEnvConfig` (как в `scripts/seed.ts`) при `POSTGRES_DB=crm_logs_check`; вывод — в `migrate-before.log`.

  Проверка: код выхода не 0; в `migrate-before.log` `grep -c "Failing row"` и `grep -c "Занял и не вернул"` больше 0; в `crm_logs_check` ограничения `contacts_logs_check` нет (миграция откатилась целиком)

## 2. Безопасная ошибка и единая точка запросов

- [x] 2.1 Создать `src/db/database-error.ts` с `DatabaseError` (design.md §2). Проверка через `pnpm tsx -e`. Входная ошибка — `new DrizzleQueryError("insert into …", ["Пётр Тестов", "+7 900 111-22-33"], cause)` из `drizzle-orm`. В `cause` — `Error` с `code: "23514"`, `table_name: "contacts"`, `constraint_name: "contacts_logs_check"`, `detail: "Failing row contains (1, Пётр Тестов, …)"`, `where: "unnamed portal parameter $1 = 'Пётр Тестов'"`. Ожидается:
  - `new DatabaseError("createContact", error).message` — ровно `Database query failed: createContact (code 23514, table contacts, constraint contacts_logs_check)`;
  - в `util.inspect(…, { depth: 10, showHidden: true })` нет «Пётр», «+7 900», «Failing row», «insert into», «portal», «[cause]»;
  - `cause` = `Error("connect ECONNREFUSED 127.0.0.1:5432")` с `code: "ECONNREFUSED"` → `(code ECONNREFUSED)`, а текста `127.0.0.1` в сообщении нет;
  - без `code` → `(code unknown)`; `code: "abc def"` и `table_name: "Пётр"` в сообщение не попадают
- [x] 2.2 В `src/db/index.ts` — `runQuery(label, run)`, `db` больше не экспортируется, комментарий, зачем (design.md §1). Проверка: `pnpm typecheck` сообщает, что экспорта `db` нет, ровно в 6 файлах — `src/app/contacts/actions.ts`, `src/app/contacts/interaction-actions.ts`, `src/lib/contacts.ts`, `src/lib/interactions.ts`, `src/lib/keep-in-touch.ts`, `src/app/health/route.ts`. Других мест с запросами нет

## 3. Все запросы — через `runQuery`

- [x] 3.1 Серверные действия: `createContact`, `updateContact`, `stopReminders`, `deleteContact` в `actions.ts` и `insertInteraction`, `updateInteraction`, `deleteInteraction` в `interaction-actions.ts`. Метка — имя функции. Проверка: ошибки `pnpm typecheck` в этих двух файлах ушли, в diff меняется только обёртка вокруг запросов, логика та же
- [x] 3.2 Чтение: `listContactsPage`, `findContactPage` (оба запроса в одном `runQuery`), `getContact` в `src/lib/contacts.ts`, `listInteractions` в `src/lib/interactions.ts`, `listDueContacts` в `src/lib/keep-in-touch.ts`. Проверка: та же, что в 3.1, для этих файлов
- [x] 3.3 `/health`: `runQuery("healthCheck", …)` (design.md §4). Проверка: `pnpm typecheck`, `pnpm lint`, `pnpm build` проходят; `grep -rn '"@/db"' src` находит только импорты `runQuery`
- [x] 3.4 Ничего не сломалось — проверка на `pnpm dev`, при работающей базе:
  - главная, поиск «петров», переход по страницам;
  - добавление контакта, карточка, редактирование, удаление контакта;
  - «Отомстил» в карточке, изменение и удаление записи в «История мести»;
  - «Отомстил» и «Простить» в блоке «Пора мстить»;
  - `/health` — 200 и `{"status":"ok"}`.

  Всё работает как раньше, в консоли браузера нет ошибок

## 4. Журнал приложения при сбоях

- [x] 4.1 Рабочая сборка, вывод — в `after.log`. Пока база работает, открыть главную в одной вкладке и карточку любого контакта в другой. Затем `docker compose stop postgres` и пройти сценарии требования «Журнал приложения без данных»:
  - добавить контакт со значениями из спеки;
  - в карточке сменить телефон на «+7 900 444-55-66» и нажать «Сохранить»;
  - в карточке «Отомстил» с текстом «Рассказал всем про долг»;
  - на главной набрать в поиске «петров»;
  - `curl -s -w " %{http_code}" http://127.0.0.1:3000/health`.

  После этого `docker compose start postgres`. Проверка:
  - требование «Владелец видит при сбое то же, что и раньше»: окна открыты с введёнными данными, сообщение «Не удалось сохранить. Проверьте, что приложение запущено, и попробуйте ещё раз.»; поиск открывает «Не получилось загрузить данные» с кнопкой «Попробовать ещё раз»; `/health` — `{"status":"error"} 503`;
  - в `after.log` `grep -c` даёт 0 для каждого значения из спеки, для имени редактируемого контакта и для «Failed query», «params:», «Failing row»;
  - требование «Что остаётся в записи об ошибке», сценарий «База недоступна»: в `after.log` есть `Database query failed:` с метками `createContact`, `updateContact`, `insertInteraction`, `listContactsPage`, `healthCheck`, у каждой — код ошибки соединения
- [x] 4.2 Сценарии «База отклонила строку» и «Ограничение в базе». В `crm_logs_check` добавить `alter table contacts add constraint contacts_logs_check check (notes = '') not valid`, запустить `POSTGRES_DB=crm_logs_check pnpm start` с выводом в `rejected.log` и добавить контакт со значениями из спеки. Проверка:
  - показано «Не удалось сохранить…», окно открыто;
  - в `rejected.log` есть `Database query failed: createContact (code 23514, table contacts, constraint contacts_logs_check)`;
  - `grep -c` значений из спеки, «Failing row» и «Failed query» — 0.

  После проверки удалить ограничение (`alter table contacts drop constraint contacts_logs_check`). Журнал самого Postgres (`docker logs personal-crm-postgres`) при этом искусственном ограничении содержит строку — это ожидаемо (design.md, Non-Goals): в схеме приложения таких ограничений нет

## 5. Миграции без данных в выводе

- [x] 5.1 `scripts/migrate.mjs`: `try/catch` вокруг `migrate()`, печать `Migrations failed (code …)` по правилам design.md §3, `process.exitCode = 1`. В `migrate.mjs` и `database-error.ts` — комментарии со ссылкой друг на друга. Проверка: `node --check scripts/migrate.mjs` и `pnpm lint` проходят
- [x] 5.2 Повторить запуск из 1.2 с новым `migrate.mjs`, вывод — в `migrate-after.log`. Проверка:
  - код выхода 1, в выводе `Migrations failed (code 23514, table contacts, constraint contacts_logs_check)`;
  - `grep -c` для «Пётр Тестов», «Занял и не вернул», «Failing row», «alter table» — 0;
  - ограничения `contacts_logs_check` в `crm_logs_check` нет.

  Затем запустить `migrate.mjs` на `crm_logs_check` с обычной папкой `drizzle/` из корня проекта — `Migrations applied.` и код выхода 0. После этого `dropdb crm_logs_check` и удалить временную папку; основная локальная база на месте (`\l`)

## 6. README

- [x] 6.1 Дополнить README. В «Как устроено», пункт `src/db`: все запросы идут через `runQuery`. При сбое в журнал пишется `Database query failed: <запрос> (code …)` без данных контактов, текста запроса и пояснений базы; `ECONNREFUSED` значит «база не отвечает». В «Выкатка на сервер», шаг 3: если миграции упали, в логе Actions будет `Migrations failed (code …)`, тоже без данных. Проверка: текст совпадает с тем, что видно в `after.log` и `migrate-after.log`

## 7. Итоговая проверка

- [x] 7.1 `pnpm typecheck`, `pnpm lint`, `pnpm build` и `openspec validate redact-db-errors-in-logs --strict` проходят без ошибок

## Workflow follow-up

- «Коммить и пуш» — коммит в ветку `redact-db-errors-in-logs`, push, PR в main. В описании PR — счётчики `grep -c` «до» (1.1, 1.2) и «после» (4.1, 4.2, 5.2), без самих значений.
- После merge и выкатки: smoke `/health` зелёный. Затем проверить, не остались ли старые записи на сервере (design.md, Risks). Команды запускает владелец или агент с его разрешения:
  - `ssh crm "docker info --format '{{.LoggingDriver}}'"` — `json-file` или `local` значит, что журнал старого контейнера удалён вместе с ним;
  - `ssh crm "docker ps -a --filter name=prod-app --format '{{.Names}} {{.Status}}'"` — один работающий контейнер, старых остановленных нет.

  Если драйвер другой (например, `journald`) или остался старый контейнер — сказать владельцу, ничего не удалять.
- Архивировать изменение (`/opsx:archive`) после проверки.
