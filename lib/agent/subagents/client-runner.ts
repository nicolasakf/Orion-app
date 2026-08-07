"use client";

/**
 * Orion Client-Side Subagent Runner
 *
 * Executes a subagent loop on the client by:
 *  1. Sending each model step to /api/chat (server handles model gen, maxSteps:1)
 *  2. Reading the returned UIMessage stream to get tool calls
 *  3. Executing tool calls locally through the injected `executeToolCall` (AssistantProvider)
 *  4. Feeding results back into the next step's message history
 *  5. Repeating until the model produces a final text response or is cancelled
 *
 * The subagent conversation is isolated from the parent chat history. The
 * final summary and tmp notebook path are returned to the parent as the
 * `delegate` tool output so later calls can reconnect to the same run.
 *
 * Shaped like AI SDK's ToolLoopAgent for future compatibility.
 */

import {
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { parseJsonEventStream, type ParseResult } from "@ai-sdk/provider-utils";

import { OrderedToolExecutionScheduler } from "@/lib/agent/tool-execution-scheduler";
import { DEFAULT_MAX_PARALLEL_READ_ONLY_CALLS } from "@/lib/agent/tool-execution-policy";
import { guardToolResult } from "@/lib/agent/tool-output-guard";
import type { OrionToolName } from "@/lib/agent/tool-schemas";

import type {
  RunSubagentOptions,
  RunSubagentResult,
  SubagentDefinition,
  SubagentPromptPayload,
} from "./types";

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Extract the OrionToolName from a UIMessage part type string.
 * UIMessage part types for tools use the pattern `tool-${toolName}`.
 */
function extractToolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

/**
 * Type guard for a UIMessage part that represents a pending tool call.
 * We only process parts that have finished streaming their input (input-available).
 */
function isToolCallPart(part: unknown): part is {
  type: string;
  toolCallId: string;
  state: "input-available";
  input: unknown;
} {
  if (typeof part !== "object" || part === null) return false;
  const p = part as Record<string, unknown>;
  return (
    typeof p.type === "string" &&
    p.type.startsWith("tool-") &&
    p.state === "input-available" &&
    typeof p.toolCallId === "string"
  );
}

/**
 * Read the response body from /api/chat as a UIMessage stream and return the
 * final accumulated assistant UIMessage.
 *
 * `readUIMessageStream` is the canonical AI SDK utility for this — it accepts
 * `ReadableStream<Uint8Array>` and yields accumulating UIMessage snapshots.
 */
async function readFinalUIMessage(responseBody: ReadableStream<Uint8Array>): Promise<UIMessage> {
  let lastAssistantMessage: UIMessage | null = null;

  const chunkStream = parseJsonEventStream<UIMessageChunk>({
    stream: responseBody,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error;
        }
        controller.enqueue(chunk.value);
      },
    })
  );

  for await (const message of readUIMessageStream({ stream: chunkStream })) {
    if (message.role === "assistant") {
      lastAssistantMessage = message;
    }
  }

  if (!lastAssistantMessage) {
    throw new Error("Subagent: no assistant message received from step");
  }

  return lastAssistantMessage;
}

/**
 * POST one step to /api/chat for the subagent.
 * Includes the agentPromptVariant so the server uses the subagent's system
 * prompt instead of the main agent's prompt.
 */
async function fetchSubagentStep(
  messages: UIMessage[],
  options: RunSubagentOptions,
  stepIndex: number,
  promptPayload: SubagentPromptPayload
): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ id: _id, ...message }) => message),
      model: options.modelId,
      provider: options.providerId,
      agentMode: true,
      workspaceDirectory: options.workspaceDirectory,
      rootDirectory: options.rootDirectory,
      notebookPath: options.notebookPath,
      activeFilePath: options.activeFilePath,
      agentRules: options.agentRules ?? [],
      serverInfo: options.serverInfo,
      jupyterServerIsLocal: options.jupyterServerIsLocal,
      clientPlatformOs: options.clientPlatformOs,
      modelSettings: options.modelSettings,
      origin: "subagent",
      subagentPrompt: promptPayload,
      ...(options.chatId ? { chatId: options.chatId } : {}),
      subagentDevLogInstance: options.subagentDevLogInstance,
      subagentStepIndex: stepIndex,
      // No chatSessionId, availableSkills, or forcedSkillName — sub-agent
      // steps use isolated message history; chatId is only for logging/DB linkage.
    }),
    signal: options.abortSignal,
  });
}

