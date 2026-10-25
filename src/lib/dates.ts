// The owner lives in Moscow; the server runs in UTC, so dates are shown in this zone.
export const APP_TIME_ZONE = "Europe/Moscow";

const isoDateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

// Today as "YYYY-MM-DD" in the app time zone: the same on the server and in a browser
// set to any other zone. `now` is a parameter only for checks.
export function todayIsoDate(now: Date = new Date()): string {
  const parts = isoDateFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
