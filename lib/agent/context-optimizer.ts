/**
 * Always-on wire optimizer: stubs old tool-result text and strips old images
 * before every send. Non-destructive — only affects the wire payload, never
 * the stored IndexedDB history or the useChat message state.
 */

import type { UIMessage } from "ai";
import { OPTIMIZER_RETENTION_TURNS } from "./token-budget";

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

function getToolName(part: Record<string, unknown>): string {
  const typeName = part.type as string;
  return typeName.startsWith("tool-") ? typeName.slice("tool-".length) : typeName;
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
  opts?: { retentionTurns?: number }
): UIMessage[] {
  const retention = opts?.retentionTurns ?? OPTIMIZER_RETENTION_TURNS;
  const cutoffIdx = findRetentionCutoff(messages, retention);
  if (cutoffIdx <= 0) return messages;

  return messages.map((msg, idx) => {
    if (idx >= cutoffIdx) return msg;

    const hasOldToolParts = msg.parts.some(isOutputAvailableToolPart);
    if (!hasOldToolParts) return msg;

    return {
      ...msg,
      parts: msg.parts.map((part) => {
        if (!isOutputAvailableToolPart(part)) return part;
        const p = part as Record<string, unknown>;
        return {
          ...p,
          output: stubOutput(p.output, getToolName(p)),
        };
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
  opts?: { retentionTurns?: number }
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
