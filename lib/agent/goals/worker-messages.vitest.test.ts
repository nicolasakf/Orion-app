import { describe, expect, it } from "vitest";

import { createGoalSession } from "./controller";
import { buildGoalKickoffMessage, buildGoalRepairMessage } from "./worker-messages";

const session = createGoalSession({
  id: "goal-1",
  chatId: "chat-1",
  contract: {
    objective: "Create a report",
    deliverables: [{ path: "report.md", description: "Final report" }],
    acceptanceCriteria: [{ id: "complete", description: "Contains findings" }],
    constraints: [],
  },
  evaluatorModel: "openai:gpt-test",
  evaluatorProvider: "openai",
  evaluatorModelId: "gpt-test",
  maxReviews: 5,
  baselineEntries: [],
  workerRequestId: "worker-1",
  workspace: { workspaceDirectory: "project", rootDirectory: "/repo" },
});

describe("visible goal worker messages", () => {
  it("labels the kickoff as supervisor-originated chat metadata", () => {
    const message = buildGoalKickoffMessage(session);
    expect(message.metadata.goalMessage).toEqual({
      source: "supervisor",
      kind: "kickoff",
      goalSessionId: "goal-1",
    });
    expect(message.text).toContain("Supervisor kickoff");
  });

  it("links each repair to its distinct review and evaluation", () => {
    const message = buildGoalRepairMessage(
      session,
      {
        id: "evaluation-1",
        contractVersion: 1,
        reviewNumber: 1,
        modelRequestId: "review-request-1",
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
        workerNotes: [],
        verdict: null,
        createdAt: "2026-08-20T12:00:00.000Z",
      },
      "Add quantified findings.",
    );

    expect(message.metadata.goalMessage).toMatchObject({
      source: "supervisor",
      kind: "repair",
      reviewNumber: 1,
      evaluationId: "evaluation-1",
    });
    expect(message.text).toContain("Add quantified findings.");
    expect(message.text).toContain("bounded repair pass");
    expect(message.text).toContain("only claim items verified in the saved artifacts");
    expect(message.text).toContain("Do not broaden the work");
  });
});
