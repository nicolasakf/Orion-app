"use client";

import {
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { parseJsonEventStream, type ParseResult } from "@ai-sdk/provider-utils";

import { optimizeMessagesForWire } from "@/lib/agent/context-optimizer";
import type { AgentRule } from "@/lib/agent/rules";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import { parseChatApiErrorMessage } from "@/lib/chat/chat-api-errors";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { PlatformOS } from "@/lib/utils";

import {
  GoalVerdictSchema,
  type GoalArtifactManifest,
  type GoalContract,
  type GoalWorkerNote,
  type GoalVerdict,
} from "./types";
import { isGoalEvaluatorToolName } from "./evaluator-tools";

/** Investigation steps one review may spend when the caller supplies no setting. */
export const DEFAULT_MAX_EVALUATOR_STEPS = 40;

/**
 * Round-trips spent only waiting on or killing a command the evaluator started.
 *
 * Waiting is not investigation: a review that starts one slow command should not
 * lose its budget to the polling it takes to see the result. Still bounded, so a
 * reviewer stuck in an await/kill cycle cannot run forever.
 */
const MAX_EVALUATOR_WAIT_STEPS = 15;

/** Tools whose round-trip is a wait rather than a unit of investigation. */
const EVALUATOR_WAIT_TOOL_NAMES = new Set<string>(["await_command", "kill_command"]);

/** Attempts allowed to re-emit a verdict that failed to parse or validate. */
const MAX_INVALID_VERDICT_RETRIES = 2;

/**
 * Tool results kept verbatim in the evaluator's own wire transcript.
 *
 * The evaluator has one user turn and no compaction, so the chat optimizer's
 * turn-based retention never protects it and its default 6-step window silently
 * stubs the reads a verdict has to cite — the reviewer then re-reads the same
 * artifacts and exhausts its budget. This window is sized to hold a whole review.
 */
const EVALUATOR_RETENTION_STEPS = 200;

/**
 * Raised when the evaluator uses its whole step budget without producing a
 * verdict. Typed so the caller can pause supervision instead of ending it:
 * a reviewer running out of reads says nothing about whether the goal is
 * reachable, so it must not be terminal for the goal.
 */
export class GoalEvaluatorStepLimitError extends Error {
  readonly steps: number;

  constructor(steps: number) {
    super(`Goal evaluator could not produce a verdict within ${steps} model steps.`);
    this.name = "GoalEvaluatorStepLimitError";
    this.steps = steps;
  }
}

/** A reviewer transport, provider, or output failure that is safe to retry. */
export class GoalEvaluatorRecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalEvaluatorRecoverableError";
  }
}

/** Extracts Orion's user-facing provider message without hiding plain errors. */
function goalEvaluatorErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return parseChatApiErrorMessage(rawMessage)?.message ?? rawMessage;
}

/**
 * True when an evaluation failure is about the reviewer's run rather than the
 * goal itself, so supervision should pause and stay resumable. A `fetch`
 * network error surfaces as a bare TypeError.
 */
export function isRecoverableGoalEvaluationError(error: unknown): boolean {
  return (
    error instanceof GoalEvaluatorStepLimitError ||
    error instanceof GoalEvaluatorRecoverableError ||
    error instanceof TypeError
  );
}

export interface RunGoalEvaluationOptions {
  contract: GoalContract;
  manifest: GoalArtifactManifest;
  workerNotes?: GoalWorkerNote[];
  priorVerdict?: GoalVerdict;
  modelId: string;
  providerId: ProviderId;
  modelSettings?: Record<string, unknown>;
  chatId: string;
  modelRequestId: string;
  workspaceDirectory?: string;
  rootDirectory?: string;
  notebookPath?: string;
  activeFilePath?: string;
  connectedNotebookPath?: string | null;
  agentRules?: AgentRule[];
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
  /** Investigation steps this review may spend before its verdict is forced. */
  maxSteps?: number;
  abortSignal?: AbortSignal;
  /**
   * Fires whenever the isolated evaluator transcript grows, so the supervisor
   * view can show the reviewer working instead of a blank panel.
   */
  onMessagesChange?: (messages: UIMessage[]) => void;
  executeToolCall: (
    toolName: OrionToolName,
    input: unknown,
    abortSignal?: AbortSignal
  ) => Promise<unknown>;
  onStep?: (step: number) => void;
}

function cloneMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
  })) as UIMessage[];
}

/** Per-tool-output ceiling for a stored transcript, well under the live budget. */
const PERSISTED_TOOL_OUTPUT_CHAR_BUDGET = 4_000;

/** Total ceiling for one stored evaluator transcript. */
const PERSISTED_TRANSCRIPT_CHAR_BUDGET = 200_000;

/** Truncates one stored tool output, leaving the rest of the part untouched. */
function shrinkToolOutput(part: UIMessage["parts"][number]): UIMessage["parts"][number] {
  if (!part.type.startsWith("tool-") || !("output" in part)) return part;
  const { output } = part;
  if (typeof output !== "string") return part;
  if (output.length <= PERSISTED_TOOL_OUTPUT_CHAR_BUDGET) return part;
  const marker = `\n\n[... ${output.length - PERSISTED_TOOL_OUTPUT_CHAR_BUDGET} characters omitted from persisted preview ...]\n\n`;
  const contentBudget = PERSISTED_TOOL_OUTPUT_CHAR_BUDGET - marker.length;
  const headLength = Math.ceil(contentBudget / 2);
  const tailLength = Math.floor(contentBudget / 2);
  const preview = `${output.slice(0, headLength)}${marker}${output.slice(-tailLength)}`;
  return { ...part, output: preview } as UIMessage["parts"][number];
}

/**
 * Shrinks an evaluator transcript for durable storage.
 *
 * Evaluator tool outputs carry whole notebook cells and file bodies, so a live
 * transcript is far too large to keep on every review. The wire optimizer stubs
 * superseded outputs, each surviving output is capped, and the oldest messages
 * are dropped last-in-first-kept because the verdict cites the newest reads.
 */
export function trimGoalEvaluatorTranscript(messages: UIMessage[]): UIMessage[] {
  const shrunk = optimizeMessagesForWire(messages, { retentionTurns: 1 }).map(
    (message) => ({
      ...message,
      parts: message.parts.map(shrinkToolOutput),
    })
  ) as UIMessage[];

  const kept: UIMessage[] = [];
  let usedChars = 0;
  for (let index = shrunk.length - 1; index >= 0; index -= 1) {
    const message = shrunk[index]!;
    const size = JSON.stringify(message).length;
    if (kept.length > 0 && usedChars + size > PERSISTED_TRANSCRIPT_CHAR_BUDGET) {
      break;
    }
    kept.unshift(message);
    usedChars += size;
  }
  return kept;
}

/** Reads one API response and returns the accumulated assistant message. */
async function readFinalEvaluatorMessage(
  body: ReadableStream<Uint8Array>
): Promise<UIMessage> {
  let latest: UIMessage | null = null;
  const chunks = parseJsonEventStream<UIMessageChunk>({
    stream: body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(chunk, controller) {
        if (!chunk.success) throw chunk.error;
        controller.enqueue(chunk.value);
      },
    })
  );
  try {
    for await (const message of readUIMessageStream({
      stream: chunks,
      terminateOnError: true,
    })) {
      if (message.role === "assistant") latest = message;
    }
  } catch (error) {
    throw new GoalEvaluatorRecoverableError(
      `Goal evaluator request failed: ${goalEvaluatorErrorMessage(error)}`,
    );
  }
  if (!latest) {
    throw new GoalEvaluatorRecoverableError(
      "Goal evaluator returned no assistant message.",
    );
  }
  return latest;
}

