/**
 * Token estimation and model-aware context-window budgeting.
 */

import type { UIMessage } from "ai";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Assumed context window when model metadata is unavailable. */
export const UNKNOWN_CONTEXT_FALLBACK_TOKENS = 200_000;

/** Fraction of cap at which auto-compaction triggers before a send. */
export const COMPACTION_AUTO_THRESHOLD = 0.92;

/** Number of recent user-turn pairs kept verbatim by the optimizer. */
export const OPTIMIZER_RETENTION_TURNS = 6;

/** Number of recent assistant/tool steps kept verbatim during single-turn research loops. */
export const OPTIMIZER_RETENTION_STEPS = 6;

/** Number of recent user-turn pairs kept verbatim after a compaction. */
export const COMPACTION_RETENTION_TURNS = 4;

/** Flat token cost per image part (conservative estimate for typical plots). */
const FIXED_IMAGE_TOKEN_COST = 1500;

/** Default chars-per-token ratio before calibration data is available. */
const DEFAULT_CHARS_PER_TOKEN = 3.7;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TokenEstimate {
  /** Total estimated input tokens for the wire payload. */
  totalTokens: number;
  /** Usable input budget after output headroom is reserved. */
  cap: number;
  /** 0..1+ (may exceed 1.0 when over budget). */
  percentUsed: number;
  contextWindow: number;
  outputReserve: number;
  thresholdTokens: number;
  breakdown: {
    system: number;
    messages: number;
    tools: number;
    images: number;
    framing: number;
  };
}

/** Clamps a number to an inclusive range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Calculates adaptive reply headroom and the resulting usable input budget. */
export function calculateContextBudget(options: {
  contextWindow: number;
  maxOutputTokens?: number | null;
  autoCompactThreshold?: number;
}): { outputReserve: number; usableInputTokens: number; thresholdTokens: number } {
  const contextWindow = Math.max(1, Math.floor(options.contextWindow));
  const adaptiveReserve = clamp(Math.ceil(contextWindow * 0.05), 4096, 16384);
  const outputReserve = Math.min(
    adaptiveReserve,
    options.maxOutputTokens && options.maxOutputTokens > 0
      ? Math.floor(options.maxOutputTokens)
      : adaptiveReserve
  );
  const usableInputTokens = Math.max(1, contextWindow - outputReserve);
  const threshold = options.autoCompactThreshold ?? COMPACTION_AUTO_THRESHOLD;
  return {
    outputReserve,
    usableInputTokens,
    thresholdTokens: Math.floor(usableInputTokens * threshold),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Estimation
// ────────────────────────────────────────────────────────────────────────────

function countTextChars(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((s, v) => s + countTextChars(v), 0);
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (s, v) => s + countTextChars(v),
      0
    );
  }
  return 0;
}

function countImageParts(parts: unknown[]): number {
  let count = 0;
  for (const part of parts) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as Record<string, unknown>;
    if (
      p.type === "file" &&
      typeof p.mediaType === "string" &&
      p.mediaType.startsWith("image/")
    ) {
      count += 1;
      continue;
    }
    // DynamicToolUIPart or ToolUIPart with image output
    if (
      typeof p.type === "string" &&
      p.type.startsWith("tool-") &&
      p.state === "output-available"
    ) {
      const output = p.output;
      if (
        typeof output === "object" &&
        output !== null &&
        Array.isArray((output as Record<string, unknown>).images)
      ) {
        count += ((output as { images: unknown[] }).images ?? []).length;
      }
    }
  }
  return count;
}

/**
 * Estimate the number of input tokens for the given messages + system prompt.
 *
 * @param messages - Wire-ready UIMessage array (after optimizer pass).
 * @param systemPrompt - Agent system prompt string.
 * @param opts.contextWindow - Model's context window (used to compute cap).
 * @param opts.calibrationRatio - Override chars-per-token (default: 3.7).
 */
export function estimateMessageTokens(
  messages: UIMessage[],
  systemPrompt: string,
  opts: {
    contextWindow: number;
    maxOutputTokens?: number | null;
    autoCompactThreshold?: number;
    calibrationRatio?: number;
    additionalImageCount?: number;
  }
): TokenEstimate {
  const ratio = opts.calibrationRatio ?? DEFAULT_CHARS_PER_TOKEN;
  const budget = calculateContextBudget(opts);
  const cap = budget.usableInputTokens;

  // System prompt
  const systemChars = systemPrompt.length;
  const systemTokens = Math.ceil(systemChars / ratio);

  let msgTextChars = 0;
  let toolOutputChars = 0;
  let imageCount = 0;

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue;
    imageCount += countImageParts(msg.parts as unknown[]);

    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        msgTextChars += (p.text as string).length;
      } else if (
        typeof p.type === "string" &&
        p.type.startsWith("tool-")
      ) {
        if (p.state === "output-available") {
          toolOutputChars += countTextChars(p.output);
        } else if (p.state === "input-available" || p.state === "input-streaming") {
          // Count tool input arguments
          toolOutputChars += countTextChars(p.input);
        }
      }
    }
  }

  const imageTokens = (imageCount + (opts.additionalImageCount ?? 0)) * FIXED_IMAGE_TOKEN_COST;
  const msgTokens = Math.ceil(msgTextChars / ratio);
  const toolTokens = Math.ceil(toolOutputChars / ratio);

  const totalTokens = systemTokens + msgTokens + toolTokens + imageTokens;

  return {
    totalTokens,
    cap,
    percentUsed: cap > 0 ? totalTokens / cap : 1,
    contextWindow: opts.contextWindow,
    outputReserve: budget.outputReserve,
    thresholdTokens: budget.thresholdTokens,
    breakdown: {
      system: systemTokens,
      messages: msgTokens,
      tools: toolTokens,
      images: imageTokens,
      framing: 0,
    },
  };
}
