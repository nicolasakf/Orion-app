import { describe, expect, it } from "vitest";

import { GoalContractSchema } from "./types";

const validContract = {
  objective: "Create a report",
  deliverables: [{ path: "reports/final.md", description: "Final report" }],
  acceptanceCriteria: [{ id: "complete", description: "Includes findings" }],
  constraints: [],
};

describe("goal contracts", () => {
  it("accepts relative artifact paths with unique criteria", () => {
    expect(GoalContractSchema.parse(validContract)).toEqual(validContract);
  });

  it("rejects workspace traversal and duplicate criterion ids", () => {
    expect(GoalContractSchema.safeParse({
      ...validContract,
      deliverables: [{ path: "../outside.md", description: "Outside file" }],
    }).success).toBe(false);
    expect(GoalContractSchema.safeParse({
      ...validContract,
      acceptanceCriteria: [
        validContract.acceptanceCriteria[0],
        { id: "complete", description: "Duplicate" },
      ],
    }).success).toBe(false);
  });
});
