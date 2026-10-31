import { describe, expect, it } from "vitest";

import { filterGroups, suggestCreation } from "./group-match";

const groups = (...names: string[]) => names.map((name, index) => ({ id: index + 1, name }));

const namesOf = (items: { name: string }[]) => items.map((item) => item.name);

describe("filterGroups", () => {
  const all = groups("Аналитики", "Друзья", "Знакомые");

  it("leaves the groups that have the typed text in the name", () => {
    expect(namesOf(filterGroups(all, "зна"))).toEqual(["Знакомые"]);
  });

  it("ignores the case", () => {
    expect(namesOf(filterGroups(all, "ДРУЗ"))).toEqual(["Друзья"]);
  });

  it("finds a group by a part from the middle of the name", () => {
    expect(namesOf(filterGroups(all, "лит"))).toEqual(["Аналитики"]);
  });

  it("shows all the groups for an empty field", () => {
    expect(filterGroups(all, "")).toEqual(all);
    expect(filterGroups(all, "   ")).toEqual(all);
  });

  it("shows nothing when nothing matches", () => {
    expect(filterGroups(all, "сквош")).toEqual([]);
  });

  it("finds «Елка» by «ёлка» and «Ёлка» by «елка»", () => {
    expect(namesOf(filterGroups(groups("Елка"), "ёлка"))).toEqual(["Елка"]);
    expect(namesOf(filterGroups(groups("Ёлка"), "елка"))).toEqual(["Ёлка"]);
  });

  it("keeps the order of the groups it was given", () => {
    const given = groups("Знакомые", "Знатоки");

    expect(namesOf(filterGroups(given, "зна"))).toEqual(["Знакомые", "Знатоки"]);
  });
});

describe("suggestCreation", () => {
  const all = groups("Друзья", "Теннис");

  it("offers to create a group that does not exist", () => {
    expect(suggestCreation(all, "Сквош")).toEqual({ kind: "create", name: "Сквош" });
  });

  it("offers the name without the spaces at the edges", () => {
    expect(suggestCreation(all, "  Сквош ")).toEqual({ kind: "create", name: "Сквош" });
  });

  it("offers nothing when the name is already a group, whatever the case", () => {
    expect(suggestCreation(all, "теннис")).toEqual({ kind: "none" });
    expect(suggestCreation(all, "ТЕННИС ")).toEqual({ kind: "none" });
  });

  it("treats «ё» as «е» when it looks for the same group", () => {
    expect(suggestCreation(groups("Ёлка"), "Елка")).toEqual({ kind: "none" });
  });

  it("offers to create a name that is only a part of a group", () => {
    expect(suggestCreation(all, "тен")).toEqual({ kind: "create", name: "тен" });
  });

  it("offers nothing for an empty field", () => {
    expect(suggestCreation(all, "")).toEqual({ kind: "none" });
    expect(suggestCreation(all, "   ")).toEqual({ kind: "none" });
  });

  it("shows the error instead of the offer for a name of 51 characters", () => {
    expect(suggestCreation(all, "а".repeat(51))).toEqual({
      kind: "error",
      message: "Слишком длинное название: не больше 50 символов",
    });
  });

  it("offers a name of 50 characters", () => {
    const name = "а".repeat(50);

    expect(suggestCreation(all, name)).toEqual({ kind: "create", name });
  });
});
