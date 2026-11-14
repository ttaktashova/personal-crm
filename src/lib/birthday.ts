import { pluralize } from "@/lib/format";

// Shared by the form, the card and «Скоро день рождения»; runs in the browser and on the server.

// The months as they read in a date, "17 ноября": the list in the form shows the same words.
export const BIRTH_MONTHS = [
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
] as const;

// Month 1–12; year null when the owner does not know it.
export type Birthday = { day: number; month: number; year: number | null };

const dayAndMonth = (day: number, month: number) => `${day} ${BIRTH_MONTHS[month - 1]}`;

// "17 ноября 1990", or "17 ноября" without a year: the card.
export function formatBirthday({ day, month, year }: Birthday): string {
  const date = dayAndMonth(day, month);
  return year === null ? date : `${date} ${year}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A calendar date has no time zone: midnight UTC, so no zone can shift the count of days.
const utcMidnight = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

// When the birthday is, "сегодня", "завтра" or "через 3 дня". Both dates are "YYYY-MM-DD"
// in the app time zone; `nextOn` is not before `today`.
export function formatBirthdayWhen(nextOn: string, today: string): string {
  const days = Math.round((utcMidnight(nextOn) - utcMidnight(today)) / DAY_MS);
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} ${pluralize(days, ["день", "дня", "дней"])}`;
}

// The day and month of a "YYYY-MM-DD" date, without the year: "17 ноября".
export function formatBirthdayDate(nextOn: string): string {
  const [, month, day] = nextOn.split("-").map(Number);
  return dayAndMonth(day, month);
}

// "через 3 дня · 17 ноября": no year and no age.
export function formatBirthdayLabel(nextOn: string, today: string): string {
  return `${formatBirthdayWhen(nextOn, today)} · ${formatBirthdayDate(nextOn)}`;
}
