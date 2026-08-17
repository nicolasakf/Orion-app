/**
 * Always-on wire optimizer: stubs old tool-result text and strips old images
 * before every send. Non-destructive — only affects the wire payload, never
 * the persisted chat history or the useChat message state.
 */

import type { UIMessage } from "ai";
import { stripRasterPayloads, summarizeRasterPayloads } from "./raster-payloads";
import { OPTIMIZER_RETENTION_STEPS, OPTIMIZER_RETENTION_TURNS } from "./token-budget";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** True when the part is a tool call with output already available. */
function isOutputAvailableToolPart(
  part: unknown
): part is Record<string, unknown> {
  if (typeof part !== "object" || part === null) return false;
  const p = part as Record<string, unknown>;
  return (
    typeof p.type === "string" &&
    p.type.startsWith("tool-") &&
    p.state === "output-available"
  );
}

/** Approximate char count for any output shape. */
function outputCharCount(output: unknown): number {
  if (typeof output === "string") return output.length;
  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    let n = typeof o.text === "string" ? o.text.length : 0;
    if (typeof o.error === "string") n += o.error.length;
    // `value` is a plain string for text results and an array for content results.
    if (typeof o.value === "string") {
      n += o.value.length;
    } else if (Array.isArray(o.value)) {
      for (const v of o.value) {
        if (typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).text === "string") {
          n += ((v as { text: string }).text).length;
        }
      }
    }
    return n;
  }
  return 0;
}

/** Count raster previews across every tool-result shape that can carry them. */
function outputImageCount(output: unknown): number {
  return summarizeRasterPayloads(output).count;
}

/**
 * Substring every optimizer stub carries. Exported so log tooling can tell a
 * working optimizer from a silently no-op one without duplicating the wording.
 */
export const TOOL_OUTPUT_STUB_MARKER = "stubbed for context";

function stubOutput(output: unknown, toolName: string): string {
  const chars = outputCharCount(output);
  const images = outputImageCount(output);
  let stub = `[${toolName}: ${chars} chars, ${TOOL_OUTPUT_STUB_MARKER}. Re-read it if you still need it.]`;
  if (images > 0) {
    stub += `\n[${images} image(s) stripped for context]`;
  }
  return stub;
}

/**
 * A position in the conversation at part granularity.
 *
 * An agent tool loop is a single assistant message whose `parts` array grows by
 * one step per model call, so message indices alone cannot separate "old" work
 * from "recent" work. Every retention decision here is therefore a
 * (message, part) pair rather than a message index.
 */
interface StepPosition {
  messageIndex: number;
  partIndex: number;
}

/** Retain-everything sentinel: nothing in the conversation is old. */
const KEEP_ALL: StepPosition = { messageIndex: 0, partIndex: 0 };

function isBefore(a: StepPosition, b: StepPosition): boolean {
  if (a.messageIndex !== b.messageIndex) return a.messageIndex < b.messageIndex;
  return a.partIndex < b.partIndex;
}

/** The later of two positions, so the tighter retention window wins. */
function latestPosition(a: StepPosition, b: StepPosition): StepPosition {
  return isBefore(a, b) ? b : a;
}

/**
 * True when any assistant message carries an explicit `step-start` marker.
 *
 * The AI SDK emits one per model call, which is the most faithful notion of a
 * step. Histories predating it (or produced by a provider that omits it) fall
 * back to counting tool parts, which is one-per-step in practice.
 */
function hasExplicitStepMarkers(messages: UIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some((part) => part.type === "step-start")
  );
}

/** Walk every assistant part from newest to oldest. */
function* assistantPartsFromEnd(
  messages: UIMessage[]
): Generator<{ position: StepPosition; part: UIMessage["parts"][number] }> {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      yield { position: { messageIndex, partIndex }, part: message.parts[partIndex] };
    }
  }
}

