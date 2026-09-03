import type {
  GoalArtifactEntry,
  GoalArtifactManifest,
  GoalContract,
  GoalEvaluation,
  GoalSession,
  GoalVerdict,
  GoalWorkerNote,
  GoalWorkspace,
} from "./types";

export type GoalControllerAction =
  | { type: "complete" }
  | { type: "reprompt"; instruction: string }
  | { type: "stop"; reason: GoalSession["status"] }
  | { type: "discard_stale_verdict" };

const UNCHANGED_ARTIFACT_STALL_THRESHOLD = 2;
/**
 * Consecutive revise verdicts that may report the identical set of unmet criteria
 * before supervision stops. Higher than the artifact threshold because a worker
 * legitimately needs more than one pass at the same criterion; what this catches
 * is a loop where neither side is moving.
 */
const UNCHANGED_CRITERIA_STALL_THRESHOLD = 3;

/**
 * Stable signature of the criteria a verdict did not pass.
 *
 * Compared across consecutive reviews to detect a loop in which the evaluator
 * keeps reporting the same unmet criteria however much the worker rewrites.
 */
function unmetCriteriaSignature(verdict: GoalVerdict): string {
  return verdict.criteria
    .filter((criterion) => criterion.status !== "pass")
    .map((criterion) => `${criterion.criterionId}:${criterion.status}`)
    .sort()
    .join("|");
}

/**
 * Fingerprint used for stall comparisons, scoped to the contract's deliverables.
 *
 * Manifests stored before the deliverable fingerprint existed fall back to the
 * whole-diff fingerprint rather than comparing as unconditionally equal.
 */
function stallFingerprint(manifest: GoalArtifactManifest | null | undefined): string | undefined {
  if (!manifest) return undefined;
  return manifest.deliverableFingerprint ?? manifest.fingerprint;
}
const LEGACY_RECOVERABLE_EVALUATOR_ERRORS = new Set([
  "Goal evaluator returned no assistant message.",
]);

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
  workspace?: GoalWorkspace;
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
    unchangedCriterionVerdictCount: 0,
    lastUnmetCriteriaSignature: undefined,
    baselineEntries: options.baselineEntries,
    latestManifest: null,
    latestVerdict: null,
    evaluations: [],
    ...(options.workspace ? { workspace: options.workspace } : {}),
    workerNotes: [],
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
    unchangedRevisionCount: 0,
    unchangedCriterionVerdictCount: 0,
    lastUnmetCriteriaSignature: undefined,
    evaluatorModel: update.evaluatorModel,
    evaluatorProvider: update.evaluatorProvider,
    evaluatorModelId: update.evaluatorModelId,
    evaluatorModelSettings: update.evaluatorModelSettings,
    maxReviews: update.maxReviews,
    updatedAt: update.now ?? new Date().toISOString(),
  };
}

/** Restores old reviewer-only terminal failures to a user-resumable pause. */
export function recoverLegacyGoalEvaluationFailure(
  session: GoalSession,
): GoalSession {
  const trailingEvaluation = session.evaluations.at(-1);
  const hasInterruptedTrailingEvaluation =
    session.status !== "active" &&
    trailingEvaluation?.verdict === null &&
    !trailingEvaluation.error &&
    !trailingEvaluation.completedAt;
  if (hasInterruptedTrailingEvaluation) {
    const evaluations = session.evaluations.slice(0, -1);
    return {
      ...session,
      reviewCount: Math.max(0, session.reviewCount - 1),
      latestManifest: evaluations.at(-1)?.manifest ?? null,
      evaluations,
      updatedAt: new Date().toISOString(),
      ...(session.status === "paused" || session.status === "error"
        ? {
            status: "paused" as const,
            completedAt: undefined,
            pauseReason:
              "The previous goal review was interrupted before a verdict. Resume to retry it; the interrupted review did not consume the review budget.",
          }
        : {}),
    };
  }

  const latestEvaluation = trailingEvaluation;
  if (
    session.status !== "error" ||
    session.phase !== "paused" ||
    latestEvaluation?.verdict !== null ||
    !latestEvaluation.error ||
    !LEGACY_RECOVERABLE_EVALUATOR_ERRORS.has(latestEvaluation.error)
  ) {
    return session;
  }

  return {
    ...session,
    status: "paused",
    completedAt: undefined,
    pauseReason:
      "The previous goal review could not finish because the reviewer response was interrupted. Resume to retry the review; pending worker messages were preserved.",
  };
}

/**
 * Removes the latest unfinished evaluation without spending review budget.
 *
 * This is used when a user pauses or stops during a review and when an edited
 * contract makes an in-flight verdict stale. Completed and historical reviews
 * are deliberately immutable.
 */
