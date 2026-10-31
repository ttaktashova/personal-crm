import { describe, expect, it } from "vitest";

import { formatContactFrequency } from "./contact-frequency";

describe("formatContactFrequency", () => {
  it("reads no frequency as «Не задано»", () => {
    expect(formatContactFrequency(null)).toBe("Не задано");
  });

  it.each([
    ["week", "Раз в неделю"],
    ["month", "Раз в месяц"],
    ["quarter", "Раз в квартал"],
    ["year", "Раз в год"],
  ] as const)("reads %s as «%s»", (frequency, label) => {
    expect(formatContactFrequency(frequency)).toBe(label);
  });
});
