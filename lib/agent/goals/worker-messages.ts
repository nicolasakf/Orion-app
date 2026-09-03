import type { ChatMessageMetadata } from "@/lib/chat/chat-references";

import type { GoalEvaluation, GoalSession } from "./types";

export interface GoalWorkerMessage {
  text: string;
  metadata: ChatMessageMetadata;
}

/** Builds the visible supervisor kickoff that starts the first worker turn. */
export function buildGoalKickoffMessage(session: GoalSession): GoalWorkerMessage {
  return {
    text: "[Supervisor kickoff]\nBegin work on the approved goal contract. Use the contract in your goal context as the authoritative scope, and produce artifact evidence for every acceptance criterion.",
    metadata: {
      goalMessage: {
        source: "supervisor",
        kind: "kickoff",
        goalSessionId: session.id,
      },
    },
  };
}

/** Builds a visible supervisor repair turn from one successful revise verdict. */
export function buildGoalRepairMessage(
  session: GoalSession,
  evaluation: GoalEvaluation,
  instruction: string,
): GoalWorkerMessage {
  return {
    text: `[Supervisor repair · Review ${evaluation.reviewNumber}]\n${instruction}\n\nTreat this as a bounded repair pass: address the listed defects, validate the affected deliverables, and return them for review. Before reporting completion, directly re-open or re-run the relevant checks for every listed defect and only claim items verified in the saved artifacts. Do not broaden the work beyond the approved contract or these defects.`,
    metadata: {
      goalMessage: {
        source: "supervisor",
        kind: "repair",
        goalSessionId: session.id,
        reviewNumber: evaluation.reviewNumber,
        evaluationId: evaluation.id,
      },
    },
  };
}
