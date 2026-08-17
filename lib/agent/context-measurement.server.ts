import "server-only";

import { asSchema, type ModelMessage } from "@ai-sdk/provider-utils";

import { stripRasterPayloads } from "./raster-payloads";
import {
  CORRECTION_RATIO_MAX,
  CORRECTION_RATIO_MIN,
  DEFAULT_CHARS_PER_TOKEN,
  FIXED_IMAGE_TOKEN_COST,
  UNCALIBRATED_CORRECTION_RATIO,
  priceBase64Chars,
  priceRasterPayloads,
} from "./token-budget";

const MESSAGE_FRAMING_TOKENS = 4;
const TOOL_FRAMING_TOKENS = 8;

/** Length past which a raw string is treated as inline binary rather than prose. */
const INLINE_BINARY_CHAR_THRESHOLD = 20_000;

/** Samples required before the learned ratio replaces the default. */
const CALIBRATION_MIN_SAMPLES = 3;

/**
 * Bumped whenever the estimator's output distribution changes, which orphans the
 * calibration samples learned against the previous generation.
 *
 * v2: raster payloads inside tool results are priced from their real base64
 * length (they measured as ~0 before), and the correction ratio may now fall
 * below 1.
 */
export const CONTEXT_ESTIMATOR_VERSION = 2;

export interface ContextCalibrationSnapshot {
  sampleCount: number;
  correctionRatio: number;
}

export interface PreparedPromptMeasurement {
  rawInputTokens: number;
  estimatedInputTokens: number;
  confidence: "low" | "calibrated";
  calibrationSampleCount: number;
  breakdown: {
    system: number;
    messages: number;
    tools: number;
    images: number;
    framing: number;
  };
}

/**
 * Strip inline binary from a payload and price it, so bytes are never counted at
 * the prose rate and never counted as free.
 *
 * Three pricing paths, in order of precedence:
 * 1. Raster payloads in the shapes `raster-payloads.ts` enumerates (`visuals[]`,
 *    `images[]`, `value[].image-data`) are priced from their real base64 length.
 *    These carry `mimeType` and no `type`/`mediaType`, so the structural check
 *    below never matched them — a 219 KB plot measured as zero tokens.
 * 2. Genuine model image parts (`{ type: "image" }`, `{ mediaType: "image/*" }`)
 *    carry no measurable inline bytes and are priced at the flat rate.
 * 3. Anything else long enough to be inline binary is priced at the base64 rate.
 *    Without this catch-all, blanking a string silently made it free.
 *
 * @param value - Message content of unknown shape.
 * @returns The sanitized value (safe to `JSON.stringify` for prose counting) and
 *   the token cost of everything removed from it.
 */
function sanitizeAndPriceImages(value: unknown): { value: unknown; imageTokens: number } {
  let imageTokens = 0;

  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (typeof input !== "object" || input === null) return input;

    const record = input as Record<string, unknown>;

    // Path 1: known raster shapes, priced from their real byte length. Tool
    // results reach this walker either bare or wrapped in `output`/`value`.
    const raster = priceRasterPayloads(record);
    if (raster.base64Chars > 0) {
      imageTokens += raster.tokens;
      // Re-walk the stripped record so siblings of the raster keys are still
      // measured. The stripped entries carry no bytes, so this cannot recurse.
      return visit(stripRasterPayloads(record, "[binary image omitted]").output);
    }

    // Path 2: genuine model image parts, which carry no bytes we can measure.
    //
    // Deliberately keyed on `type`/`mediaType` only. The `mimeType` spelling
    // belongs to the raster shapes, which path 1 has already priced from their
    // real byte length — charging the flat rate here too would bill them twice,
    // and would charge for entries the optimizer had already stripped to zero.
    const type = typeof record.type === "string" ? record.type : "";
    const mediaType = typeof record.mediaType === "string" ? record.mediaType : "";
    const isImageBearing = type.includes("image") || mediaType.startsWith("image/");
    if (isImageBearing) imageTokens += FIXED_IMAGE_TOKEN_COST;

    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => {
        if (isImageBearing && (key === "image" || key === "data" || key === "url")) {
          // Already priced at the flat rate above; do not double-charge.
          return [key, "[binary image omitted]"];
        }
        // Path 3: catch-all for inline binary in any other shape.
        if (
          (key === "data" || key === "url" || key === "image") &&
          typeof item === "string" &&
          (item.startsWith("data:") || item.length > INLINE_BINARY_CHAR_THRESHOLD)
        ) {
          imageTokens += priceBase64Chars(item.length);
          return [key, "[binary image omitted]"];
        }
        return [key, visit(item)];
      })
    );
  };

  return { value: visit(value), imageTokens };
}

/** Converts character length into the stable raw estimator unit. */
function charsToTokens(chars: number): number {
  return Math.ceil(chars / DEFAULT_CHARS_PER_TOKEN);
}

/** Clamps a number to an inclusive range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Measures the exact prepared prompt shape and applies persisted calibration. */
export async function measurePreparedPrompt(options: {
  messages: ModelMessage[];
  tools: Record<string, unknown>;
  calibration?: ContextCalibrationSnapshot;
}): Promise<PreparedPromptMeasurement> {
  let systemChars = 0;
  let messageChars = 0;
  let imageTokens = 0;

  for (const message of options.messages) {
    const sanitized = sanitizeAndPriceImages(message.content);
    imageTokens += sanitized.imageTokens;
    const chars = JSON.stringify(sanitized.value).length;
    if (message.role === "system") systemChars += chars;
    else messageChars += chars;
  }

  let toolChars = 0;
  for (const [name, rawTool] of Object.entries(options.tools)) {
    const tool = rawTool as {
      description?: string;
      inputSchema?: Parameters<typeof asSchema>[0];
    };
    const jsonSchema = tool.inputSchema ? await asSchema(tool.inputSchema).jsonSchema : {};
    toolChars += name.length + (tool.description?.length ?? 0) + JSON.stringify(jsonSchema).length;
  }

  const breakdown = {
    system: charsToTokens(systemChars),
    messages: charsToTokens(messageChars),
    tools: charsToTokens(toolChars),
    images: imageTokens,
    framing:
      options.messages.length * MESSAGE_FRAMING_TOKENS +
      Object.keys(options.tools).length * TOOL_FRAMING_TOKENS,
  };
  // Invariant relied on by the UI: the buckets are the whole of the raw estimate,
  // so a displayed breakdown can always be made to sum to its own total.
  const rawInputTokens = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  const sampleCount = options.calibration?.sampleCount ?? 0;
  const isCalibrated = sampleCount >= CALIBRATION_MIN_SAMPLES;
  const correctionRatio = isCalibrated
    ? clamp(
        options.calibration?.correctionRatio ?? UNCALIBRATED_CORRECTION_RATIO,
        CORRECTION_RATIO_MIN,
        CORRECTION_RATIO_MAX
      )
    : UNCALIBRATED_CORRECTION_RATIO;

  return {
    rawInputTokens,
    estimatedInputTokens: Math.ceil(rawInputTokens * correctionRatio),
    confidence: isCalibrated ? "calibrated" : "low",
    calibrationSampleCount: sampleCount,
    breakdown,
  };
}
