import { describe, expect, it } from "vitest";

import { formatContactCount } from "./format";
import { groupNameSchema } from "./group-schema";

function errorOf(value: unknown): string | undefined {
  const result = groupNameSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("groupNameSchema", () => {
  it.each(["", "   "])("asks for a name when it is empty: %j", (name) => {
    expect(errorOf(name)).toBe("Укажите название группы");
  });

  it("refuses 51 characters and lets 50 through", () => {
    expect(errorOf("а".repeat(51))).toBe("Слишком длинное название: не больше 50 символов");
    expect(errorOf("а".repeat(50))).toBeUndefined();
  });

  it("cuts the spaces at the edges", () => {
    expect(groupNameSchema.parse("  Сквош  ")).toBe("Сквош");
  });

  it("counts the length after the spaces are cut", () => {
    expect(errorOf(`  ${"а".repeat(50)}  `)).toBeUndefined();
  });

  it("keeps the case and the letters as typed", () => {
    expect(groupNameSchema.parse("Ёлка")).toBe("Ёлка");
  });
});

describe("formatContactCount", () => {
  it.each([
    [0, "0 контактов"],
    [1, "1 контакт"],
    [3, "3 контакта"],
    [11, "11 контактов"],
    [12, "12 контактов"],
    [21, "21 контакт"],
    [22, "22 контакта"],
    [1000, "1000 контактов"],
  ])("%i → %s", (count, text) => {
    expect(formatContactCount(count)).toBe(text);
  });
});
