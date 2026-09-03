import { describe, expect, it } from "vitest";

import {
  appendGoalWorkerNote,
  cancelGoalEvaluation,
  createGoalSession,
  editGoalSession,
  endGoalSupervision,
  failGoalEvaluation,
  finishGoalEvaluation,
  pauseGoalSupervision,
  recoverLegacyGoalEvaluationFailure,
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
  it("cancels an interrupted review without consuming its budget", () => {
    const firstStarted = startGoalEvaluation(session(), {
      evaluationId: "review-1",
      modelRequestId: "request-1",
      manifest,
    });
    const cancelled = cancelGoalEvaluation(
      firstStarted.session,
      "review-1",
      "2026-08-20T12:02:00.000Z",
    );

    expect(cancelled.reviewCount).toBe(0);
    expect(cancelled.evaluations).toEqual([]);
    expect(cancelled.latestManifest).toBeNull();
    expect(cancelled.phase).toBe("working");
  });

  it("repairs a legacy paused session with an unfinished trailing review", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "review-interrupted",
      modelRequestId: "request-interrupted",
      manifest,
    });
    const legacyPaused = {
      ...started.session,
      status: "paused" as const,
      phase: "paused" as const,
    };

    const recovered = recoverLegacyGoalEvaluationFailure(legacyPaused);

    expect(recovered.reviewCount).toBe(0);
    expect(recovered.evaluations).toEqual([]);
    expect(recovered.latestManifest).toBeNull();
    expect(recovered.pauseReason).toContain("did not consume the review budget");
  });

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

  it("makes legacy no-assistant reviewer failures resumable without losing notes", () => {
    const noted = appendGoalWorkerNote(session(), {
      id: "note-legacy-review",
      toolCallId: "tool-legacy-review",
      workerRequestId: "worker-1",
      message: "Inspect the regenerated report.",
      relatedPaths: ["report.ipynb"],
      createdAt: "2026-08-20T12:00:30.000Z",
    });
    const started = startGoalEvaluation(noted, {
      evaluationId: "review-legacy-error",
      modelRequestId: "request-legacy-error",
      manifest,
    });
    const failed = failGoalEvaluation(
      started.session,
      "review-legacy-error",
      "Goal evaluator returned no assistant message.",
      { now: "2026-08-20T12:02:00.000Z" },
    );

    const recovered = recoverLegacyGoalEvaluationFailure(failed);

    expect(recovered.status).toBe("paused");
    expect(recovered.completedAt).toBeUndefined();
    expect(recovered.pauseReason).toContain("Resume to retry");
    expect(recovered.workerNotes[0]?.reviewedByEvaluationId).toBeUndefined();
    expect(recovered.evaluations[0]?.error).toBe(
      "Goal evaluator returned no assistant message.",
    );
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

  it("retries pending worker notes and reviews them only after a valid verdict", () => {
    const noted = appendGoalWorkerNote(session(), {
      id: "note-1",
      toolCallId: "tool-1",
      workerRequestId: "worker-1",
      message: "The calculations are in the appendix.",
      relatedPaths: ["report.ipynb"],
      createdAt: "2026-08-20T12:00:30.000Z",
    });
    const first = startGoalEvaluation(noted, {
      evaluationId: "review-1",
      modelRequestId: "request-1",
      manifest,
    });
    expect(first.evaluation?.workerNotes.map((note) => note.id)).toEqual(["note-1"]);

    const failed = failGoalEvaluation(first.session, "review-1", "Network error", {
      recoverable: true,
    });
    expect(failed.workerNotes[0]?.reviewedByEvaluationId).toBeUndefined();
    expect(failed.pauseReason).toContain("Network error");

    const retry = startGoalEvaluation(
      { ...failed, status: "active", phase: "working" },
      {
        evaluationId: "review-2",
        modelRequestId: "request-2",
        manifest,
      },
    );
    expect(retry.evaluation?.workerNotes.map((note) => note.id)).toEqual(["note-1"]);

    const finished = finishGoalEvaluation(retry.session, {
      evaluationId: "review-2",
      contractVersion: 1,
      verdict: reviseVerdict,
    });
    expect(finished.session.workerNotes[0]?.reviewedByEvaluationId).toBe("review-2");
  });

  it("does not let worker notes reset unchanged-artifact stall detection", () => {
    let current = { ...session(), maxReviews: 5 };
    for (let review = 1; review <= 2; review += 1) {
      const started = startGoalEvaluation(current, {
        evaluationId: `review-${review}`,
        modelRequestId: `request-${review}`,
        manifest,
      });
      current = finishGoalEvaluation(started.session, {
        evaluationId: `review-${review}`,
        contractVersion: 1,
        verdict: {
          ...reviseVerdict,
          criteria: reviseVerdict.criteria.map((criterion) => ({
            ...criterion,
            status: review === 1 ? "fail" as const : "uncertain" as const,
          })),
        },
      }).session;
    }
    current = appendGoalWorkerNote(current, {
      id: "note-between-revisions",
      toolCallId: "tool-between-revisions",
      workerRequestId: "worker-1",
      message: "The files are unchanged, but please inspect them again.",
      relatedPaths: ["report.ipynb"],
      createdAt: "2026-08-20T12:03:00.000Z",
    });
    const third = startGoalEvaluation(current, {
      evaluationId: "review-3",
      modelRequestId: "request-3",
      manifest,
    });
    const finished = finishGoalEvaluation(third.session, {
      evaluationId: "review-3",
      contractVersion: 1,
      verdict: reviseVerdict,
    });

    expect(finished.session.status).toBe("stalled");
    expect(finished.session.stallReason).toBe("unchanged_artifacts");
    expect(finished.action).toEqual({ type: "stop", reason: "stalled" });
  });

  /** Runs one revise review with an explicitly chosen artifact fingerprint. */
  function reviewRound(
    current: ReturnType<typeof session>,
    options: { id: string; deliverableFingerprint: string; verdict?: GoalVerdict },
  ) {
    const started = startGoalEvaluation(current, {
      evaluationId: options.id,
      modelRequestId: `request-${options.id}`,
      manifest: {
        ...manifest,
        fingerprint: `whole-${options.id}`,
        deliverableFingerprint: options.deliverableFingerprint,
      },
    });
    return finishGoalEvaluation(started.session, {
      evaluationId: options.id,
      contractVersion: 1,
      verdict: options.verdict ?? reviseVerdict,
    });
  }

  it("stalls when reviews keep reporting the same unmet criteria", () => {
    // Scratch files the worker rewrites each pass move the whole-diff
    // fingerprint, so only the criteria signature can catch this loop.
    let current = { ...session(), maxReviews: 8 };
    for (const id of ["review-1", "review-2", "review-3"]) {
      const finished = reviewRound(current, {
        id,
        deliverableFingerprint: `deliverable-${id}`,
      });
      current = finished.session;
      expect(finished.action.type).toBe("reprompt");
    }
    expect(current.unchangedRevisionCount).toBe(0);
    expect(current.unchangedCriterionVerdictCount).toBe(2);

    const stalled = reviewRound(current, {
      id: "review-4",
      deliverableFingerprint: "deliverable-review-4",
    });
    expect(stalled.session.status).toBe("stalled");
    expect(stalled.session.stallReason).toBe("unchanged_criteria");
    expect(stalled.action).toEqual({ type: "stop", reason: "stalled" });
  });

  it("resets the criteria stall counter when a different criterion is reported", () => {
    let current = { ...session(), maxReviews: 8 };
    for (const id of ["review-1", "review-2"]) {
      current = reviewRound(current, {
        id,
        deliverableFingerprint: `deliverable-${id}`,
      }).session;
    }
    expect(current.unchangedCriterionVerdictCount).toBe(1);

    const shifted = reviewRound(current, {
      id: "review-3",
      deliverableFingerprint: "deliverable-review-3",
      verdict: {
        ...reviseVerdict,
        criteria: [{ ...reviseVerdict.criteria[0]!, status: "uncertain" }],
      },
    });
    expect(shifted.session.unchangedCriterionVerdictCount).toBe(0);
    expect(shifted.session.stallReason).toBeUndefined();
    expect(shifted.action.type).toBe("reprompt");
  });

  it("ignores scratch-file churn when deciding an artifact stall", () => {
    // The whole-diff fingerprint differs on every round; the deliverables do not.
    let current = { ...session(), maxReviews: 8 };
    for (const id of ["review-1", "review-2"]) {
      current = reviewRound(current, {
        id,
        deliverableFingerprint: "deliverable-frozen",
      }).session;
    }
    expect(current.unchangedRevisionCount).toBe(1);

    const stalled = reviewRound(current, {
      id: "review-3",
      deliverableFingerprint: "deliverable-frozen",
    });
    expect(stalled.session.stallReason).toBe("unchanged_artifacts");
    expect(stalled.action).toEqual({ type: "stop", reason: "stalled" });
  });

  it("does not spend a review when a recoverable reviewer failure pauses supervision", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "evaluation-1",
      modelRequestId: "request-1",
      manifest,
    });
    expect(started.session.reviewCount).toBe(1);

    const failed = failGoalEvaluation(
      started.session,
      "evaluation-1",
      "Goal evaluator could not produce a verdict within 40 model steps.",
      { recoverable: true },
    );
    expect(failed.status).toBe("paused");
    expect(failed.reviewCount).toBe(0);
    expect(failed.evaluations.at(-1)?.error).toContain("40 model steps");

    // The retry reuses the reclaimed budget rather than skipping a review number.
    const retried = startGoalEvaluation({ ...failed, status: "active" }, {
      evaluationId: "evaluation-2",
      modelRequestId: "request-2",
      manifest,
    });
    expect(retried.evaluation?.reviewNumber).toBe(1);
  });

  it("keeps a terminal reviewer failure charged to the review budget", () => {
    const started = startGoalEvaluation(session(), {
      evaluationId: "evaluation-1",
      modelRequestId: "request-1",
      manifest,
    });
    const failed = failGoalEvaluation(
      started.session,
      "evaluation-1",
      "Reviewer credential rejected.",
      { recoverable: false },
    );
    expect(failed.status).toBe("error");
    expect(failed.reviewCount).toBe(1);
  });
});
