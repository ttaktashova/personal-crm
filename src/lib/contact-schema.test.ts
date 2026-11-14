import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contactInputSchema, toFieldErrors } from "./contact-schema";

const valid = {
  name: "Анна Смирнова",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
  contactFrequency: "",
};

function parse(fields: Record<string, unknown>) {
  return contactInputSchema.safeParse({ ...valid, ...fields });
}

function errorsOf(fields: Record<string, unknown>) {
  const result = parse(fields);
  if (result.success) throw new Error("The input was accepted");
  return toFieldErrors(result.error);
}

describe("contactInputSchema: groups", () => {
  it("keeps the chosen groups", () => {
    const result = parse({ groupIds: [3, 1, 2], newGroupNames: ["Сквош"] });

    expect(result.success && result.data).toMatchObject({
      groupIds: [3, 1, 2],
      newGroupNames: ["Сквош"],
    });
  });

  it("accepts a form that sends no groups at all", () => {
    const result = parse({});

    expect(result.success && result.data).toMatchObject({ groupIds: [], newGroupNames: [] });
  });

  it("removes a group chosen twice", () => {
    const result = parse({ groupIds: [3, 1, 3, 2, 1] });

    expect(result.success && result.data.groupIds).toEqual([3, 1, 2]);
  });

  it("removes a new name typed twice, even in another case or with ё for е", () => {
    const result = parse({
      newGroupNames: ["Сквош", "сквош", "Теннис", "ЁЛКА", "елка", "  Теннис "],
    });

    expect(result.success && result.data.newGroupNames).toEqual(["Сквош", "Теннис", "ЁЛКА"]);
  });

  it("cuts the spaces at the edges of a new name", () => {
    const result = parse({ newGroupNames: ["  Сквош  "] });

    expect(result.success && result.data.newGroupNames).toEqual(["Сквош"]);
  });

  it("shows an empty new name at the field «Группы» and nowhere else", () => {
    expect(errorsOf({ newGroupNames: ["   "] })).toEqual({
      groups: "Укажите название группы",
    });
  });

  it("shows a long new name at the field «Группы» and nowhere else", () => {
    expect(errorsOf({ newGroupNames: ["а".repeat(51)] })).toEqual({
      groups: "Слишком длинное название: не больше 50 символов",
    });
  });

  it("shows the errors of the other fields next to the one of the groups", () => {
    expect(errorsOf({ name: "", newGroupNames: [""] })).toEqual({
      name: "Укажите имя",
      groups: "Укажите название группы",
    });
  });

  it("accepts 100 groups and 20 new names, and refuses one more", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
    const names = (count: number) => Array.from({ length: count }, (_, index) => `Группа ${index}`);

    expect(parse({ groupIds: ids(100), newGroupNames: names(20) }).success).toBe(true);
    expect(Object.keys(errorsOf({ groupIds: ids(101) }))).toEqual(["groups"]);
    expect(Object.keys(errorsOf({ newGroupNames: names(21) }))).toEqual(["groups"]);
  });

  it.each([0, -1, 1.5, "7", 2_147_483_648])("refuses %j as a group id", (id) => {
    expect(Object.keys(errorsOf({ groupIds: [id] }))).toEqual(["groups"]);
  });
});

describe("contactInputSchema: frequency", () => {
  it("stores «Не задано», which the form sends as an empty string, as null", () => {
    const result = parse({ contactFrequency: "" });

    expect(result.success && result.data.contactFrequency).toBeNull();
  });

  it.each(["week", "month", "quarter", "year"])("keeps %s", (frequency) => {
    const result = parse({ contactFrequency: frequency });

    expect(result.success && result.data.contactFrequency).toBe(frequency);
  });

  it("shows a value not from the list at the field «Как часто припоминать»", () => {
    expect(errorsOf({ contactFrequency: "daily" })).toEqual({
      contactFrequency: "Выберите, как часто припоминать, из списка",
    });
  });
});

// The rules of "Проверка даты рождения" in the birthdays spec.
describe("contactInputSchema: birthday", () => {
  // 14.11.2026 00:30 in Moscow is still 13.11 in UTC: "today" must be the Moscow one.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T21:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const birthday = (day: string, month: string, year: string) => ({
    birthday: { day, month, year },
  });
  const birthdayOf = (day: string, month: string, year: string) => {
    const result = parse(birthday(day, month, year));
    if (!result.success) throw new Error(JSON.stringify(toFieldErrors(result.error)));
    return result.data.birthday;
  };
  const birthdayErrors = (day: string, month: string, year: string) =>
    errorsOf(birthday(day, month, year));

  it("keeps a date with a year", () => {
    expect(birthdayOf("17", "11", "1990")).toEqual({ day: 17, month: 11, year: 1990 });
  });

  it("keeps a date without a year", () => {
    expect(birthdayOf("17", "11", "")).toEqual({ day: 17, month: 11, year: null });
  });

  it("reads all three parts empty as no birthday", () => {
    expect(birthdayOf("", "", "")).toBeNull();
  });

  it("reads a request without the field as no birthday", () => {
    const result = parse({});

    expect(result.success && result.data.birthday).toBeNull();
  });

  it("only a day: asks for the day and the month", () => {
    expect(birthdayErrors("17", "", "")).toEqual({ birthday: "Укажите день и месяц" });
  });

  it("only a year: asks for the day and the month", () => {
    expect(birthdayErrors("", "", "1990")).toEqual({ birthday: "Укажите день и месяц" });
  });

  it.each([
    ["31 April", "31", "4"],
    ["day 0", "0", "11"],
    ["day 32", "32", "1"],
  ])("%s: there is no such date", (_, day, month) => {
    expect(birthdayErrors(day, month, "")).toEqual({ birthday: "Такой даты нет" });
  });

  it("keeps 29 February without a year", () => {
    expect(birthdayOf("29", "2", "")).toEqual({ day: 29, month: 2, year: null });
  });

  it("29 February: no such date in 1991, a date in 1992", () => {
    expect(birthdayErrors("29", "2", "1991")).toEqual({ birthday: "Такой даты нет" });
    expect(birthdayOf("29", "2", "1992")).toEqual({ day: 29, month: 2, year: 1992 });
  });

  it.each(["90", "1899", "19а0"])("refuses the year %s", (year) => {
    expect(birthdayErrors("17", "11", year)).toEqual({
      birthday: "Год — четыре цифры, не раньше 1900",
    });
  });

  it("refuses tomorrow in Moscow and keeps today", () => {
    expect(birthdayErrors("15", "11", "2026")).toEqual({
      birthday: "Дата рождения не может быть позже сегодняшней",
    });
    expect(birthdayOf("14", "11", "2026")).toEqual({ day: 14, month: 11, year: 2026 });
  });

  it("refuses a month not from the list", () => {
    expect(birthdayErrors("1", "13", "")).toEqual({ birthday: "Такой даты нет" });
  });

  it("shows the birthday error next to the errors of the other fields", () => {
    expect(errorsOf({ name: "", ...birthday("17", "", "") })).toEqual({
      name: "Укажите имя",
      birthday: "Укажите день и месяц",
    });
  });
});
