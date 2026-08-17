/**
 * Shared guardrails for tool output size.
 *
 * The hot path must stay cheap: this module relies on string length checks and
 * slicing, without parsing or summarization.
 */

export const TOOL_OUTPUT_TEXT_CHAR_BUDGET = 10000 * 4;  // rule of thumb: 4 chars per token
/**
 * Base64 costs roughly one token per 1.8 characters, so this cap is worth about
 * 17k tokens — enough to read a chart, cheap enough to carry.
 *
 * The previous 200k budget was worth ~110k tokens *per preview*: a single
 * `execute_cell` step in session 1786825713795 returned two 128k-char figures,
 * both under the cap, and one call cost $1.66. `resizeRasterPreview` downscales
 * to fit this budget rather than dropping the preview outright.
 */
export const TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET = 30_000;
export const TOOL_OUTPUT_MAX_OMITTED_RATIO = 1 / 3;

/**
 * ANSI escape sequences: CSI (`ESC [ ... final`) plus OSC (`ESC ] ... BEL`).
 *
 * IPython colourizes tracebacks, so a single kernel error arrives wrapped in
 * hundreds of escape sequences that the model cannot use and that ride along in
 * every later prompt — one `EmptyDataError` in session 1786825713795 accounted
 * for 4,833 of them. Stripping keeps the frames and drops the paint.
 */
const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]/g;

/** Removes terminal colour codes while leaving the underlying text intact. */
export function stripAnsiEscapes(text: string): string {
  if (!text.includes("\u001B")) return text;
  return text.replace(ANSI_ESCAPE_PATTERN, "");
}

const DEFAULT_TRUNCATION_MARKER = "...[truncated for context safety]";
const DEFAULT_TOO_LARGE_MESSAGE =
  "Content is too large to read safely. Try a narrower query, smaller range, or a different tool approach.";

export type ToolTextGuardMode = "unchanged" | "truncated" | "too_large";

export interface GuardToolTextOptions {
  maxChars?: number;
  maxOmittedRatio?: number;
  truncationMarker?: string;
  tooLargeMessage?: string;
}

export interface GuardToolTextResult {
  text: string;
  mode: ToolTextGuardMode;
  originalChars: number;
  returnedChars: number;
  omittedChars: number;
  omittedRatio: number;
}

export interface GuardableImage {
  mimeType: string;
  data: string;
}

export interface GuardableMultimodalToolResult {
  text?: string;
  images?: GuardableImage[];
}

export interface GuardToolResultOptions extends GuardToolTextOptions {
  imageMaxBase64Chars?: number;
}

/**
 * Guard a single text blob using a two-level policy:
 * - small overflow: return a truncated preview
 * - large overflow: return a short fallback message
 */
export function guardToolText(
  rawText: string,
  options: GuardToolTextOptions = {}
): GuardToolTextResult {
  // Strip before measuring so the budget is spent on content, not colour codes.
  const text = stripAnsiEscapes(rawText);
  const maxChars = options.maxChars ?? TOOL_OUTPUT_TEXT_CHAR_BUDGET;
  const maxOmittedRatio = options.maxOmittedRatio ?? TOOL_OUTPUT_MAX_OMITTED_RATIO;
  const truncationMarker = options.truncationMarker ?? DEFAULT_TRUNCATION_MARKER;
  const tooLargeMessage = options.tooLargeMessage ?? DEFAULT_TOO_LARGE_MESSAGE;

  if (text.length <= maxChars) {
    return {
      text,
      mode: "unchanged",
      originalChars: text.length,
      returnedChars: text.length,
      omittedChars: 0,
      omittedRatio: 0,
    };
  }

  const separator = "\n\n";
  const marker = `${separator}${truncationMarker}`;
  const keepChars = Math.max(0, maxChars - marker.length);
  const omittedChars = Math.max(0, text.length - keepChars);
  const omittedRatio = text.length === 0 ? 0 : omittedChars / text.length;

  if (keepChars === 0 || omittedRatio > maxOmittedRatio) {
    const compactMessage = `${tooLargeMessage} [original size: ${text.length} chars]`;
    return {
      text: compactMessage,
      mode: "too_large",
      originalChars: text.length,
      returnedChars: compactMessage.length,
      omittedChars: text.length,
      omittedRatio: 1,
    };
  }

  const guardedText = text.slice(0, keepChars) + marker;
  return {
    text: guardedText,
    mode: "truncated",
    originalChars: text.length,
    returnedChars: guardedText.length,
    omittedChars,
    omittedRatio,
  };
}

/**
 * Guard the read_cell_output multimodal shape by truncating text and dropping
 * oversized images.
 */
export function guardMultimodalToolResult(
  result: GuardableMultimodalToolResult,
  options: GuardToolResultOptions = {}
): GuardableMultimodalToolResult {
  const imageMaxBase64Chars =
    options.imageMaxBase64Chars ?? TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET;

  const guardedText =
    typeof result.text === "string"
      ? guardToolText(result.text, options).text
      : undefined;

  const images = Array.isArray(result.images) ? result.images : [];
  const keptImages: GuardableImage[] = [];
  let droppedImageCount = 0;
  for (const image of images) {
    if (
      image &&
      typeof image.mimeType === "string" &&
      typeof image.data === "string" &&
      image.data.length <= imageMaxBase64Chars
    ) {
      keptImages.push(image);
    } else {
      droppedImageCount += 1;
    }
  }

  if (droppedImageCount === 0) {
    return {
      ...(guardedText ? { text: guardedText } : {}),
      ...(keptImages.length > 0 ? { images: keptImages } : {}),
    };
  }

  const imageGuardMessage =
    `[${droppedImageCount} image output(s) omitted: content too large to send safely. ` +
    "Try requesting a lower-resolution plot, a table/statistics summary, or a narrower output.]";
  const mergedText = guardedText
    ? `${guardedText}\n${imageGuardMessage}`
    : imageGuardMessage;

  return {
    text: mergedText,
    ...(keptImages.length > 0 ? { images: keptImages } : {}),
  };
}

/**
 * Guard generic tool outputs in a lightweight, shape-aware way.
 */
export function guardToolResult(
  output: unknown,
  options: GuardToolResultOptions = {}
): unknown {
  if (typeof output === "string") {
    return guardToolText(output, options).text;
  }

  if (isErrorResult(output)) {
    return {
      ...output,
      error: guardToolText(output.error, options).text,
    };
  }

  if (isMultimodalResult(output)) {
    return guardMultimodalToolResult(output, options);
  }

  return output;
}

/**
 * Type guard for `{ error: string }` tool results.
 */
function isErrorResult(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

/**
 * Type guard for multimodal tool output shape used by read_cell_output.
 */
function isMultimodalResult(value: unknown): value is GuardableMultimodalToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ("text" in value || "images" in value)
  );
}
