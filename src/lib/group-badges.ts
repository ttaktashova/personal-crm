// The labels of a person's groups in a list row: the first `limit` and how many are left,
// shown as "+2". The groups come already ordered by name.
export function splitGroupBadges<T>(
  groups: T[],
  limit: number,
): { visible: T[]; hiddenCount: number } {
  return {
    visible: groups.slice(0, limit),
    hiddenCount: Math.max(0, groups.length - limit),
  };
}
