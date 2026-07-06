/**
 * Always-on wire optimizer: stubs old tool-result text and strips old images
 * before every send. Non-destructive — only affects the wire payload, never
 * the persisted chat history or the useChat message state.
 */

import type { UIMessage } from "ai";
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
    if (Array.isArray(o.value)) {
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

/** Count images in the output shape used by read_cell_output and similar. */
function outputImageCount(output: unknown): number {
  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.images)) return o.images.length;
    // Multimodal content array { type: "content", value: [...] }
    if (Array.isArray(o.value)) {
      return (o.value as unknown[]).filter(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          (v as Record<string, unknown>).type === "image-data"
      ).length;
    }
  }
  return 0;
}

function stubOutput(output: unknown, toolName: string): string {
  const chars = outputCharCount(output);
  const images = outputImageCount(output);
  let stub = `[${toolName}: ${chars} chars, stubbed for context]`;
  if (images > 0) {
    stub += `\n[${images} image(s) stripped for context]`;
  }
  return stub;
}

function hasLaterAssistantStep(messages: UIMessage[], messageIndex: number): boolean {
  return messages.slice(messageIndex + 1).some((message) => message.role === "assistant");
}

/** Remove raster bytes after a later model step has had a chance to review them. */
export function stripInspectedRasterData(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, messageIndex) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (!hasLaterAssistantStep(messages, messageIndex)) return part;
      if (!isOutputAvailableToolPart(part)) return part;
      const toolPart = part as unknown as Record<string, unknown>;
      const output = toolPart.output;
      if (typeof output !== "object" || output === null || Array.isArray(output)) return part;
      const visuals = (output as Record<string, unknown>).visuals;
      if (!Array.isArray(visuals)) return part;
      let changed = false;
      const nextVisuals = visuals.map((visual) => {
        if (typeof visual !== "object" || visual === null) return visual;
        const record = visual as Record<string, unknown>;
        if (!("data" in record)) return visual;
        changed = true;
        const { data: _data, ...withoutData } = record;
        return {
          ...withoutData,
          visualInspectionUnavailableReason: "raw preview removed after a subsequent model step",
        };
      });
      return changed
        ? ({ ...part, output: { ...(output as Record<string, unknown>), visuals: nextVisuals } } as typeof part)
        : part;
    }),
  })) as UIMessage[];
}

/**
 * Return the 0-based index of the first message that should be kept verbatim
 * (everything before this index is "old" and gets optimized).
 *
 * "Turns" are counted as user messages. We retain the last `retentionTurns`
 * user messages plus the assistant responses that follow them.
 */
function findRetentionCutoff(messages: UIMessage[], retentionTurns: number): number {
  if (retentionTurns <= 0) return 0;

  let userTurnCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnCount++;
      if (userTurnCount >= retentionTurns) {
        return i;
      }
    }
  }
  // Fewer user turns than retention window — keep everything
  return 0;
}

/**
 * Research loops usually happen inside one user turn, so user-turn retention
 * never trims them. Count assistant/tool steps from the end as a loop-aware cap.
 */
function findAgentStepRetentionCutoff(messages: UIMessage[], retentionSteps: number): number {
  if (retentionSteps <= 0) return 0;

  let assistantStepCount = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    if (!messages[i].parts.some((part) => part.type.startsWith("tool-"))) continue;
    assistantStepCount += 1;
    if (assistantStepCount >= retentionSteps) {
      return i;
    }
  }
  return 0;
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
  opts?: { retentionTurns?: number; retentionSteps?: number; researchActive?: boolean }
): UIMessage[] {
  const withoutInspectedRasterData = stripInspectedRasterData(messages);
  const retention = opts?.retentionTurns ?? OPTIMIZER_RETENTION_TURNS;
  const userTurnCutoffIdx = findRetentionCutoff(withoutInspectedRasterData, retention);
  const agentStepCutoffIdx = opts?.researchActive === true
    ? findAgentStepRetentionCutoff(
        withoutInspectedRasterData,
        opts?.retentionSteps ?? OPTIMIZER_RETENTION_STEPS
      )
    : 0;
  const cutoffIdx = Math.max(userTurnCutoffIdx, agentStepCutoffIdx);

  return withoutInspectedRasterData.map((msg, idx) => {
    const hasOldToolParts = msg.parts.some(
      (part) => part.type.startsWith("tool-") && (isOutputAvailableToolPart(part) || "input" in part)
    );
    if (!hasOldToolParts) return msg;

    return {
      ...msg,
      parts: msg.parts.map((part) => {
        if (!part.type.startsWith("tool-")) return part;
        const toolName = part.type.slice("tool-".length);
        const p = part as unknown as Record<string, unknown>;
        const oldByStepRetention = idx < cutoffIdx;
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

/**
 * Build the wire payload: apply compaction summary replay then optimize.
 * This is the single source of truth used by both the transport interceptor
 * and the pre-send token estimator.
 */
export function buildWirePayload(
  messages: UIMessage[],
  compactionSummary?: { text: string; coversThrough: string; createdAt: Date } | null,
  opts?: { retentionTurns?: number; retentionSteps?: number; researchActive?: boolean }
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
      wire = [syntheticUser, syntheticAsst, ...wire.slice(idx + 1)];
    }
  }

  return optimizeMessagesForWire(wire, opts);
}