/**
 * Execute all pending tool calls from an assistant message. Notebook-defined
 * subagents can use the normal agent tool set, but recursive delegation is
 * blocked here.
 *
 * Returns a Map of toolCallId → result (string or error message).
 */
export async function executeSubagentToolCallPartsForTest(
  toolCallParts: Array<{ type: string; toolCallId: string; state: "input-available"; input: unknown }>,
  options: RunSubagentOptions
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  const scheduler = new OrderedToolExecutionScheduler(
    options.maxParallelReadOnlyCalls ?? DEFAULT_MAX_PARALLEL_READ_ONLY_CALLS,
    options.abortSignal
  );

  const scheduledCalls = toolCallParts.map((part) => {
    const toolName = extractToolName(part.type) as OrionToolName;
    return scheduler.schedule(toolName, async () => {
      options.onToolStart?.(part.toolCallId);

      // Hard block tools that are reserved for the parent agent.
      if (toolName === "delegate" || toolName === "update_memory") {
        results.set(
          part.toolCallId,
          toolName === "delegate"
            ? "[BLOCKED] Sub-agents cannot call the `delegate` tool. Recursive sub-agent spawning is not supported."
            : "[BLOCKED] Sub-agents cannot call `update_memory`. Durable memory updates are reserved for the parent agent."
        );
        options.onToolEnd?.(part.toolCallId);
        return;
      }

      try {
        const rawResult = await options.executeToolCall(
          toolName,
          part.input,
          options.abortSignal
        );
        results.set(part.toolCallId, guardToolResult(rawResult));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.set(
          part.toolCallId,
          `[ERROR] Tool "${toolName}" threw an exception: ${message}`
        );
      } finally {
        options.onToolEnd?.(part.toolCallId);
      }
    });
  });

  await Promise.allSettled(scheduledCalls);

  return results;
}

function resolveSubagent(options: RunSubagentOptions): SubagentDefinition {
  const subagent = options.availableSubagents.find((candidate) => candidate.name === options.subagentType);
  if (!subagent) {
    const available = options.availableSubagents.map((candidate) => candidate.name).join(", ");
    throw new Error(
      `Sub-agent "${options.subagentType}" was not found. Available sub-agents: ${available || "none"}`
    );
  }
  return subagent;
}

function createRunId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return random.replace(/[^a-zA-Z0-9-]/g, "");
}

function cloneMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
  })) as UIMessage[];
}

// ============================================================================
// Public runner
// ============================================================================

/**
 * Run a sub-agent loop on the client using the parent agent's tool executor.
 *
 * The caller (RightSidebar) intercepts the `delegate` tool call and delegates
 * here. The runner runs completely independently of the parent `useChat`
 * session — it manages its own message history and calls `/api/chat` directly.
 *
 * @param options - Configuration for this invocation (subagent type, model,
 *   provider, task description, injected tool executor, optional abort signal).
 * @returns The sub-agent's final summary text and metadata.
 * @throws If a network error occurs, if the server returns an error response,
 *   or if the AbortSignal is triggered.
 */
