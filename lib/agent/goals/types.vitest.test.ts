import { describe, expect, it } from "vitest";

import { GoalContractSchema, GoalSessionSchema } from "./types";

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

describe("legacy goal session parsing", () => {
  it("defaults worker notes on legacy sessions and evaluations", () => {
    const parsed = GoalSessionSchema.parse({
      id: "goal-1",
      chatId: "chat-1",
      contract: validContract,
      contractVersion: 1,
      evaluatorModel: "openai:gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      status: "paused",
      phase: "paused",
      maxReviews: 5,
      reviewCount: 1,
      unchangedRevisionCount: 0,
      baselineEntries: [],
      latestManifest: null,
      latestVerdict: null,
      evaluations: [{
        id: "evaluation-1",
        contractVersion: 1,
        reviewNumber: 1,
        modelRequestId: "request-1",
        manifest: {
          entries: [],
          createdPaths: [],
          modifiedPaths: [],
          deletedPaths: [],
          deliverablePaths: [],
          fingerprint: "empty",
          truncated: false,
          capturedAt: "2026-08-20T12:00:00.000Z",
        },
        verdict: null,
        createdAt: "2026-08-20T12:00:00.000Z",
      }],
      workerRequestId: "worker-1",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    });

    expect(parsed.workspace).toBeUndefined();
    expect(parsed.workerNotes).toEqual([]);
    expect(parsed.unchangedCriterionVerdictCount).toBe(0);
    expect(parsed.evaluations[0]?.workerNotes).toEqual([]);
  });
});
