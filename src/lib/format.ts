import { APP_TIME_ZONE } from "@/lib/dates";

// Russian plural forms: [one, few, many], e.g. ["контакт", "контакта", "контактов"].
export function pluralize(count: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const longDateOptions: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};
const longDateFormat = new Intl.DateTimeFormat("ru-RU", {
  ...longDateOptions,
  timeZone: APP_TIME_ZONE,
});
// A calendar date has no time zone: midnight UTC read in UTC is the same day everywhere.
const calendarLongDateFormat = new Intl.DateTimeFormat("ru-RU", {
  ...longDateOptions,
  timeZone: "UTC",
});

// "24 октября 2026": built from parts, so the " г." suffix is left out.
// Takes a moment in time (shown in the app time zone) or a "YYYY-MM-DD" date.
export function formatLongDate(date: Date | string): string {
  const parts =
    typeof date === "string"
      ? calendarLongDateFormat.formatToParts(new Date(`${date}T00:00:00Z`))
      : longDateFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}

// "2026-10-24" → "24.10.2026", straight from the string parts.
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}
