import { describe, expect, it } from "vitest";

import { BIRTH_MONTHS, formatBirthday, formatBirthdayLabel } from "./birthday";

describe("formatBirthday: the birthday in the card", () => {
  it("shows the day, the month in words and the year, without «г.»", () => {
    expect(formatBirthday({ day: 17, month: 11, year: 1990 })).toBe("17 ноября 1990");
  });

  it("shows only the day and the month when the year is unknown", () => {
    expect(formatBirthday({ day: 3, month: 3, year: null })).toBe("3 марта");
  });
});

describe("formatBirthdayLabel: the line under the name in «Скоро день рождения»", () => {
  it.each([
    ["2026-11-14", "сегодня · 14 ноября"],
    ["2026-11-15", "завтра · 15 ноября"],
    ["2026-11-16", "через 2 дня · 16 ноября"],
    ["2026-11-19", "через 5 дней · 19 ноября"],
  ])("on 14.11.2026, a birthday on %s is «%s»", (nextOn, label) => {
    expect(formatBirthdayLabel(nextOn, "2026-11-14")).toBe(label);
  });

  it("shows neither the year nor the age", () => {
    expect(formatBirthdayLabel("2026-11-17", "2026-11-14")).toBe("через 3 дня · 17 ноября");
  });

  it("counts the days across the New Year", () => {
    expect(formatBirthdayLabel("2027-01-03", "2026-12-28")).toBe("через 6 дней · 3 января");
  });

  it("counts a week ahead as 7 days", () => {
    expect(formatBirthdayLabel("2026-11-21", "2026-11-14")).toBe("через 7 дней · 21 ноября");
  });
});

describe("BIRTH_MONTHS", () => {
  it("names the twelve months as in a date: «января» to «декабря»", () => {
    expect(BIRTH_MONTHS).toEqual([
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
    ]);
  });
});
