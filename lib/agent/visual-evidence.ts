import { z } from "zod";

import { stripRasterPayloads } from "./raster-payloads";
import { TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET, guardToolText } from "./tool-output-guard";

/** Raster MIME types that Orion can pass back to a vision-capable model. */
export const INSPECTABLE_RASTER_MIME_TYPES = ["image/png", "image/jpeg"] as const;

export const InspectableRasterMimeTypeSchema = z.enum(INSPECTABLE_RASTER_MIME_TYPES);
export type InspectableRasterMimeType = z.infer<typeof InspectableRasterMimeTypeSchema>;

/** One agent-generated raster output carried back to the model for review. */
export interface AgentVisualOutput {
  visualId: string;
  mimeType: InspectableRasterMimeType;
  data?: string;
  source: "execute_cell" | "execute_code" | "inspect_plotly_output";
  cellIndex?: number;
  outputIndex: number;
  byteLength: number;
  visualInspectionUnavailableReason?: string;
}

/** Structured result returned when execution produced inspectable raster output. */
export interface ExecutionToolResult {
  text: string;
  visuals: AgentVisualOutput[];
}

/** True when a tool result contains model-reviewable raster outputs. */
export function isExecutionToolResult(value: unknown): value is ExecutionToolResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && Array.isArray(record.visuals);
}

/** Applies context guardrails while retaining metadata needed for fallback review. */
export function guardExecutionToolResult(
  result: ExecutionToolResult,
  imageMaxBase64Chars = TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET
): ExecutionToolResult {
  return {
    text: guardToolText(result.text).text,
    visuals: result.visuals.map((visual) => {
      if (!visual.data || visual.data.length <= imageMaxBase64Chars) return visual;
      return {
        ...visual,
        data: undefined,
        visualInspectionUnavailableReason:
          `preview exceeded the ${imageMaxBase64Chars}-character image budget`,
      };
    }),
  };
}

/** Builds a smaller browser-generated preview without changing notebook output. */
async function resizeRasterPreview(
  visual: AgentVisualOutput,
  maxBase64Chars: number
): Promise<{ data: string; byteLength: number } | null> {
  if (!visual.data || typeof document === "undefined") return null;

  const image = new Image();
  image.src = `data:${visual.mimeType};base64,${visual.data}`;
  try {
    await image.decode();
  } catch {
    return null;
  }

  let scale = Math.min(0.9, Math.sqrt(maxBase64Chars / visual.data.length) * 0.9);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(visual.mimeType, visual.mimeType === "image/jpeg" ? 0.82 : undefined);
    const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (encoded.length <= maxBase64Chars) {
      return {
        data: encoded,
        byteLength: Math.floor((encoded.length * 3) / 4),
      };
    }
    scale *= 0.7;
  }
  return null;
}

/**
 * Applies model-capability handling to a tool result of *any* shape.
 *
 * `prepareExecutionToolResultForModel` only recognizes the `{ text, visuals }`
 * shape, so `read_cell_output` — which returns `{ text, images }` — used to slip
 * past it entirely: one such call in session 1786825713795 carried 255,707
 * characters of base64 to a model that then reported it could not read them.
 * Every other shape falls through to the shared walkers in `raster-payloads.ts`.
 */
export async function prepareToolResultForModel(options: {
  result: unknown;
  supportsImageInput: boolean;
  imageMaxBase64Chars: number;
}): Promise<unknown> {
  if (isExecutionToolResult(options.result)) {
    return prepareExecutionToolResultForModel({
      result: options.result,
      supportsImageInput: options.supportsImageInput,
      imageMaxBase64Chars: options.imageMaxBase64Chars,
    });
  }

  // A model without image input cannot use raster bytes in any shape, so drop
  // them rather than paying to ship them.
  if (!options.supportsImageInput) {
    const stripped = stripRasterPayloads(
      options.result,
      "the selected model does not support image input"
    );
    return stripped.changed ? stripped.output : options.result;
  }

  return options.result;
}

/** Prepares raster previews according to model capability and configured budget. */
export async function prepareExecutionToolResultForModel(options: {
  result: ExecutionToolResult;
  supportsImageInput: boolean;
  imageMaxBase64Chars: number;
}): Promise<ExecutionToolResult> {
  const visuals = await Promise.all(
    options.result.visuals.map(async (visual) => {
      if (!options.supportsImageInput) {
        return {
          ...visual,
          data: undefined,
          visualInspectionUnavailableReason: "the selected model does not support image input",
        };
      }
      if (!visual.data || visual.data.length <= options.imageMaxBase64Chars) return visual;
      const resized = await resizeRasterPreview(visual, options.imageMaxBase64Chars);
      return resized
        ? { ...visual, ...resized }
        : {
            ...visual,
            data: undefined,
            visualInspectionUnavailableReason:
              "Orion could not create a preview within the configured image budget",
          };
    })
  );
  return { ...options.result, visuals };
}
