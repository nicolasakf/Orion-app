import type { UIMessage } from "ai";
import { z } from "zod";

export const RESEARCH_SESSION_MAX_STEPS = 60;
export const RESEARCH_SESSION_BUDGET_WARNING_STEP = Math.floor(RESEARCH_SESSION_MAX_STEPS * 0.9);
export const RESEARCH_SESSION_MAX_STALLED_STEPS = 2;

export type ResearchSessionActivation = "explore-mode" | "slash";
export type ResearchSessionIntensity = "light" | "standard" | "deep";
export type ResearchNudge =
  | "document_evidence"
  | "recover_progress"
  | "synthesize_soon"
  | "final_synthesis";

export const ResearchNudgeSchema = z.enum([
  "document_evidence",
  "recover_progress",
  "synthesize_soon",
  "final_synthesis",
]);

export const ResearchSessionSnapshotSchema = z.object({
  active: z.boolean().catch(false).default(false),
  activation: z.preprocess(
    (value) => (value === "research-mode" ? "explore-mode" : value),
    z.enum(["explore-mode", "slash"]).nullable().catch(null).default(null),
  ),
  objective: z.string().catch("").default(""),
  profile: z.string().catch("general").default("general"),
  intensity: z.enum(["light", "standard", "deep"]).catch("standard").default("standard"),
  stepCount: z.number().int().min(0).catch(0).default(0),
  stalledStepCount: z.number().int().min(0).catch(0).default(0),
  undocumentedEvidenceSteps: z.number().int().min(0).catch(0).default(0),
  proseOnlyContinuationUsed: z.boolean().catch(false).default(false),
  recoveryNudgeIssued: z.boolean().catch(false).default(false),
  synthesisNudgeIssued: z.boolean().catch(false).default(false),
  finalSynthesisRequested: z.boolean().catch(false).default(false),
});

export interface ResearchSessionSnapshot {
  active: boolean;
  activation: ResearchSessionActivation | null;
  objective: string;
  profile: string;
  intensity: ResearchSessionIntensity;
  stepCount: number;
  stalledStepCount: number;
  undocumentedEvidenceSteps: number;
  proseOnlyContinuationUsed: boolean;
  recoveryNudgeIssued: boolean;
  synthesisNudgeIssued: boolean;
  finalSynthesisRequested: boolean;
}

export interface ResearchTurnActivity {
  completedToolCount: number;
  successfulSubstantiveToolCount: number;
  evidenceProduced: boolean;
  markdownDocumented: boolean;
  proseOnly: boolean;
}

export interface ResearchContinuationDecision {
  session: ResearchSessionSnapshot;
  continue: boolean;
  nudge?: ResearchNudge;
  reason: string;
  terminal?: boolean;
}

const EMPTY_SESSION: ResearchSessionSnapshot = {
  active: false,
  activation: null,
  objective: "",
  profile: "general",
  intensity: "standard",
  stepCount: 0,
  stalledStepCount: 0,
  undocumentedEvidenceSteps: 0,
  proseOnlyContinuationUsed: false,
  recoveryNudgeIssued: false,
  synthesisNudgeIssued: false,
  finalSynthesisRequested: false,
};

const SUBSTANTIVE_TOOL_NAMES = new Set([
  "use_notebook",
  "read_notebook",
  "read_cell",
  "read_cell_output",
  "inspect_output",
  "insert_cell",
  "delete_cell",
  "overwrite_cell_source",
  "edit_orion_metadata",
  "execute_cell",
  "execute_code",
  "restart_notebook",
  "bash",
  "await_command",
  "read_file",
  "edit_file",
  "web_fetch",
  "web_search",
  "delegate",
]);

/** Tools that return kernel output when asked to run the cells they wrote. */
const CELL_MUTATION_TOOL_NAMES = new Set(["insert_cell", "overwrite_cell_source"]);

const EVIDENCE_TOOL_NAMES = new Set([
  "execute_cell",
  "execute_code",
  "read_cell",
  "read_cell_output",
  "inspect_output",
  "read_notebook",
  "bash",
  "web_fetch",
  "web_search",
]);

/** Creates an inactive research session snapshot. */
export function createInactiveResearchSession(): ResearchSessionSnapshot {
  return { ...EMPTY_SESSION };
}

/** Starts a notebook-native research session. */
export function createResearchSession(options: {
  objective: string;
  profile?: string;
  intensity?: ResearchSessionIntensity;
  activation?: ResearchSessionActivation;
}): ResearchSessionSnapshot {
  return {
    ...EMPTY_SESSION,
    active: true,
    activation: options.activation ?? "explore-mode",
    objective: options.objective.trim() || "Explore mode investigation",
    profile: options.profile?.trim() || "general",
    intensity: options.intensity ?? "standard",
  };
}

