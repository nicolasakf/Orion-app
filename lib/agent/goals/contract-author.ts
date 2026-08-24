import { isToolUIPart, tool, type UIMessage } from "ai";

import {
  ASK_MODE_TOOLS,
  orionTools,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

import {
  GoalContractProposalResultSchema,
  GoalContractSchema,
  type GoalContract,
  type GoalContractProposalResult,
  type GoalSession,
} from "./types";

export const GOAL_CONTRACT_PROPOSAL_TOOL_NAME =
  "propose_goal_contract" as const;

/** Orion tools available while an agent is investigating a proposed goal contract. */
export const GOAL_CONTRACT_AUTHOR_ORION_TOOL_NAMES = [
  "list_kernels",
  "read_file",
  "read_notebook",
  "read_cell",
  "read_cell_output",
  "inspect_output",
  "execute_code",
  "bash",
  "await_command",
  "kill_command",
  "web_fetch",
  "web_search",
  "load_skill",
  "connections",
] as const satisfies readonly OrionToolName[];

/**
 * Investigation tool calls the contract author may spend before the proposal is
 * forced. Authoring is meant to scope the goal, not complete it: an unbounded
 * author burns the worker's budget solving the task, then writes a contract that
 * encodes the answer it already found.
 */
export const GOAL_CONTRACT_AUTHOR_MAX_INVESTIGATION_STEPS = 4;

/**
 * Counts investigation tool calls made in the current authoring pass. Each
 * proposal ends a pass, so a revision round starts from a fresh budget rather
 * than inheriting the spend of the contract the user just rejected.
 */
export function countGoalContractAuthorInvestigationSteps(
  messages: UIMessage[],
  goalMessageIndex: number,
): number {
  let steps = 0;
  for (
    let messageIndex = goalMessageIndex + 1;
    messageIndex < messages.length;
    messageIndex += 1
  ) {
    const message = messages[messageIndex];
    if (!message || message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (isGoalContractProposalPart(part)) {
        steps = 0;
        continue;
      }
      steps += 1;
    }
  }
  return steps;
}

/** Structured handoff tool that pauses contract authoring for a user decision. */
export const goalContractProposalTool = tool({
  description:
    "Present the task-specific measurable goal contract for user approval. Call this alone as the final action after investigating the request. Do not call it until the contract is ready for the user to review.",
  inputSchema: GoalContractSchema,
});

// The author already has a user channel — the proposal the user approves or
// sends back for revision. A second one would compete with the forced proposal
// step and let the phase stall on questions instead of producing a contract.
const { ask_question: _askQuestion, ...contractAuthorInvestigationTools } =
  ASK_MODE_TOOLS;

/** Phase-specific tools; this object is never added to ordinary interaction modes. */
export const goalContractAuthorTools = {
  ...contractAuthorInvestigationTools,
  execute_code: orionTools.execute_code,
  [GOAL_CONTRACT_PROPOSAL_TOOL_NAME]: goalContractProposalTool,
};

export type GoalContractDraftPhase =
  "inactive" | "authoring" | "awaiting_approval" | "awaiting_feedback";

export interface GoalContractDraftState {
  active: boolean;
  phase: GoalContractDraftPhase;
  goalMessageIndex: number | null;
  latestProposalToolCallId?: string;
  latestContract?: GoalContract;
}

export type GoalContractProposalUIPart = Extract<
  UIMessage["parts"][number],
  { type: `tool-${string}` }
>;

/** True when a UI part is the phase-specific contract proposal tool. */
export function isGoalContractProposalPart(
  part: UIMessage["parts"][number],
): part is GoalContractProposalUIPart {
  return (
    isToolUIPart(part) &&
    part.type === `tool-${GOAL_CONTRACT_PROPOSAL_TOOL_NAME}`
  );
}

/** Parses a proposal tool's contract input without trusting persisted chat data. */
export function parseGoalContractProposalInput(
  part: UIMessage["parts"][number],
): GoalContract | null {
  if (!isGoalContractProposalPart(part) || !("input" in part)) return null;
  const parsed = GoalContractSchema.safeParse(part.input);
  return parsed.success ? parsed.data : null;
}

/** Parses the user decision stored as a proposal tool output. */
export function parseGoalContractProposalResult(
  part: UIMessage["parts"][number],
): GoalContractProposalResult | null {
  if (!isGoalContractProposalPart(part) || !("output" in part)) return null;
  const parsed = GoalContractProposalResultSchema.safeParse(part.output);
  return parsed.success ? parsed.data : null;
}

/** True when a proposal part is still waiting on the user's approve/revise decision. */
export function isUndecidedGoalContractProposalPart(
  part: UIMessage["parts"][number],
): boolean {
  return (
    isGoalContractProposalPart(part) &&
    parseGoalContractProposalResult(part) === null
  );
}

/** Finds one proposal tool part by its stable tool-call id. */
export function findGoalContractProposalPart(
  messages: UIMessage[],
  toolCallId: string,
): GoalContractProposalUIPart | null {
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isGoalContractProposalPart(part) || part.toolCallId !== toolCallId)
        continue;
      return part;
    }
  }
  return null;
}

