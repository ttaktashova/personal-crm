import { z } from "zod";

import type { Birthday } from "@/lib/birthday";
import { CONTACT_FREQUENCIES } from "@/lib/contact-frequency";
import { todayIsoDate } from "@/lib/dates";
import { groupNameSchema } from "@/lib/group-schema";
import { normalizeForSearch } from "@/lib/search";

// Shared by the form (instant feedback) and the server actions (source of truth).
// Messages are user-facing, hence in Russian.
const emailFormat = z.email();

// Protection from a junk request, not a product rule: the window cannot reach these numbers.
const MAX_GROUP_IDS = 100;
const MAX_NEW_GROUP_NAMES = 20;
const MAX_ROW_ID = 2_147_483_647; // Postgres integer upper bound

const NO_SUCH_DATE = "Такой даты нет";
const MIN_BIRTH_YEAR = 1900;
// 29 in February: without a year it is a real birthday; with one, the year must be a leap one.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const pad = (value: number) => String(value).padStart(2, "0");

// The birthday as the form sends it, three strings: { day: "17", month: "11", year: "" }.
// Returns the date, null for "no birthday", or the one message to show under the field:
// the rules go in order and the first one that fails is the only error.
function parseBirthday(parts: {
  day: string;
  month: string;
  year: string;
}): Birthday | null | string {
  const { day, month, year } = parts;
  if (day === "" && month === "" && year === "") return null;
  if (day === "" || month === "") return "Укажите день и месяц";

  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month)) return NO_SUCH_DATE;
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return NO_SUCH_DATE;
  if (dayNumber < 1 || dayNumber > DAYS_IN_MONTH[monthNumber - 1]) return NO_SUCH_DATE;
  if (year === "") return { day: dayNumber, month: monthNumber, year: null };

  if (!/^\d{4}$/.test(year) || Number(year) < MIN_BIRTH_YEAR) {
    return "Год — четыре цифры, не раньше 1900";
  }
  const yearNumber = Number(year);
  if (monthNumber === 2 && dayNumber === 29 && !isLeapYear(yearNumber)) return NO_SUCH_DATE;
  // "Today" in Moscow, taken on every check: an open window may live past midnight.
  if (`${year}-${pad(monthNumber)}-${pad(dayNumber)}` > todayIsoDate()) {
    return "Дата рождения не может быть позже сегодняшней";
  }
  return { day: dayNumber, month: monthNumber, year: yearNumber };
}

const birthdayPart = z.string(NO_SUCH_DATE).trim();

// A request without the field (an old open tab) means no birthday, like the groups.
const birthdaySchema = z
  .object({ day: birthdayPart, month: birthdayPart, year: birthdayPart }, NO_SUCH_DATE)
  .optional()
  .transform((parts, context): Birthday | null => {
    const result = parseBirthday(parts ?? { day: "", month: "", year: "" });
    if (typeof result === "string") {
      context.addIssue({ code: "custom", message: result });
      return z.NEVER;
    }
    return result;
  });

// "Сквош" and "сквош" are one group: the first spelling stays.
function uniqueGroupNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normalizeForSearch(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(200, "Слишком длинное имя: не больше 200 символов"),
  howWeMet: z.string().trim().max(500, "Слишком длинно: не больше 500 символов"),
  phone: z
    .string()
    .trim()
    .max(50, "Слишком длинный номер: не больше 50 символов")
    .regex(/^[\d\s()+\-.]*$/, "В номере могут быть только цифры, пробелы и символы + ( ) - ."),
  email: z
    .string()
    .trim()
    .max(254, "Слишком длинный адрес: не больше 254 символов")
    .refine(
      (value) => value === "" || emailFormat.safeParse(value).success,
      "Проверьте адрес почты: похоже, в нём ошибка",
    ),
  // Day, month and year report to one field of the form, "Дата рождения". Right after the
  // email, as in the window: the form focuses the first field with an error.
  birthday: birthdaySchema,
  notes: z.string().trim().max(50_000, "Слишком длинные заметки: не больше 50 000 символов"),
  // The form's "Не задано" sends "", which is stored as NULL.
  contactFrequency: z
    .enum(["", ...CONTACT_FREQUENCIES], "Выберите, как часто припоминать, из списка")
    .transform((value) => (value === "" ? null : value)),
  // The groups picked from the list, by id; a repeat is dropped. A form without this
  // field (an old open tab) saves a person without groups.
  groupIds: z
    .array(
      z
        .int("Проверьте выбранные группы")
        .min(1, "Проверьте выбранные группы")
        .max(MAX_ROW_ID, "Проверьте выбранные группы"),
      "Проверьте выбранные группы",
    )
    .max(MAX_GROUP_IDS, "Выбрано слишком много групп")
    .transform((ids) => [...new Set(ids)])
    .default([]),
  // Groups made in the window: they exist only after the contact is saved.
  newGroupNames: z
    .array(groupNameSchema, "Проверьте названия новых групп")
    .max(MAX_NEW_GROUP_NAMES, "Слишком много новых групп")
    .transform(uniqueGroupNames)
    .default([]),
});

// What the form sends: plain strings, "" for "Не задано".
export type ContactFormValues = z.input<typeof contactInputSchema>;
// What is saved and shown: frequency is null when not set.
export type ContactInput = z.output<typeof contactInputSchema>;
// What the edit window starts from: the saved fields and the groups the person is in.
// New groups appear only inside the window.
export type ContactFormInitialValues = Omit<ContactInput, "newGroupNames">;

// Both group fields report to one field of the form, "Группы".
export type ContactField = Exclude<keyof ContactInput, "groupIds" | "newGroupNames"> | "groups";
export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export function toFieldErrors(error: z.ZodError<ContactInput>): ContactFieldErrors {
  const { fieldErrors } = z.flattenError(error);
  const result: ContactFieldErrors = {};
  for (const key of Object.keys(fieldErrors) as (keyof ContactInput)[]) {
    const message = fieldErrors[key]?.[0];
    if (!message) continue;
    const field = key === "groupIds" || key === "newGroupNames" ? "groups" : key;
    result[field] ??= message;
  }
  return result;
}