function isToolPart(part: UIMessage["parts"][number]): boolean {
  return part.type.startsWith("tool-");
}

function getToolName(part: UIMessage["parts"][number]): string {
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "";
}

function isCompletedToolPart(part: UIMessage["parts"][number]): boolean {
  return (
    isToolPart(part) &&
    "state" in part &&
    (part.state === "output-available" || part.state === "output-error")
  );
}

function unwrapToolOutputValue(output: unknown): unknown {
  if (typeof output !== "object" || output === null || Array.isArray(output)) return output;
  const record = output as Record<string, unknown>;
  return record.type === "json" && "value" in record ? record.value : output;
}

function toolPartSucceeded(part: UIMessage["parts"][number]): boolean {
  if (!isCompletedToolPart(part)) return false;
  if ("state" in part && part.state === "output-error") return false;
  const record = part as unknown as Record<string, unknown>;
  if (typeof record.errorText === "string" && record.errorText.length > 0) {
    return false;
  }
  const output = "output" in part ? unwrapToolOutputValue(part.output) : undefined;
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const error = (output as Record<string, unknown>).error;
    if (typeof error === "string" && error.length > 0) return false;
  }
  return true;
}

function outputHasEvidence(output: unknown): boolean {
  const value = unwrapToolOutputValue(output);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "[No output generated]";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim().length > 0) return true;
  if (Array.isArray(record.visuals) && record.visuals.length > 0) return true;
  if (Array.isArray(record.images) && record.images.length > 0) return true;
  if (Array.isArray(record.value) && record.value.length > 0) return true;
  return Object.keys(record).length > 0;
}

/**
 * Whether a cell mutation call asked to run the cells it wrote.
 *
 * `insert_cell` and `overwrite_cell_source` return kernel output when
 * `execute` is true, so those calls are as much evidence as `execute_cell` is.
 */
function inputRequestedExecution(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  return (input as Record<string, unknown>).execute === true;
}

function inputHasInsertedMarkdown(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const cells = (input as Record<string, unknown>).cells;
  if (!Array.isArray(cells)) return false;
  return cells.some((cell) => {
    if (typeof cell !== "object" || cell === null || Array.isArray(cell)) return false;
    return (cell as Record<string, unknown>).cellType === "markdown";
  });
}

function looksLikeMarkdownSource(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("- ") ||
    trimmed.startsWith("* ") ||
    /\b(observation|decision|finding|limitation|next step|synthesis)\b/i.test(trimmed)
  );
}

function inputLooksLikeMarkdownOverwrite(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const cells = (input as Record<string, unknown>).cells;
  if (!Array.isArray(cells)) return false;
  return cells.some((cell) => {
    if (typeof cell !== "object" || cell === null || Array.isArray(cell)) return false;
    const newSource = (cell as Record<string, unknown>).newSource;
    return typeof newSource === "string" && looksLikeMarkdownSource(newSource);
  });
}

/** Derives research-loop activity from one assistant message. */
export function getResearchTurnActivity(message: UIMessage | undefined): ResearchTurnActivity {
  if (!message || message.role !== "assistant") {
    return {
      completedToolCount: 0,
      successfulSubstantiveToolCount: 0,
      evidenceProduced: false,
      markdownDocumented: false,
      proseOnly: false,
    };
  }

  const toolParts = message.parts.filter(isToolPart);
  const completedToolParts = toolParts.filter(isCompletedToolPart);
  let successfulSubstantiveToolCount = 0;
  let evidenceProduced = false;
  let markdownDocumented = false;

  for (const part of completedToolParts) {
    const toolName = getToolName(part);
    const succeeded = toolPartSucceeded(part);
    if (succeeded && SUBSTANTIVE_TOOL_NAMES.has(toolName)) successfulSubstantiveToolCount += 1;
    const output = "output" in part ? part.output : undefined;
    const input = "input" in part ? part.input : undefined;
    const producesEvidence =
      EVIDENCE_TOOL_NAMES.has(toolName) ||
      (CELL_MUTATION_TOOL_NAMES.has(toolName) && inputRequestedExecution(input));
    if (succeeded && producesEvidence && outputHasEvidence(output)) {
      evidenceProduced = true;
    }
    if (
      succeeded &&
      ((toolName === "insert_cell" && inputHasInsertedMarkdown(input)) ||
        (toolName === "overwrite_cell_source" && inputLooksLikeMarkdownOverwrite(input)))
    ) {
      markdownDocumented = true;
    }
  }

  return {
    completedToolCount: completedToolParts.length,
    successfulSubstantiveToolCount,
    evidenceProduced,
    markdownDocumented,
    proseOnly: toolParts.length === 0 && message.parts.some((part) => part.type === "text"),
  };
}

