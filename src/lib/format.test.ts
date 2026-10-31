import { describe, expect, it } from "vitest";

import { formatDueLabel, pluralize } from "./format";

describe("formatDueLabel", () => {
  const today = "2026-10-24";

  it("says «пора сегодня» when the term is today", () => {
    expect(formatDueLabel("2026-10-24", today)).toBe("пора сегодня");
  });

  it("says «пора со вчера» when the term was yesterday", () => {
    expect(formatDueLabel("2026-10-23", today)).toBe("пора со вчера");
  });

  it("gives the date when the term was earlier", () => {
    expect(formatDueLabel("2026-10-01", today)).toBe("пора с 01.10.2026");
    expect(formatDueLabel("2026-10-22", today)).toBe("пора с 22.10.2026");
  });

  it("knows that 31.12 is yesterday on 01.01", () => {
    expect(formatDueLabel("2025-12-31", "2026-01-01")).toBe("пора со вчера");
  });
});

describe("pluralize", () => {
  const people: [string, string, string] = ["людишка", "людишки", "людишек"];

  it.each([
    [1, "людишка"],
    [3, "людишки"],
    [7, "людишек"],
    [11, "людишек"],
    [12, "людишек"],
    [14, "людишек"],
    [21, "людишка"],
    [22, "людишки"],
  ])("%i %s", (count, word) => {
    expect(pluralize(count, people)).toBe(word);
  });
});
