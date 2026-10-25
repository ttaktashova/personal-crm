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

// "2026-01-01" → "2025-12-31": calendar arithmetic in UTC, so no time zone can shift it.
function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Since when revenge is due: "пора сегодня", "пора со вчера" or "пора с 01.10.2026".
// Both dates are "YYYY-MM-DD" in the app time zone.
export function formatDueLabel(dueOn: string, today: string): string {
  if (dueOn === today) return "пора сегодня";
  if (dueOn === previousIsoDate(today)) return "пора со вчера";
  return `пора с ${formatShortDate(dueOn)}`;
}
