import { describe, expect, it } from "vitest";

import { contactInputSchema, toFieldErrors } from "./contact-schema";

const valid = {
  name: "Анна Смирнова",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
  contactFrequency: "",
};

function parse(groupFields: Record<string, unknown>) {
  return contactInputSchema.safeParse({ ...valid, ...groupFields });
}

function groupErrors(groupFields: Record<string, unknown>) {
  const result = parse(groupFields);
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
    expect(groupErrors({ newGroupNames: ["   "] })).toEqual({
      groups: "Укажите название группы",
    });
  });

  it("shows a long new name at the field «Группы» and nowhere else", () => {
    expect(groupErrors({ newGroupNames: ["а".repeat(51)] })).toEqual({
      groups: "Слишком длинное название: не больше 50 символов",
    });
  });

  it("shows the errors of the other fields next to the one of the groups", () => {
    expect(groupErrors({ name: "", newGroupNames: [""] })).toEqual({
      name: "Укажите имя",
      groups: "Укажите название группы",
    });
  });

  it("accepts 100 groups and 20 new names, and refuses one more", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
    const names = (count: number) => Array.from({ length: count }, (_, index) => `Группа ${index}`);

    expect(parse({ groupIds: ids(100), newGroupNames: names(20) }).success).toBe(true);
    expect(Object.keys(groupErrors({ groupIds: ids(101) }))).toEqual(["groups"]);
    expect(Object.keys(groupErrors({ newGroupNames: names(21) }))).toEqual(["groups"]);
  });

  it.each([0, -1, 1.5, "7", 2_147_483_648])("refuses %j as a group id", (id) => {
    expect(Object.keys(groupErrors({ groupIds: [id] }))).toEqual(["groups"]);
  });
});
