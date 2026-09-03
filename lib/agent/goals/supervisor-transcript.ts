import type { UIMessage } from "ai";

import type { GoalEvaluation, GoalSession } from "./types";

/**
 * Returns the reviewer's own messages for one evaluation, preferring the live
 * transcript while it is still running.
 *
 * The evaluator's closing message is its raw verdict JSON; the formatted review
 * that follows already says all of it, so that text is dropped rather than
 * printed twice.
 */
function evaluatorTranscriptMessages(
  evaluation: GoalEvaluation,
  liveTranscript?: UIMessage[] | null
): UIMessage[] {
  const source = liveTranscript ?? (evaluation.transcript as UIMessage[] | undefined);
  if (!source || source.length === 0) return [];
  const last = source.at(-1);
  const trimmed =
    last?.role === "assistant" &&
    !last.parts.some((part) => part.type.startsWith("tool-"))
      ? source.slice(0, -1)
      : source;
  return trimmed.map((message, index) => ({
    ...message,
    id: `${evaluation.id}-transcript-${index}`,
  }));
}

/** Builds the read-only outer-loop transcript shown from the goal status card. */
export function buildGoalSupervisorMessages(
  session: GoalSession,
  liveEvaluatorTranscript?: UIMessage[] | null
): UIMessage[] {
  const contractLines = [
    "## Initial instruction sent to worker",
    "",
    session.contract.objective,
    "",
    "### Deliverables",
    ...session.contract.deliverables.map(
      (deliverable) => `- \`${deliverable.path}\` — ${deliverable.description}`
    ),
    "",
    "### Acceptance criteria",
    ...session.contract.acceptanceCriteria.map(
      (criterion) => `- **${criterion.id}:** ${criterion.description}`
    ),
  ];
  const messages: UIMessage[] = [{
    id: `${session.id}-initial-worker-instruction`,
    role: "user",
    parts: [{ type: "text", text: contractLines.join("\n") }],
    metadata: {
      goalMessage: {
        source: "supervisor",
        kind: "kickoff",
        goalSessionId: session.id,
      },
    },
  }];

  const runningEvaluationId = session.evaluations.at(-1)?.verdict
    ? null
    : session.evaluations.at(-1)?.id ?? null;

  for (const evaluation of session.evaluations) {
    const verdict = evaluation.verdict;
    if (!verdict) {
      messages.push({
        id: `${evaluation.id}-pending-review`,
        role: "assistant",
        parts: [{
          type: "text",
          text: evaluation.error
            ? `## Supervisor review ${evaluation.reviewNumber}: error\n\n${evaluation.error}`
            : `## Supervisor review ${evaluation.reviewNumber}\n\nReviewing the saved artifacts…`,
        }],
      });
    } else {
      const reviewLines = [
        `## Supervisor review ${evaluation.reviewNumber}: ${verdict.status}`,
        "",
        verdict.summary,
        "",
        "### Criteria",
        ...verdict.criteria.flatMap((criterion) => [
          `- **${criterion.criterionId}: ${criterion.status}** — ${criterion.explanation}`,
          ...criterion.evidence.map((evidence) =>
            `  - \`${evidence.path}\`${evidence.location ? ` (${evidence.location})` : ""}: ${evidence.observation}`
          ),
        ]),
      ];
      messages.push({
        id: `${evaluation.id}-review`,
        role: "assistant",
        parts: [{ type: "text", text: reviewLines.join("\n") }],
      });
    }

    for (const note of evaluation.workerNotes) {
      const relatedPaths = note.relatedPaths.length > 0
        ? `\n\nRelated paths:\n${note.relatedPaths.map((path) => `- \`${path}\``).join("\n")}`
        : "";
      messages.push({
        id: `${evaluation.id}-worker-note-${note.id}`,
        role: "user",
        parts: [{
          type: "text",
          text: `## Worker message\n\n${note.message}${relatedPaths}`,
        }],
        metadata: {
          goalMessage: {
            source: "worker",
            kind: "note",
            goalSessionId: session.id,
            reviewNumber: evaluation.reviewNumber,
            evaluationId: evaluation.id,
          },
        },
      });
    }
    messages.push(
      ...evaluatorTranscriptMessages(
        evaluation,
        evaluation.id === runningEvaluationId ? liveEvaluatorTranscript : null
      )
    );
    if (!verdict) continue;
    if (verdict.status === "revise" && verdict.repairInstruction) {
      messages.push({
        id: `${evaluation.id}-worker-instruction`,
        role: "user",
        parts: [{
          type: "text",
          text: `## Supervisor instruction sent to worker\n\n${verdict.repairInstruction}`,
        }],
        metadata: {
          goalMessage: {
            source: "supervisor",
            kind: "repair",
            goalSessionId: session.id,
            reviewNumber: evaluation.reviewNumber,
            evaluationId: evaluation.id,
          },
        },
      });
    }
  }

  // Without this the panel is empty for the whole first work cycle, which reads
  // as "the goal was never started" — the worker runs in the main chat, and the
  // first review only exists once its turn finishes.
  if (session.status === "active" && session.phase === "working") {
    messages.push({
      id: `${session.id}-worker-working-${session.evaluations.length}`,
      role: "assistant",
      parts: [{
        type: "text",
        text: [
          "## Worker in progress",
          "",
          "The worker is running in the main chat. Supervisor review " +
            `${session.reviewCount + 1} of ${session.maxReviews} starts once its turn finishes.`,
        ].join("\n"),
      }],
    });
  }
  return messages;
}
