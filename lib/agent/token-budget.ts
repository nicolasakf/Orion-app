/**
 * Token estimation and per-chat calibration for context-window budgeting.
 *
 * Uses character-based heuristics calibrated from actual usage reports
 * (updated via `updateCalibration` after each `onFinish` callback).
 */

import type { UIMessage } from "ai";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Our enforced hard cap regardless of model context window. */
export const HARD_CAP_TOKENS = 200_000;

/** Fraction of cap at which auto-compaction triggers before a send. */
export const COMPACTION_AUTO_THRESHOLD = 0.92;

/** Number of recent user-turn pairs kept verbatim by the optimizer. */
export const OPTIMIZER_RETENTION_TURNS = 6;

/** Number of recent user-turn pairs kept verbatim after a compaction. */
export const COMPACTION_RETENTION_TURNS = 4;

/** Flat token cost per image part (conservative estimate for typical plots). */
const FIXED_IMAGE_TOKEN_COST = 1500;

/** Default chars-per-token ratio before calibration data is available. */
const DEFAULT_CHARS_PER_TOKEN = 3.7;

/** localStorage key prefix for calibration data. */
const CALIBRATION_KEY_PREFIX = "orion_token_cal_";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TokenEstimate {
  /** Total estimated input tokens for the wire payload. */
  totalTokens: number;
  /** Effective cap = min(HARD_CAP_TOKENS, model.contextWindow). */
  cap: number;
  /** 0..1+ (may exceed 1.0 when over budget). */
  percentUsed: number;
  breakdown: {
    system: number;
    messages: number;
    tools: number;
    images: number;
  };
}

interface CalibrationEntry {
  /** Running average of observed chars-per-token ratio for this chat. */
  charsPerToken: number;
  /** Number of observations used to build the average. */
  sampleCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Calibration helpers (localStorage-backed, best-effort)
// ────────────────────────────────────────────────────────────────────────────

function readCalibration(chatId: string): CalibrationEntry {
  if (typeof window === "undefined") {
    return { charsPerToken: DEFAULT_CHARS_PER_TOKEN, sampleCount: 0 };
  }
  try {
    const raw = localStorage.getItem(`${CALIBRATION_KEY_PREFIX}${chatId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CalibrationEntry;
      if (typeof parsed.charsPerToken === "number" && parsed.charsPerToken > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { charsPerToken: DEFAULT_CHARS_PER_TOKEN, sampleCount: 0 };
}

function writeCalibration(chatId: string, entry: CalibrationEntry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${CALIBRATION_KEY_PREFIX}${chatId}`,
      JSON.stringify(entry)
    );
  } catch {
    // Ignore estimation overflow.
  }
}

/**
 * Update the chars-per-token ratio for a chat from an actual usage report.
 * Uses an exponentially-weighted moving average (α = 0.3) so calibration
 * converges quickly while smoothing noisy single-call measurements.
 */
export function updateCalibration(
  chatId: string,
  observed: { chars: number; tokens: number }
): void {
  if (observed.chars <= 0 || observed.tokens <= 0) return;
  const newRatio = observed.chars / observed.tokens;
  const current = readCalibration(chatId);
  const alpha = 0.3;
  const updated: CalibrationEntry = {
    charsPerToken:
      current.sampleCount === 0
        ? newRatio
        : alpha * newRatio + (1 - alpha) * current.charsPerToken,
    sampleCount: current.sampleCount + 1,
  };
  writeCalibration(chatId, updated);
}

/** Get the current calibrated chars-per-token ratio for a chat (default 3.7). */
export function getCalibration(chatId: string): number {
  return readCalibration(chatId).charsPerToken;
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
  opts: { contextWindow: number; calibrationRatio?: number; additionalImageCount?: number }
): TokenEstimate {
  const ratio = opts.calibrationRatio ?? DEFAULT_CHARS_PER_TOKEN;
  const cap = Math.min(HARD_CAP_TOKENS, opts.contextWindow);

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
    breakdown: {
      system: systemTokens,
      messages: msgTokens,
      tools: toolTokens,
      images: imageTokens,
    },
  };
}