/**
 * True when the model has taken at least one step since the given part, so a
 * raster preview carried there has already had its chance to be reviewed.
 *
 * A step can show up two ways: as a later assistant *message* (multi-message
 * histories, where the model replied after seeing the image), or as a later
 * step boundary *inside* the same message (agent loops, where every step is
 * another `step-start` and tool part on one growing assistant message).
 */
function hasLaterAssistantStep(messages: UIMessage[], position: StepPosition): boolean {
  const laterMessageIsAssistant = messages
    .slice(position.messageIndex + 1)
    .some((message) => message.role === "assistant");
  if (laterMessageIsAssistant) return true;

  const message = messages[position.messageIndex];
  if (message?.role !== "assistant") return false;

  return message.parts
    .slice(position.partIndex + 1)
    .some((part) => part.type === "step-start" || part.type.startsWith("tool-"));
}

/**
 * Remove raster bytes after a later model step has had a chance to review them.
 * Covers every raster shape a tool result can use — see `raster-payloads.ts`.
 */
export function stripInspectedRasterData(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, messageIndex) => ({
    ...message,
    parts: message.parts.map((part, partIndex) => {
      if (!isOutputAvailableToolPart(part)) return part;
      if (!hasLaterAssistantStep(messages, { messageIndex, partIndex })) {
        return part;
      }
      const toolPart = part as unknown as Record<string, unknown>;
      const stripped = stripRasterPayloads(toolPart.output);
      return stripped.changed
        ? ({ ...part, output: stripped.output } as typeof part)
        : part;
    }),
  })) as UIMessage[];
}

/** Reason recorded on previews dropped before a conversation is written to disk. */
const RASTER_NOT_PERSISTED_REASON =
  "raw preview not persisted; the notebook holds the original output";

/**
 * Drop raster bytes from every tool result regardless of position.
 *
 * Position-aware stripping is the right policy on the wire, where the newest
 * preview still has to reach the model. Storage has no such requirement: the
 * notebook holds the real outputs, so persisting base64 only inflates the row
 * and makes every reload rehydrate it. Session 1786825713795 wrote a single
 * 1,216,570-byte assistant message this way.
 */
export function stripAllRasterData(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (!isOutputAvailableToolPart(part)) return part;
      const toolPart = part as unknown as Record<string, unknown>;
      const stripped = stripRasterPayloads(toolPart.output, RASTER_NOT_PERSISTED_REASON);
      return stripped.changed
        ? ({ ...part, output: stripped.output } as typeof part)
        : part;
    }),
  })) as UIMessage[];
}

/**
 * Return the first position that should be kept verbatim (everything before it
 * is "old" and gets optimized).
 *
 * "Turns" are counted as user messages. We retain the last `retentionTurns`
 * user messages plus the assistant responses that follow them.
 */
function findRetentionCutoff(messages: UIMessage[], retentionTurns: number): StepPosition {
  if (retentionTurns <= 0) return KEEP_ALL;

  let userTurnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnCount++;
      if (userTurnCount >= retentionTurns) {
        return { messageIndex: i, partIndex: 0 };
      }
    }
  }
  // Fewer user turns than retention window — keep everything
  return KEEP_ALL;
}

/**
 * Agent tool loops run inside a single user turn *and* a single assistant
 * message, so neither user-turn nor message-level retention trims them. Count
 * step boundaries backwards through the parts themselves — that is the only
 * granularity at which a 38-step loop has anything to trim.
 */