/** Finds and validates one proposal tool part by its stable tool-call id. */
export function findGoalContractProposal(
  messages: UIMessage[],
  toolCallId: string,
): { part: GoalContractProposalUIPart; contract: GoalContract } | null {
  const part = findGoalContractProposalPart(messages, toolCallId);
  if (!part) return null;
  const contract = parseGoalContractProposalInput(part);
  return contract ? { part, contract } : null;
}

/** Returns whether a user message persistently marks the start of contract authoring. */
function isGoalCommandMessage(message: UIMessage): boolean {
  if (message.role !== "user") return false;
  const metadata = message.metadata;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  )
    return false;
  if ((metadata as { goalContractDraft?: unknown }).goalContractDraft === true)
    return true;
  const slashCommands = (metadata as { slashCommands?: unknown }).slashCommands;
  if (!Array.isArray(slashCommands)) return false;
  return slashCommands.some((command) => {
    if (
      typeof command !== "object" ||
      command === null ||
      Array.isArray(command)
    )
      return false;
    return (command as { name?: unknown }).name === "goal";
  });
}

/** Compares validated contracts for the GoalSession recovery fallback. */
function contractsMatch(left: GoalContract, right: GoalContract): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Reconstructs the active contract-authoring phase from the durable transcript.
 * A matching GoalSession wins over a stale pending proposal after a partial save.
 */
export function deriveGoalContractDraftState(
  messages: UIMessage[],
  goalSession?: GoalSession | null,
): GoalContractDraftState {
  const goalMessageIndex = messages.findLastIndex(isGoalCommandMessage);
  if (goalMessageIndex < 0) {
    return { active: false, phase: "inactive", goalMessageIndex: null };
  }

  let latestProposal: UIMessage["parts"][number] | null = null;
  let latestProposalMessageIndex = -1;
  for (
    let messageIndex = goalMessageIndex + 1;
    messageIndex < messages.length;
    messageIndex += 1
  ) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (const part of message.parts) {
      if (isGoalContractProposalPart(part)) {
        latestProposal = part;
        latestProposalMessageIndex = messageIndex;
      }
    }
  }

  if (!latestProposal || !isToolUIPart(latestProposal)) {
    return { active: true, phase: "authoring", goalMessageIndex };
  }

  const contract = parseGoalContractProposalInput(latestProposal) ?? undefined;
  const result = parseGoalContractProposalResult(latestProposal);
  const base = {
    goalMessageIndex,
    latestProposalToolCallId: latestProposal.toolCallId,
    ...(contract ? { latestContract: contract } : {}),
  };

  if (result?.status === "approved") {
    return { ...base, active: false, phase: "inactive" };
  }
  if (
    contract &&
    goalSession &&
    contractsMatch(contract, goalSession.contract)
  ) {
    return { ...base, active: false, phase: "inactive" };
  }
  if (result?.status === "revision_requested") {
    const hasLaterConversation = messages
      .slice(latestProposalMessageIndex + 1)
      .some((message) => message.parts.length > 0);
    return {
      ...base,
      active: true,
      phase: hasLaterConversation ? "authoring" : "awaiting_feedback",
    };
  }
  if (latestProposal.state === "input-available") {
    return { ...base, active: true, phase: "awaiting_approval" };
  }
  if (latestProposal.state === "input-streaming") {
    return { ...base, active: true, phase: "authoring" };
  }
  return { ...base, active: true, phase: "authoring" };
}

/** Applies a proposal decision to UI messages without invoking the ordinary tool executor. */
export function applyGoalContractProposalResult(
  messages: UIMessage[],
  toolCallId: string,
  result: GoalContractProposalResult,
): UIMessage[] {
  let changed = false;
  const nextMessages = messages.map((message) => {
    const nextParts = message.parts.map((part) => {
      if (!isGoalContractProposalPart(part) || part.toolCallId !== toolCallId)
        return part;
      changed = true;
      return {
        ...part,
        state: "output-available" as const,
        output: result,
      } as UIMessage["parts"][number];
    });
    return nextParts.some((part, index) => part !== message.parts[index])
      ? { ...message, parts: nextParts }
      : message;
  });
  return changed ? nextMessages : messages;
}

/** True when the last assistant turn is waiting on or contains a proposal decision. */
export function lastAssistantTurnHasGoalContractProposal(
  messages: UIMessage[],
): boolean {
  const lastAssistant = messages.findLast(
    (message) => message.role === "assistant",
  );
  return Boolean(lastAssistant?.parts.some(isGoalContractProposalPart));
}
