import { describe, expect, it } from "vitest";

import {
  createGoalSession,
  editGoalSession,
  endGoalSupervision,
  failGoalEvaluation,
  finishGoalEvaluation,
  pauseGoalSupervision,
  startGoalEvaluation,
} from "./controller";
import type { GoalArtifactManifest, GoalContract, GoalVerdict } from "./types";

const contract: GoalContract = {
  objective: "Create a churn report",
  deliverables: [{ path: "report.ipynb", description: "Analysis notebook" }],
  acceptanceCriteria: [{ id: "complete", description: "Contains quantified findings" }],
  constraints: [],
};

const manifest: GoalArtifactManifest = {
  entries: [],
  createdPaths: ["report.ipynb"],
  modifiedPaths: [],
  deletedPaths: [],
  deliverablePaths: ["report.ipynb"],
  fingerprint: "one",
  truncated: false,
  capturedAt: "2026-08-20T12:00:00.000Z",
};

const reviseVerdict: GoalVerdict = {
  status: "revise",
  criteria: [{
    criterionId: "complete",
    status: "fail",
    evidence: [{ path: "report.ipynb", observation: "No quantified findings." }],
    explanation: "The criterion is not met.",
  }],
  summary: "More work is needed.",
  repairInstruction: "Add quantified findings.",
  confidence: 0.9,
};

function session() {
  return createGoalSession({
    id: "goal-1",
    chatId: "chat-1",
    contract,
    evaluatorModel: "openai:gpt-test",
    evaluatorProvider: "openai",
    evaluatorModelId: "gpt-test",
    maxReviews: 2,
    baselineEntries: [],
    workerRequestId: "worker-1",
    now: "2026-08-20T12:00:00.000Z",
  });
}

describe("goal controller", () => {
  it("versions edits without stopping active work", () => {
    const edited = editGoalSession(session(), {
      contract: { ...contract, objective: "Create a retention report" },
      evaluatorModel: "openai:gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 3,
      now: "2026-08-20T12:01:00.000Z",
    });
    expect(edited.contractVersion).toBe(2);
    expect(edited.phase).toBe("working");
    expect(edited.status).toBe("active");
  });

  it("reprompts from a revise verdict", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "evaluation-1",
      modelRequestId: "request-1",
      manifest,
    });
    const finished = finishGoalEvaluation(started.session, {
      evaluationId: "evaluation-1",
      contractVersion: 1,
      verdict: reviseVerdict,
    });
    expect(finished.action).toEqual({ type: "reprompt", instruction: "Add quantified findings." });
    expect(finished.session.phase).toBe("working");
  });

  it("discards a verdict for an edited contract", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "evaluation-1",
      modelRequestId: "request-1",
      manifest,
    });
    const edited = editGoalSession(started.session, {
      contract: { ...contract, objective: "Updated objective" },
      evaluatorModel: "openai:gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 2,
    });
    const finished = finishGoalEvaluation(edited, {
        evaluationId: "evaluation-1",
        contractVersion: 1,
        verdict: reviseVerdict,
      });
    expect(finished.action).toEqual({ type: "discard_stale_verdict" });
    expect(finished.session.phase).toBe("working");
  });

  it("exhausts the review budget before starting another evaluation", () => {
    const exhausted = startGoalEvaluation({ ...session(), reviewCount: 2 }, {
      evaluationId: "evaluation-3",
      modelRequestId: "request-3",
      manifest,
    });
    expect(exhausted.evaluation).toBeNull();
    expect(exhausted.session.status).toBe("budget_exhausted");
  });

  it("pauses supervision without changing worker metadata", () => {
    const paused = pauseGoalSupervision(session());
    expect(paused.status).toBe("paused");
    expect(paused.phase).toBe("paused");
    expect(paused.workerRequestId).toBe("worker-1");
  });

  it("ends supervision without changing worker metadata", () => {
    const ended = endGoalSupervision(session());
    expect(ended.status).toBe("stopped");
    expect(ended.workerRequestId).toBe("worker-1");
  });
});

describe("failed goal evaluations", () => {
  it("pauses recoverably so a reviewer overrun does not end the goal", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "review-1",
      modelRequestId: "request-1",
      manifest,
      now: "2026-08-20T12:01:00.000Z",
    });
    const failed = failGoalEvaluation(
      started.session,
      "review-1",
      "Goal evaluator exceeded 12 model steps.",
      { recoverable: true, now: "2026-08-20T12:02:00.000Z" },
    );

    expect(failed.status).toBe("paused");
    expect(failed.phase).toBe("paused");
    expect(failed.completedAt).toBeUndefined();
    expect(failed.evaluations[0]?.error).toContain("12 model steps");
  });

  it("still ends supervision for an unrecoverable failure", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "review-1",
      modelRequestId: "request-1",
      manifest,
      now: "2026-08-20T12:01:00.000Z",
    });
    const failed = failGoalEvaluation(started.session, "review-1", "Malformed verdict.", {
      now: "2026-08-20T12:02:00.000Z",
    });

    expect(failed.status).toBe("error");
    expect(failed.completedAt).toBe("2026-08-20T12:02:00.000Z");
  });

  it("stores the reviewer transcript alongside its verdict", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "review-1",
      modelRequestId: "request-1",
      manifest,
      now: "2026-08-20T12:01:00.000Z",
    });
    const finished = finishGoalEvaluation(started.session, {
      evaluationId: "review-1",
      contractVersion: 1,
      verdict: reviseVerdict,
      transcript: [{ id: "m1", role: "assistant", parts: [] }],
      now: "2026-08-20T12:02:00.000Z",
    });

    expect(finished.session.evaluations[0]?.transcript).toHaveLength(1);
  });
});