/** Recognizes a complete client-executed evaluator tool call. */
function isEvaluatorToolCall(part: unknown): part is {
  type: string;
  toolCallId: string;
  state: "input-available";
  input: unknown;
} {
  if (!part || typeof part !== "object") return false;
  const value = part as Record<string, unknown>;
  return (
    typeof value.type === "string" &&
    value.type.startsWith("tool-") &&
    value.state === "input-available" &&
    typeof value.toolCallId === "string"
  );
}

/** Parses the evaluator's final fenced or unfenced JSON verdict. */
export function parseGoalEvaluatorVerdict(text: string): GoalVerdict {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return GoalVerdictSchema.parse(JSON.parse(fenced?.[1] ?? trimmed));
}

/** Rejects evaluator output that omits, duplicates, or contradicts contract criteria. */
export function validateGoalEvaluatorVerdict(
  contract: GoalContract,
  verdict: GoalVerdict
): GoalVerdict {
  const expectedCriteria = new Set(
    contract.acceptanceCriteria.map((criterion) => criterion.id)
  );
  const returnedCriteria = new Set(verdict.criteria.map((criterion) => criterion.criterionId));
  if (
    returnedCriteria.size !== verdict.criteria.length ||
    returnedCriteria.size !== expectedCriteria.size ||
    [...expectedCriteria].some((criterionId) => !returnedCriteria.has(criterionId))
  ) {
    throw new Error("Goal evaluator did not return exactly one result for every criterion.");
  }
  if (
    verdict.status === "pass" &&
    verdict.criteria.some((criterion) => criterion.status !== "pass")
  ) {
    throw new Error("Goal evaluator returned a pass with unmet criteria.");
  }
  return verdict;
}

