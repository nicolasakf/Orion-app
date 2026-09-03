import { describe, expect, it } from "vitest";

import { usesClientModelRequestId } from "./model-request-origin";

describe("usesClientModelRequestId", () => {
  it("keeps user, evaluator, and automated goal-worker turns traceable", () => {
    expect(usesClientModelRequestId("user")).toBe(true);
    expect(usesClientModelRequestId("goal_evaluation")).toBe(true);
    expect(usesClientModelRequestId("goal_worker")).toBe(true);
  });

  it("leaves internal one-shot requests server-owned", () => {
    expect(usesClientModelRequestId("title_generation")).toBe(false);
    expect(usesClientModelRequestId("subagent")).toBe(false);
  });
});
