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

const longDateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

// "24 октября 2026": built from parts, so the " г." suffix is left out.
export function formatLongDate(date: Date): string {
  const parts = longDateFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}