/** Runs a fresh, bounded, artifact-only evaluator transcript. */
export async function runGoalEvaluation(
  options: RunGoalEvaluationOptions
): Promise<GoalVerdict> {
  const runId = crypto.randomUUID();
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_EVALUATOR_STEPS);
  let messages: UIMessage[] = [{
    id: `goal-evaluator-${runId}-user`,
    role: "user",
    parts: [{ type: "text", text: "Inspect the goal artifacts and return the required verdict." }],
  }];
  options.onMessagesChange?.(cloneMessages(messages));

  let investigationSteps = 0;
  let waitSteps = 0;
  let invalidVerdictRetries = 0;
  // Every round-trip advances at least one of the three bounded counters, so the
  // loop cannot outlive their sum even if the reviewer keeps stalling.
  const maxIterations =
    maxSteps + MAX_EVALUATOR_WAIT_STEPS + MAX_INVALID_VERDICT_RETRIES + 1;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (options.abortSignal?.aborted) {
      throw new DOMException("Goal evaluation was aborted.", "AbortError");
    }
    options.onStep?.(investigationSteps);
    const investigationBudgetSpent = investigationSteps >= maxSteps;
    // The evaluator accumulates its whole isolated transcript and has no
    // compaction path, so without the optimizer every superseded notebook and
    // file read is resent verbatim on each step until the provider rejects it.
    // Its retention is deliberately its own: the chat window would stub the
    // reads this verdict has to cite, and the reviewer would re-read them.
    const wireMessages = optimizeMessagesForWire(messages, {
      retentionSteps: EVALUATOR_RETENTION_STEPS,
    });
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: wireMessages.map(({ id: _id, ...message }) => message),
        model: options.modelId,
        provider: options.providerId,
        modelSettings: options.modelSettings,
        chatId: options.chatId,
        modelRequestId: options.modelRequestId,
        workspaceDirectory: options.workspaceDirectory,
        rootDirectory: options.rootDirectory,
        notebookPath: options.notebookPath,
        activeFilePath: options.activeFilePath,
        connectedNotebookPath: options.connectedNotebookPath,
        agentRules: options.agentRules ?? [],
        serverInfo: options.serverInfo,
        jupyterServerIsLocal: options.jupyterServerIsLocal,
        clientPlatformOs: options.clientPlatformOs,
        agentCommunicationStyle: "pragmatic",
        origin: "goal_evaluation",
        goalEvaluation: {
          contract: options.contract,
          manifest: options.manifest,
          workerNotes: options.workerNotes ?? [],
          priorVerdict: options.priorVerdict,
          investigationBudget: maxSteps,
          investigationBudgetSpent,
        },
      }),
      signal: options.abortSignal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new GoalEvaluatorRecoverableError(
        payload?.message ?? `Goal evaluator returned HTTP ${response.status}.`,
      );
    }

    if (!response.body) {
      throw new GoalEvaluatorRecoverableError(
        "Goal evaluator returned an empty response body.",
      );
    }

    const assistantMessage = await readFinalEvaluatorMessage(response.body);
    messages = [...messages, assistantMessage];
    options.onMessagesChange?.(cloneMessages(messages));
    const toolCalls = (assistantMessage.parts as unknown[]).filter(isEvaluatorToolCall);
    if (toolCalls.length === 0 || investigationBudgetSpent) {
      const text = assistantMessage.parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      try {
        return validateGoalEvaluatorVerdict(
          options.contract,
          parseGoalEvaluatorVerdict(text),
        );
      } catch (error) {
        // A verdict that does not parse is a formatting slip, not a judgement
        // about the goal. Hand the reason back and let the reviewer re-emit it
        // rather than discarding a review's worth of completed investigation.
        const reason = goalEvaluatorErrorMessage(error);
        if (invalidVerdictRetries >= MAX_INVALID_VERDICT_RETRIES) {
          // Failing to finalize after the budget ran out is a reviewer that never
          // reached a verdict, not a one-off formatting slip: report it as the
          // step limit so the user is pointed at the budget they can raise.
          if (investigationBudgetSpent) {
            throw new GoalEvaluatorStepLimitError(maxSteps);
          }
          throw new GoalEvaluatorRecoverableError(
            `Goal evaluator returned an invalid verdict: ${reason}`,
          );
        }
        invalidVerdictRetries += 1;
        messages = [...messages, {
          id: `goal-evaluator-${runId}-verdict-retry-${invalidVerdictRetries}`,
          role: "user",
          parts: [{
            type: "text",
            text: `Your previous response was not a usable verdict: ${reason}\n\nReturn the corrected verdict now as one JSON object matching the required shape, and nothing else.`,
          }],
        }];
        options.onMessagesChange?.(cloneMessages(messages));
        continue;
      }
    }

    const results = new Map<string, unknown>();
    await Promise.all(toolCalls.map(async (toolCall) => {
      const toolName = toolCall.type.slice("tool-".length) as OrionToolName;
      if (!isGoalEvaluatorToolName(toolName)) {
        results.set(toolCall.toolCallId, `[BLOCKED] Tool '${toolName}' is not available to goal evaluators.`);
        return;
      }
      try {
        results.set(
          toolCall.toolCallId,
          await options.executeToolCall(toolName, toolCall.input, options.abortSignal)
        );
      } catch (error) {
        results.set(
          toolCall.toolCallId,
          `[ERROR] ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }));
    messages = [
      ...messages.slice(0, -1),
      {
        ...assistantMessage,
        parts: assistantMessage.parts.map((part) =>
          isEvaluatorToolCall(part)
            ? {
                ...part,
                state: "output-available" as const,
                output: results.get(part.toolCallId) ?? "[No output]",
              }
            : part
        ),
      },
    ];
    options.onMessagesChange?.(cloneMessages(messages));

    const isWaitOnlyStep = toolCalls.every((toolCall) =>
      EVALUATOR_WAIT_TOOL_NAMES.has(toolCall.type.slice("tool-".length))
    );
    if (isWaitOnlyStep && waitSteps < MAX_EVALUATOR_WAIT_STEPS) {
      waitSteps += 1;
    } else {
      investigationSteps += 1;
    }
  }

  throw new GoalEvaluatorStepLimitError(maxSteps);
}
