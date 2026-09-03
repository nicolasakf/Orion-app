import { describe, expect, it } from "vitest";

import { createGoalWorkspace, matchesPinnedGoalWorkspace } from "./workspace";

describe("pinned goal workspaces", () => {
  it("normalizes equivalent workspace and root spellings", () => {
    expect(matchesPinnedGoalWorkspace(
      createGoalWorkspace("project/./analysis", "/repo/"),
      createGoalWorkspace("project/analysis", "/repo"),
    )).toBe(true);
  });

  it("detects either a Jupyter workspace or host-root change", () => {
    const pinned = createGoalWorkspace("project", "/repo");
    expect(matchesPinnedGoalWorkspace(
      pinned,
      createGoalWorkspace("other-project", "/repo"),
    )).toBe(false);
    expect(matchesPinnedGoalWorkspace(
      pinned,
      createGoalWorkspace("project", "/other-repo"),
    )).toBe(false);
  });
});
