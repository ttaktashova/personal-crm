import { describe, expect, it } from "vitest";

import { splitGroupBadges } from "./group-badges";

const groups = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Группа ${index + 1}` }));

describe("splitGroupBadges", () => {
  it("shows three of five groups and counts the other two", () => {
    const { visible, hiddenCount } = splitGroupBadges(groups(5), 3);

    expect(visible.map((group) => group.id)).toEqual([1, 2, 3]);
    expect(hiddenCount).toBe(2);
  });

  it("shows both of two groups", () => {
    const { visible, hiddenCount } = splitGroupBadges(groups(2), 3);

    expect(visible).toHaveLength(2);
    expect(hiddenCount).toBe(0);
  });

  it("shows exactly three groups without a counter", () => {
    expect(splitGroupBadges(groups(3), 3)).toEqual({ visible: groups(3), hiddenCount: 0 });
  });

  it("shows nothing for a person without groups", () => {
    expect(splitGroupBadges([], 3)).toEqual({ visible: [], hiddenCount: 0 });
  });
});
