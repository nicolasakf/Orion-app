import type {
  GoalArtifactEntry,
  GoalArtifactManifest,
  GoalContract,
  GoalEvaluation,
  GoalSession,
  GoalVerdict,
} from "./types";

export type GoalControllerAction =
  | { type: "complete" }
  | { type: "reprompt"; instruction: string }
  | { type: "stop"; reason: GoalSession["status"] }
  | { type: "discard_stale_verdict" };

/** Creates a persisted goal session after the user confirms its contract. */
export function createGoalSession(options: {
  id: string;
  chatId: string;
  contract: GoalContract;
  evaluatorModel: string;
  evaluatorProvider: string;
  evaluatorModelId: string;
  evaluatorModelSettings?: Record<string, unknown>;
  maxReviews: number;
  baselineEntries: GoalArtifactEntry[];
  workerRequestId: string;
  now?: string;
}): GoalSession {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id,
    chatId: options.chatId,
    contract: options.contract,
    contractVersion: 1,
    evaluatorModel: options.evaluatorModel,
    evaluatorProvider: options.evaluatorProvider,
    evaluatorModelId: options.evaluatorModelId,
    evaluatorModelSettings: options.evaluatorModelSettings,
    status: "active",
    phase: "working",
    maxReviews: options.maxReviews,
    reviewCount: 0,
    unchangedRevisionCount: 0,
    baselineEntries: options.baselineEntries,
    latestManifest: null,
    latestVerdict: null,
    evaluations: [],
    workerRequestId: options.workerRequestId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Applies a non-interrupting contract edit for the next evaluation. */
export function editGoalSession(
  session: GoalSession,
  update: {
    contract: GoalContract;
    evaluatorModel: string;
    evaluatorProvider: string;
    evaluatorModelId: string;
    evaluatorModelSettings?: Record<string, unknown>;
    maxReviews: number;
    now?: string;
  }
): GoalSession {
  return {
    ...session,
    contract: update.contract,
    contractVersion: session.contractVersion + 1,
    evaluatorModel: update.evaluatorModel,
    evaluatorProvider: update.evaluatorProvider,
    evaluatorModelId: update.evaluatorModelId,
    evaluatorModelSettings: update.evaluatorModelSettings,
    maxReviews: update.maxReviews,
    updatedAt: update.now ?? new Date().toISOString(),
  };
}

/** Starts one bounded evaluation or exhausts the review budget. */
export function startGoalEvaluation(
  session: GoalSession,
  options: {
    evaluationId: string;
    modelRequestId: string;
    manifest: GoalArtifactManifest;
    now?: string;
  }
): { session: GoalSession; evaluation: GoalEvaluation | null } {
  const now = options.now ?? new Date().toISOString();
  if (session.status !== "active") return { session, evaluation: null };
  if (session.reviewCount >= session.maxReviews) {
    return {
      session: {
        ...session,
        status: "budget_exhausted",
        phase: "paused",
        updatedAt: now,
        completedAt: now,
      },
      evaluation: null,
    };
  }

  const evaluation: GoalEvaluation = {
    id: options.evaluationId,
    contractVersion: session.contractVersion,
    reviewNumber: session.reviewCount + 1,
    modelRequestId: options.modelRequestId,
    manifest: options.manifest,
    verdict: null,
    createdAt: now,
  };
  return {
    session: {
      ...session,
      phase: "evaluating",
      reviewCount: session.reviewCount + 1,
      latestManifest: options.manifest,
      evaluations: [...session.evaluations, evaluation],
      updatedAt: now,
    },
    evaluation,
  };
}

/** Applies a validated evaluator verdict and selects the controller action. */
export function finishGoalEvaluation(
  session: GoalSession,
  options: {
    evaluationId: string;
    contractVersion: number;
    verdict: GoalVerdict;
    transcript?: unknown[];
    now?: string;
  }
): { session: GoalSession; action: GoalControllerAction } {
  const now = options.now ?? new Date().toISOString();
  if (options.contractVersion !== session.contractVersion) {
    return {
      session: { ...session, phase: "working", updatedAt: now },
      action: { type: "discard_stale_verdict" },
    };
  }

  const evaluations = session.evaluations.map((evaluation) =>
    evaluation.id === options.evaluationId
      ? {
          ...evaluation,
          verdict: options.verdict,
          completedAt: now,
          ...(options.transcript ? { transcript: options.transcript } : {}),
        }
      : evaluation
  );
  if (options.verdict.status === "pass") {
    return {
      session: {
        ...session,
        status: "completed",
        phase: "paused",
        latestVerdict: options.verdict,
        evaluations,
        updatedAt: now,
        completedAt: now,
      },
      action: { type: "complete" },
    };
  }
  if (options.verdict.status === "blocked") {
    return {
      session: {
        ...session,
        status: "blocked",
        phase: "paused",
        latestVerdict: options.verdict,
        evaluations,
        updatedAt: now,
        completedAt: now,
      },
      action: { type: "stop", reason: "blocked" },
    };
  }

  const previousFingerprint = session.evaluations
    .slice(0, -1)
    .findLast((evaluation) => evaluation.verdict?.status === "revise")
    ?.manifest.fingerprint;
  const latestFingerprint = session.latestManifest?.fingerprint;
  const unchangedRevisionCount =
    previousFingerprint && latestFingerprint === previousFingerprint
      ? session.unchangedRevisionCount + 1
      : 0;
  if (unchangedRevisionCount >= 2) {
    return {
      session: {
        ...session,
        status: "stalled",
        phase: "paused",
        latestVerdict: options.verdict,
        unchangedRevisionCount,
        evaluations,
        updatedAt: now,
        completedAt: now,
      },
      action: { type: "stop", reason: "stalled" },
    };
  }

  return {
    session: {
      ...session,
      phase: "working",
      latestVerdict: options.verdict,
      unchangedRevisionCount,
      evaluations,
      updatedAt: now,
    },
    action: {
      type: "reprompt",
      instruction: options.verdict.repairInstruction ?? options.verdict.summary,
    },
  };
}

/**
 * Marks a failed evaluation without changing or interrupting worker state.
 *
 * A `recoverable` failure — the reviewer exhausting its step budget, a dropped
 * connection — says nothing about whether the goal can be met, so it pauses
 * supervision instead of ending it and the user can resume. Anything else is
 * terminal.
 */
export function failGoalEvaluation(
  session: GoalSession,
  evaluationId: string,
  error: string,
  options?: { recoverable?: boolean; transcript?: unknown[]; now?: string }
): GoalSession {
  const now = options?.now ?? new Date().toISOString();
  const recoverable = options?.recoverable === true;
  return {
    ...session,
    status: recoverable ? "paused" : "error",
    phase: "paused",
    evaluations: session.evaluations.map((evaluation) =>
      evaluation.id === evaluationId
        ? {
            ...evaluation,
            error,
            completedAt: now,
            ...(options?.transcript ? { transcript: options.transcript } : {}),
          }
        : evaluation
    ),
    updatedAt: now,
    completedAt: recoverable ? undefined : now,
  };
}

/** Pauses goal supervision while deliberately leaving the current worker untouched. */
export function pauseGoalSupervision(
  session: GoalSession,
  now = new Date().toISOString(),
): GoalSession {
  return {
    ...session,
    status: "paused",
    phase: "paused",
    updatedAt: now,
    completedAt: undefined,
  };
}

/** Permanently ends goal supervision while deliberately leaving the worker untouched. */
export function endGoalSupervision(
  session: GoalSession,
  now = new Date().toISOString()
): GoalSession {
  return {
    ...session,
    status: "stopped",
    phase: "paused",
    updatedAt: now,
    completedAt: now,
  };
}
