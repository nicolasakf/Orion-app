/**
 * Shared handling for raster payloads carried inside tool results.
 *
 * Three output shapes reach the wire today and any of them can hold hundreds of
 * kilobytes of base64:
 * - `visuals[]` — execute_cell / execute_code / inspect_output
 * - `images[]` — read_cell_output
 * - `value[]` entries with `type: "image-data"` — AI SDK content arrays
 *
 * Keeping the walkers in one dependency-free module means the wire optimizer and
 * the token estimator cannot drift on which shapes they recognize.
 */

/** Default explanation recorded when a preview is dropped from the wire payload. */
export const RASTER_STRIPPED_REASON = "raw preview removed after a subsequent model step";

export interface RasterPayloadSummary {
  /** Raster entries found, including entries whose bytes were already dropped. */
  count: number;
  /** Base64 characters still carried by those entries. */
  base64Chars: number;
}

const EMPTY_SUMMARY: RasterPayloadSummary = { count: 0, base64Chars: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Base64 length carried by one raster entry, in any of the supported shapes. */
function entryBase64Chars(entry: unknown): number {
  if (!isRecord(entry)) return 0;
  return typeof entry.data === "string" ? entry.data.length : 0;
}

/** True for AI SDK content-array entries that carry raw image bytes. */
function isImageDataEntry(entry: unknown): boolean {
  return isRecord(entry) && entry.type === "image-data";
}

/**
 * Count raster entries and their remaining base64 payload across every shape.
 *
 * @param output - A tool result payload of unknown shape.
 */
export function summarizeRasterPayloads(output: unknown): RasterPayloadSummary {
  if (!isRecord(output)) return EMPTY_SUMMARY;

  let count = 0;
  let base64Chars = 0;

  const visuals = output.visuals;
  if (Array.isArray(visuals)) {
    count += visuals.length;
    for (const visual of visuals) base64Chars += entryBase64Chars(visual);
  }

  const images = output.images;
  if (Array.isArray(images)) {
    count += images.length;
    for (const image of images) base64Chars += entryBase64Chars(image);
  }

  const value = output.value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isImageDataEntry(entry)) continue;
      count += 1;
      base64Chars += entryBase64Chars(entry);
    }
  }

  return { count, base64Chars };
}

/** Appends a note to an output's text field without clobbering an existing one. */
function withAppendedText(output: Record<string, unknown>, note: string): Record<string, unknown> {
  const existing = typeof output.text === "string" ? output.text : "";
  return { ...output, text: existing ? `${existing}\n${note}` : note };
}

/**
 * Remove raw raster bytes from a tool result while leaving the surrounding
 * result readable.
 *
 * `visuals[]` entries are kept so their metadata and the reason survive;
 * `images[]` and `image-data` content entries are dropped entirely, because
 * downstream `toModelOutput` conversion would otherwise emit an image part with
 * no bytes behind it.
 *
 * @param output - A tool result payload of unknown shape.
 * @param reason - Explanation recorded in place of the removed bytes.
 * @returns The rewritten output and whether anything was actually removed.
 */
export function stripRasterPayloads(
  output: unknown,
  reason: string = RASTER_STRIPPED_REASON
): { output: unknown; changed: boolean } {
  if (!isRecord(output)) return { output, changed: false };

  let next = output;
  let changed = false;

  const visuals = next.visuals;
  if (Array.isArray(visuals)) {
    let visualsChanged = false;
    const nextVisuals = visuals.map((visual) => {
      if (!isRecord(visual) || !("data" in visual)) return visual;
      visualsChanged = true;
      const { data: _data, ...withoutData } = visual;
      return { ...withoutData, visualInspectionUnavailableReason: reason };
    });
    if (visualsChanged) {
      next = { ...next, visuals: nextVisuals };
      changed = true;
    }
  }

  const images = next.images;
  if (Array.isArray(images) && images.length > 0) {
    next = withAppendedText(
      { ...next, images: [] },
      `[${images.length} image preview(s) removed: ${reason}]`
    );
    changed = true;
  }

  const value = next.value;
  if (Array.isArray(value)) {
    const imageEntryCount = value.filter(isImageDataEntry).length;
    if (imageEntryCount > 0) {
      const remaining = value.filter((entry) => !isImageDataEntry(entry));
      next = {
        ...next,
        value: [
          ...remaining,
          {
            type: "text",
            text: `[${imageEntryCount} image preview(s) removed: ${reason}]`,
          },
        ],
      };
      changed = true;
    }
  }

  return { output: next, changed };
}
