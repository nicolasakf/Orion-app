/**
 * Token estimation and model-aware context-window budgeting.
 */

import type { UIMessage } from "ai";

// Type-only, so the cycle with `context-usage.ts` (which imports the compaction
// threshold from here) is erased at compile time rather than existing at runtime.
import type { AppendedTokenEstimate, DraftTokenEstimate } from "./context-usage";
import { summarizeRasterPayloads } from "./raster-payloads";

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

/** Flat token cost per image part carrying no inline bytes (e.g. a file reference). */
export const FIXED_IMAGE_TOKEN_COST = 1500;

/** Default chars-per-token ratio before calibration data is available. */
export const DEFAULT_CHARS_PER_TOKEN = 3.7;

/**
 * Base64 tokenizes far worse than prose — measured payloads land near 1 token
 * per 1.8 characters, roughly double what the prose ratio predicts. Pricing
 * inline raster bytes at the prose ratio is what let a single 219 KB plot slip
 * past the pre-send budget check.
 */
export const BASE64_CHARS_PER_TOKEN = 1.8;

/**
 * Correction applied to a raw estimate until enough real provider counts have
 * been observed to learn a per-model ratio. Lives here rather than beside the
 * measurement code so the storage layer can share it without pulling in
 * `server-only`.
 */
export const UNCALIBRATED_CORRECTION_RATIO = 1.15;

/**
 * Bounds on the learned calibration ratio.
 *
 * The lower bound is deliberately below 1: a systematic *over*estimate is as real
 * a failure as an underestimate, and flooring the ratio at 1 — as this did until
 * estimator version 2 — made it uncorrectable.
 */
export const CORRECTION_RATIO_MIN = 0.5;
export const CORRECTION_RATIO_MAX = 3;

// ────────────────────────────────────────────────────────────────────────────
// Raster pricing
// ────────────────────────────────────────────────────────────────────────────

export interface RasterPriceResult {
  /** Raster entries found, including entries whose bytes were already dropped. */
  entries: number;
  /** Base64 characters still carried by those entries. */
  base64Chars: number;
  /** Token cost of the bytes still present. */
  tokens: number;
}

/**
 * Price the raster payloads carried inside one tool result.
 *
 * This is the single pricing function for raster bytes. The client delta
 * estimator, the server prepared-prompt measurement, and any future consumer all
 * call it so the payload shapes enumerated in `raster-payloads.ts` cannot drift
 * apart — the exact drift that let a 219 KB plot be priced two different ways on
 * the two sides of the wire.
 *
 * @param output - A tool result payload of unknown shape.
 */
export function priceRasterPayloads(output: unknown): RasterPriceResult {
  const summary = summarizeRasterPayloads(output);
  return {
    entries: summary.count,
    base64Chars: summary.base64Chars,
    tokens: priceBase64Chars(summary.base64Chars),
  };
}

/** Token cost of raw base64 characters, which tokenize far worse than prose. */
export function priceBase64Chars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / BASE64_CHARS_PER_TOKEN);
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

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
// Delta estimation
//
// These functions price *additions* to a conversation that has already been
// measured server-side against its real prepared prompt. They deliberately take
// no system prompt, no tool set and no context window: they cannot know any of
// those, and the anchoring measurement already accounts for all three.
//
// Widening either of them into a whole-conversation estimator would recreate the
// two-estimator split this module was refactored to remove — where the client
// guessed the system prompt at a fixed 3000 characters, ignored tool schemas
// entirely, and produced a number that jumped whenever the server's real
// measurement arrived.
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

/**
 * Count attached image parts, which carry no inline bytes we can measure and so
 * are priced at a flat rate. Raster payloads inside tool results are measured
 * from their actual base64 length instead, via `priceRasterPayloads`.
 */
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
    }
  }
  return count;
}

/**
 * Price the composer draft the user has typed since the last server measurement.
 *
 * Delta-only by design — see the section note above.
 *
 * @param draft.text - Raw composer contents, not yet sent.
 * @param draft.imageAttachmentCount - Pending composer image attachments.
 * @param draft.referenceBlockChars - Length of the reference block the server will
 *   inline for the attached references.
 * @param opts.charsPerToken - Overrides the default prose ratio.
 */
export function estimateDraftTokens(
  draft: {
    text: string;
    imageAttachmentCount?: number;
    referenceBlockChars?: number;
  },
  opts?: { charsPerToken?: number }
): DraftTokenEstimate {
  const ratio = opts?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const textTokens = Math.ceil(draft.text.length / ratio);
  const referenceTokens = Math.ceil((draft.referenceBlockChars ?? 0) / ratio);
  const attachmentTokens = (draft.imageAttachmentCount ?? 0) * FIXED_IMAGE_TOKEN_COST;

  return {
    tokens: textTokens + referenceTokens + attachmentTokens,
    textTokens,
    referenceTokens,
    attachmentTokens,
  };
}

/**
 * Price messages that arrived after the anchoring measurement was taken —
 * typically the single assistant reply of the turn that just finished.
 *
 * Delta-only by design — see the section note above.
 *
 * @param messages - Messages appended since the anchor, in wire form.
 * @param opts.charsPerToken - Overrides the default prose ratio.
 */
export function estimateAppendedTokens(
  messages: UIMessage[],
  opts?: { charsPerToken?: number }
): AppendedTokenEstimate {
  const ratio = opts?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;

  let textChars = 0;
  let toolChars = 0;
  let rasterBase64Chars = 0;
  let imageCount = 0;

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue;
    imageCount += countImageParts(msg.parts as unknown[]);

    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        textChars += p.text.length;
      } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        if (p.state === "output-available") {
          // Inline raster bytes are billed at the base64 ratio below, so keep
          // them out of the prose-rate tool total rather than counting twice.
          const raster = priceRasterPayloads(p.output);
          rasterBase64Chars += raster.base64Chars;
          toolChars += Math.max(0, countTextChars(p.output) - raster.base64Chars);
        } else if (p.state === "input-available" || p.state === "input-streaming") {
          toolChars += countTextChars(p.input);
        }
      }
    }
  }

  const textTokens = Math.ceil(textChars / ratio);
  const toolTokens = Math.ceil(toolChars / ratio);
  const imageTokens =
    imageCount * FIXED_IMAGE_TOKEN_COST + priceBase64Chars(rasterBase64Chars);

  return {
    tokens: textTokens + toolTokens + imageTokens,
    textTokens,
    toolTokens,
    imageTokens,
  };
}