export function cancelGoalEvaluation(
  session: GoalSession,
  evaluationId: string,
  now = new Date().toISOString(),
): GoalSession {
  const latestEvaluation = session.evaluations.at(-1);
  if (
    latestEvaluation?.id !== evaluationId ||
    latestEvaluation.verdict !== null ||
    latestEvaluation.error ||
    latestEvaluation.completedAt
  ) {
    return session;
  }

  const evaluations = session.evaluations.slice(0, -1);
  return {
    ...session,
    phase: session.status === "active" ? "working" : session.phase,
    reviewCount: Math.max(0, session.reviewCount - 1),
    latestManifest: evaluations.at(-1)?.manifest ?? null,
    evaluations,
    updatedAt: now,
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
    workerNotes: session.workerNotes.filter((note) => !note.reviewedByEvaluationId),
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
  const completedEvaluation = evaluations.find(
    (evaluation) => evaluation.id === options.evaluationId
  );
  const reviewedNoteIds = new Set(
    completedEvaluation?.workerNotes.map((note) => note.id) ?? []
  );
  const workerNotes = session.workerNotes.map((note) =>
    reviewedNoteIds.has(note.id)
      ? { ...note, reviewedByEvaluationId: options.evaluationId }
      : note
  );
  if (options.verdict.status === "pass") {
    return {
      session: {
        ...session,
        status: "completed",
        phase: "paused",
        latestVerdict: options.verdict,
        evaluations,
        workerNotes,
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
        workerNotes,
        updatedAt: now,
        completedAt: now,
      },
      action: { type: "stop", reason: "blocked" },
    };
  }

  const previousFingerprint = stallFingerprint(
    session.evaluations
      .slice(0, -1)
      .findLast((evaluation) => evaluation.verdict?.status === "revise")
      ?.manifest
  );
  const latestFingerprint = stallFingerprint(session.latestManifest);
  const unchangedRevisionCount =
    previousFingerprint && latestFingerprint === previousFingerprint
      ? session.unchangedRevisionCount + 1
      : 0;
  const criteriaSignature = unmetCriteriaSignature(options.verdict);
  const unchangedCriterionVerdictCount =
    criteriaSignature && criteriaSignature === session.lastUnmetCriteriaSignature
      ? session.unchangedCriterionVerdictCount + 1
      : 0;
  const stalledByArtifacts =
    unchangedRevisionCount >= UNCHANGED_ARTIFACT_STALL_THRESHOLD;
  const stalledByCriteria =
    unchangedCriterionVerdictCount >= UNCHANGED_CRITERIA_STALL_THRESHOLD;
  if (stalledByArtifacts || stalledByCriteria) {
    return {
      session: {
        ...session,
        status: "stalled",
        phase: "paused",
        latestVerdict: options.verdict,
        unchangedRevisionCount,
        unchangedCriterionVerdictCount,
        lastUnmetCriteriaSignature: criteriaSignature,
        stallReason: stalledByArtifacts ? "unchanged_artifacts" : "unchanged_criteria",
        evaluations,
        workerNotes,
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
      unchangedCriterionVerdictCount,
      lastUnmetCriteriaSignature: criteriaSignature,
      stallReason: undefined,
      evaluations,
      workerNotes,
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
  const evaluations = session.evaluations.map((evaluation) =>
    evaluation.id === evaluationId
      ? {
          ...evaluation,
          error,
          completedAt: now,
          ...(options?.transcript ? { transcript: options.transcript } : {}),
        }
      : evaluation
  );
  // A reviewer that could not finish produced no judgement about the goal, so it
  // must not spend one of the user's reviews. The failed attempt stays in the
  // history for inspection and the retry reuses its review number.
  const failedEvaluation = evaluations.find(
    (evaluation) => evaluation.id === evaluationId
  );
  const reclaimsBudget = recoverable && failedEvaluation?.verdict == null;
  return {
    ...session,
    status: recoverable ? "paused" : "error",
    phase: "paused",
    evaluations,
    ...(reclaimsBudget
      ? {
          reviewCount: Math.max(0, session.reviewCount - 1),
          latestManifest:
            evaluations
              .filter((evaluation) => evaluation.id !== evaluationId)
              .at(-1)?.manifest ?? null,
        }
      : {}),
    updatedAt: now,
    completedAt: recoverable ? undefined : now,
    ...(recoverable
      ? {
          pauseReason: `Goal review paused because the reviewer could not finish: ${error.slice(0, 7_900)}`,
        }
      : {}),
  };
}

/** Pauses goal supervision while deliberately leaving the current worker untouched. */
export function pauseGoalSupervision(
  session: GoalSession,
  now = new Date().toISOString(),
  reason?: string,
): GoalSession {
  return {
    ...session,
    status: "paused",
    phase: "paused",
    updatedAt: now,
    completedAt: undefined,
    ...(reason ? { pauseReason: reason } : {}),
  };
}

/** Adds a worker note that will be snapshotted into the next goal evaluation. */
export function appendGoalWorkerNote(
  session: GoalSession,
  note: GoalWorkerNote,
  now = new Date().toISOString()
): GoalSession {
  return {
    ...session,
    workerNotes: [...session.workerNotes, note],
    updatedAt: now,
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
