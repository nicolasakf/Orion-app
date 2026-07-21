import "server-only";

import { asSchema, type ModelMessage } from "@ai-sdk/provider-utils";

const CHARS_PER_TOKEN = 3.7;
const IMAGE_TOKENS = 1500;
const MESSAGE_FRAMING_TOKENS = 4;
const TOOL_FRAMING_TOKENS = 8;

export const CONTEXT_ESTIMATOR_VERSION = 1;

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

/** Counts image-bearing objects while avoiding base64 bytes in text estimation. */
function sanitizeAndCountImages(value: unknown): { value: unknown; images: number } {
  let images = 0;
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (typeof input !== "object" || input === null) return input;

    const record = input as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const mediaType = typeof record.mediaType === "string" ? record.mediaType : "";
    const isImageBearing = type.includes("image") || mediaType.startsWith("image/");
    if (isImageBearing) images += 1;

    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => {
        if (
          isImageBearing &&
          (key === "image" || key === "data" || key === "url")
        ) {
          return [key, "[binary image omitted]"];
        }
        if (
          (key === "data" || key === "url") &&
          typeof item === "string" &&
          (item.startsWith("data:image/") || item.length > 20_000)
        ) {
          return [key, "[binary image omitted]"];
        }
        return [key, visit(item)];
      })
    );
  };
  return { value: visit(value), images };
}

/** Converts character length into the stable raw estimator unit. */
function charsToTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Measures the exact prepared prompt shape and applies persisted calibration. */
export async function measurePreparedPrompt(options: {
  messages: ModelMessage[];
  tools: Record<string, unknown>;
  calibration?: ContextCalibrationSnapshot;
}): Promise<PreparedPromptMeasurement> {
  let systemChars = 0;
  let messageChars = 0;
  let imageCount = 0;

  for (const message of options.messages) {
    const sanitized = sanitizeAndCountImages(message.content);
    imageCount += sanitized.images;
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
    images: imageCount * IMAGE_TOKENS,
    framing:
      options.messages.length * MESSAGE_FRAMING_TOKENS +
      Object.keys(options.tools).length * TOOL_FRAMING_TOKENS,
  };
  const rawInputTokens = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const sampleCount = options.calibration?.sampleCount ?? 0;
  const correctionRatio =
    sampleCount >= 3 ? Math.max(1, options.calibration?.correctionRatio ?? 1) : 1.15;

  return {
    rawInputTokens,
    estimatedInputTokens: Math.ceil(rawInputTokens * correctionRatio),
    confidence: sampleCount >= 3 ? "calibrated" : "low",
    calibrationSampleCount: sampleCount,
    breakdown,
  };
}