function findAgentStepRetentionCutoff(
  messages: UIMessage[],
  retentionSteps: number
): StepPosition {
  if (retentionSteps <= 0) return KEEP_ALL;

  const useStepMarkers = hasExplicitStepMarkers(messages);
  let stepCount = 0;

  for (const { position, part } of assistantPartsFromEnd(messages)) {
    const isBoundary = useStepMarkers
      ? part.type === "step-start"
      : part.type.startsWith("tool-");
    if (!isBoundary) continue;

    stepCount += 1;
    if (stepCount >= retentionSteps) return position;
  }

  // Fewer steps than the retention window — keep everything
  return KEEP_ALL;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return a shallow-cloned messages array where tool-result outputs older than
 * `retentionTurns` user turns are replaced by compact stubs and images are
 * stripped. User messages and assistant text parts are never altered.
 */
export function optimizeMessagesForWire(
  messages: UIMessage[],
  opts?: { retentionTurns?: number; retentionSteps?: number }
): UIMessage[] {
  const withoutInspectedRasterData = stripInspectedRasterData(messages);
  const retention = opts?.retentionTurns ?? OPTIMIZER_RETENTION_TURNS;
  const userTurnCutoff = findRetentionCutoff(withoutInspectedRasterData, retention);
  const agentStepCutoff = findAgentStepRetentionCutoff(
    withoutInspectedRasterData,
    opts?.retentionSteps ?? OPTIMIZER_RETENTION_STEPS
  );
  const cutoff = latestPosition(userTurnCutoff, agentStepCutoff);

  return withoutInspectedRasterData.map((msg, idx) => {
    const hasOldToolParts = msg.parts.some(
      (part) => part.type.startsWith("tool-") && (isOutputAvailableToolPart(part) || "input" in part)
    );
    if (!hasOldToolParts) return msg;

    return {
      ...msg,
      parts: msg.parts.map((part, partIndex) => {
        if (!part.type.startsWith("tool-")) return part;
        const toolName = part.type.slice("tool-".length);
        const p = part as unknown as Record<string, unknown>;
        const oldByStepRetention = isBefore({ messageIndex: idx, partIndex }, cutoff);
        if (!oldByStepRetention) return part;

        const next = { ...p };
        if (isOutputAvailableToolPart(part)) {
          next.output = stubOutput(p.output, toolName);
        }
        return next;
      }),
    } as UIMessage;
  }) as UIMessage[];
}

/** True for the placeholder turns `buildWirePayload` injects around a summary. */
export function isSyntheticCompactionMessageId(id: string): boolean {
  return id.startsWith("compaction-u-") || id.startsWith("compaction-a-");
}

/**
 * Build the wire payload: apply compaction summary replay then optimize.
 * This is the single source of truth used by both the transport interceptor
 * and the pre-send token estimator.
 *
 * When the summary swallowed the turn that is still being worked on, the
 * summary carries `resumeFromMessageId` and that user message is re-issued
 * verbatim after the summary so the model still has something to act on.
 */
export function buildWirePayload(
  messages: UIMessage[],
  compactionSummary?: {
    text: string;
    coversThrough: string;
    createdAt: Date;
    resumeFromMessageId?: string;
  } | null,
  opts?: { retentionTurns?: number; retentionSteps?: number }
): UIMessage[] {
  let wire = messages;

  if (compactionSummary) {
    const idx = wire.findIndex((m) => m.id === compactionSummary.coversThrough);
    if (idx >= 0) {
      const ts = compactionSummary.createdAt.getTime();
      const syntheticUser: UIMessage = {
        id: `compaction-u-${ts}`,
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: `Prior conversation summary:\n${compactionSummary.text}`,
          },
        ],
      };
      const syntheticAsst: UIMessage = {
        id: `compaction-a-${ts}`,
        role: "assistant",
        parts: [
          {
            type: "text" as const,
            text: "Got it. Continuing from here.",
          },
        ],
      };
      // Only replay a resume message that the summary actually absorbed;
      // anything after the boundary is already carried by the tail below.
      const resumeIdx = compactionSummary.resumeFromMessageId
        ? wire.findIndex((m) => m.id === compactionSummary.resumeFromMessageId)
        : -1;
      const resumeMessage =
        resumeIdx >= 0 && resumeIdx <= idx && wire[resumeIdx].role === "user"
          ? wire[resumeIdx]
          : undefined;
      wire = [
        syntheticUser,
        syntheticAsst,
        ...(resumeMessage ? [resumeMessage] : []),
        ...wire.slice(idx + 1),
      ];
    }
  }

  return optimizeMessagesForWire(wire, opts);
}