/** Advances the lightweight research session and selects any soft nudge for the next turn. */
export function advanceResearchSessionForContinuation(
  session: ResearchSessionSnapshot,
  activity: ResearchTurnActivity
): ResearchContinuationDecision {
  if (!session.active) {
    return { session, continue: false, reason: "inactive" };
  }

  const madeProgress = activity.successfulSubstantiveToolCount > 0;
  let next: ResearchSessionSnapshot = {
    ...session,
    stepCount: session.stepCount + 1,
    stalledStepCount: madeProgress ? 0 : session.stalledStepCount + 1,
    undocumentedEvidenceSteps: activity.markdownDocumented
      ? 0
      : session.undocumentedEvidenceSteps + (activity.evidenceProduced ? 1 : 0),
  };

  if (session.finalSynthesisRequested && (madeProgress || activity.proseOnly)) {
    return {
      session: { ...next, active: false },
      continue: false,
      reason: "final_synthesis_complete",
      terminal: true,
    };
  }

  if (next.stepCount >= RESEARCH_SESSION_MAX_STEPS) {
    // Stopping cold on the budget cap throws away the run: the notebook keeps
    // every piece of evidence but never says what it means, which is the most
    // expensive way to end. Spend one final step on synthesis first. The branch
    // above terminates on the very next call, so this cannot extend the run
    // further than that.
    if (!next.finalSynthesisRequested) {
      next = { ...next, finalSynthesisRequested: true };
      return {
        session: next,
        continue: true,
        nudge: "final_synthesis",
        reason: "budget_final_synthesis",
      };
    }
    return {
      session: { ...next, active: false },
      continue: false,
      reason: "step_budget_exhausted",
      terminal: true,
    };
  }

  if (!next.synthesisNudgeIssued && next.stepCount >= RESEARCH_SESSION_BUDGET_WARNING_STEP) {
    next = { ...next, synthesisNudgeIssued: true };
    return { session: next, continue: true, nudge: "synthesize_soon", reason: "budget_warning" };
  }

  if (next.undocumentedEvidenceSteps > 0) {
    return { session: next, continue: true, nudge: "document_evidence", reason: "undocumented_evidence" };
  }

  if (activity.proseOnly && !next.proseOnlyContinuationUsed) {
    next = { ...next, proseOnlyContinuationUsed: true };
    return { session: next, continue: true, nudge: "recover_progress", reason: "prose_only" };
  }

  if (next.stalledStepCount >= RESEARCH_SESSION_MAX_STALLED_STEPS) {
    if (!next.recoveryNudgeIssued) {
      next = { ...next, recoveryNudgeIssued: true };
      return { session: next, continue: true, nudge: "recover_progress", reason: "stalled_recovery" };
    }
    if (!next.finalSynthesisRequested) {
      next = { ...next, finalSynthesisRequested: true };
      return { session: next, continue: true, nudge: "final_synthesis", reason: "stalled_final_synthesis" };
    }
    return {
      session: { ...next, active: false },
      continue: false,
      reason: "stalled_after_final_synthesis",
      terminal: true,
    };
  }

  return { session: next, continue: true, reason: "continue" };
}

/** Short dynamic prompt suffix for an active research session. */
export function summarizeResearchSessionForPrompt(options: {
  session: ResearchSessionSnapshot;
  nudge?: ResearchNudge;
}): string {
  const { session, nudge } = options;
  if (!session.active) return "";

  const lines = [
    "## Explore Session",
    "",
    `Objective: ${session.objective}`,
    `Profile: ${session.profile}; step ${session.stepCount}/${RESEARCH_SESSION_MAX_STEPS}.`,
  ];
  if (session.undocumentedEvidenceSteps > 0) {
    lines.push(
      `${session.undocumentedEvidenceSteps} evidence-producing step(s) still need notebook markdown interpretation.`
    );
  }
  if (nudge) {
    lines.push(`Current nudge: ${researchNudgeToInstruction(nudge)}`);
  }
  return lines.join("\n");
}

/** Converts a soft nudge into model-facing instruction text. */
export function researchNudgeToInstruction(nudge: ResearchNudge): string {
  switch (nudge) {
    case "document_evidence":
      return "Before the next analysis code step, add a concise markdown cell explaining what the latest evidence showed and the research decision it motivates.";
    case "recover_progress":
      return "Take one concrete research action now: read, run, edit, or synthesize in the notebook. Do not reply with only a status update.";
    case "synthesize_soon":
      return "The automatic research budget is nearly exhausted. Start converging on a synthesis notebook section instead of opening new branches.";
    case "final_synthesis":
      return "Write a final notebook markdown status or synthesis section covering findings so far, decisions made, remaining open questions, and limitations, then stop.";
  }
}
