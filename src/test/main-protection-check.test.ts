import { expect, it } from "vitest";

// Fails on purpose: a PR with this file checks that main does not take a PR with red
// checks. The PR is closed, never merged.
it("fails on purpose to check that main rejects a PR with red checks", () => {
  expect(1 + 1).toBe(3);
});