export async function runSubagent(options: RunSubagentOptions): Promise<RunSubagentResult> {
  if (options.abortSignal?.aborted) {
    throw new DOMException("Sub-agent run was aborted.", "AbortError");
  }

  const def = resolveSubagent(options);
  const runId = createRunId();
  const reconnectTmpNotebookPath = options.reconnectTmpNotebookPath?.trim();
  const reconnected = !!reconnectTmpNotebookPath;
  const tmpNotebookPath = reconnected
    ? reconnectTmpNotebookPath!
    : await options.createTmpNotebookCopy(def, runId);
  options.onTmpNotebookPath?.(tmpNotebookPath);
  const promptPayload: SubagentPromptPayload = {
    name: def.name,
    label: def.label,
    originalNotebookPath: def.location,
    tmpNotebookPath,
    systemPrompt: def.systemPrompt,
  };

  const followUpMessage: UIMessage = {
    id: `subagent-${runId}-user`,
    role: "user",
    parts: [{ type: "text", text: options.description }],
  };

  // Isolated conversation history for this sub-agent session. Reconnect mode
  // continues from a persisted transcript, then appends the new user request.
  let messages: UIMessage[] = reconnected
    ? [...cloneMessages(options.reconnectMessages ?? []), followUpMessage]
    : [followUpMessage];
  options.onMessagesChange?.(cloneMessages(messages));

  for (let step = 0; ; step++) {
    // ---- Cooperative cancellation ----------------------------------------
    if (options.abortSignal?.aborted) {
      throw new DOMException("Sub-agent run was aborted.", "AbortError");
    }

    // Notify caller that the sub-agent is making an LLM call (thinking)
    options.onStepProgress?.(step, []);

    // ---- Model step: POST to /api/chat ------------------------------------
    let response: Response;
    try {
      response = await fetchSubagentStep(messages, options, step, promptPayload);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Sub-agent "${def.label}" failed to reach /api/chat: ${msg}`);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errBody = (await response.json()) as { message?: string; title?: string };
        errorMessage = errBody.message ?? errBody.title ?? errorMessage;
      } catch {
        // ignore JSON parse error on error body
      }
      throw new Error(`Sub-agent "${def.label}" step ${step + 1} error: ${errorMessage}`);
    }

    // ---- Parse stream → final assistant UIMessage ------------------------
    let assistantMessage: UIMessage;
    try {
      assistantMessage = await readFinalUIMessage(response.body!);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Sub-agent "${def.label}" stream parse failed at step ${step + 1}: ${msg}`);
    }
    messages = [...messages, assistantMessage];
    options.onMessagesChange?.(cloneMessages(messages));

    // ---- Check whether model wants to call tools -------------------------
    const pendingToolCalls = (assistantMessage.parts as unknown[]).filter(isToolCallPart);

    if (pendingToolCalls.length === 0) {
      // No tool calls → this is the sub-agent's final text response
      const textPart = assistantMessage.parts.find(
        (p): p is { type: "text"; text: string } => p.type === "text" && "text" in p
      );
      const summary = textPart?.text ?? "[Sub-agent produced no text response]";

      return {
        summary,
        tmpNotebookPath,
        reconnected,
        stepsUsed: step + 1,
        stoppedByLimit: false,
      };
    }

    // Notify caller which tools are about to be executed
    const calledToolNames = pendingToolCalls.map(
      (p) => extractToolName(p.type) as OrionToolName
    );
    options.onStepProgress?.(step, calledToolNames);

    // ---- Execute tool calls locally via AssistantProvider -----------------
    const toolResults = await executeSubagentToolCallPartsForTest(pendingToolCalls, options);

    // ---- Build the completed assistant message for the next step ----------
    // Mark each tool call part as output-available with its result, so the
    // server's convertToModelMessages() correctly reconstructs tool results
    // in the model message history.
    const messageWithResults: UIMessage = {
      id: assistantMessage.id,
      role: "assistant",
      parts: assistantMessage.parts.map((p) => {
        if (isToolCallPart(p)) {
          const output = toolResults.get(p.toolCallId);
          return {
            ...(p as Record<string, unknown>),
            state: "output-available" as const,
            output: output ?? "[No output]",
          } as UIMessage["parts"][number];
        }
        return p;
      }),
    };

    messages = [...messages.slice(0, -1), messageWithResults];
    options.onMessagesChange?.(cloneMessages(messages));
  }
}
