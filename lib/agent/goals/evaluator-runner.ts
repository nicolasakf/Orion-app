"use client";

import {
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { parseJsonEventStream, type ParseResult } from "@ai-sdk/provider-utils";

import { optimizeMessagesForWire } from "@/lib/agent/context-optimizer";
import { guardToolText } from "@/lib/agent/tool-output-guard";
import type { AgentRule } from "@/lib/agent/rules";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { AgentContextSettings } from "@/lib/settings/schema";
import type { PlatformOS } from "@/lib/utils";

import {
  GoalVerdictSchema,
  type GoalArtifactManifest,
  type GoalContract,
  type GoalVerdict,
} from "./types";

const MAX_EVALUATOR_STEPS = 12;

/**
 * Raised when the evaluator uses its whole step budget without producing a
 * verdict. Typed so the caller can pause supervision instead of ending it:
 * a reviewer running out of reads says nothing about whether the goal is
 * reachable, so it must not be terminal for the goal.
 */
export class GoalEvaluatorStepLimitError extends Error {
  readonly steps: number;

  constructor(steps: number) {
    super(`Goal evaluator exceeded ${steps} model steps.`);
    this.name = "GoalEvaluatorStepLimitError";
    this.steps = steps;
  }
}

/**
 * True when an evaluation failure is about the reviewer's run rather than the
 * goal itself, so supervision should pause and stay resumable. A `fetch`
 * network error surfaces as a bare TypeError.
 */
export function isRecoverableGoalEvaluationError(error: unknown): boolean {
  return (
    error instanceof GoalEvaluatorStepLimitError || error instanceof TypeError
  );
}

const ALLOWED_EVALUATOR_TOOLS = new Set<OrionToolName>([
  "read_file",
  "read_notebook",
  "read_cell",
  "read_cell_output",
  "inspect_output",
]);

export interface RunGoalEvaluationOptions {
  contract: GoalContract;
  manifest: GoalArtifactManifest;
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
  contextSettings?: AgentContextSettings;
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
  const guarded = guardToolText(output, {
    maxChars: PERSISTED_TOOL_OUTPUT_CHAR_BUDGET,
  });
  return guarded.mode === "unchanged"
    ? part
    : ({ ...part, output: guarded.text } as UIMessage["parts"][number]);
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
  for await (const message of readUIMessageStream({ stream: chunks })) {
    if (message.role === "assistant") latest = message;
  }
  if (!latest) throw new Error("Goal evaluator returned no assistant message.");
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
  let messages: UIMessage[] = [{
    id: `goal-evaluator-${runId}-user`,
    role: "user",
    parts: [{ type: "text", text: "Inspect the goal artifacts and return the required verdict." }],
  }];
  options.onMessagesChange?.(cloneMessages(messages));

  for (let step = 0; step < MAX_EVALUATOR_STEPS; step += 1) {
    if (options.abortSignal?.aborted) {
      throw new DOMException("Goal evaluation was aborted.", "AbortError");
    }
    options.onStep?.(step);
    // The evaluator accumulates its whole isolated transcript and has no
    // compaction path, so without the optimizer every superseded notebook and
    // file read is resent verbatim on each step until the provider rejects it.
    const wireMessages = optimizeMessagesForWire(messages, {
      retentionTurns: options.contextSettings?.optimizerRetentionTurns,
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
        },
      }),
      signal: options.abortSignal,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(payload?.message ?? `Goal evaluator returned HTTP ${response.status}.`);
    }

    const assistantMessage = await readFinalEvaluatorMessage(response.body!);
    messages = [...messages, assistantMessage];
    options.onMessagesChange?.(cloneMessages(messages));
    const toolCalls = (assistantMessage.parts as unknown[]).filter(isEvaluatorToolCall);
    if (toolCalls.length === 0) {
      const text = assistantMessage.parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      return validateGoalEvaluatorVerdict(
        options.contract,
        parseGoalEvaluatorVerdict(text)
      );
    }

    const results = new Map<string, unknown>();
    await Promise.all(toolCalls.map(async (toolCall) => {
      const toolName = toolCall.type.slice("tool-".length) as OrionToolName;
      if (!ALLOWED_EVALUATOR_TOOLS.has(toolName)) {
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
  }

  throw new GoalEvaluatorStepLimitError(MAX_EVALUATOR_STEPS);
}
