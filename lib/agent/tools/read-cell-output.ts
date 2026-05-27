/**
 * ReadCellOutputTool - Intelligently read specific cell outputs by mime type
 *
 * Handles:
 * - text/plain: returned as-is
 * - text/html with table: extracted to TSV (pandas DataFrames)
 * - text/html without table: stripped to plain text
 * - text/markdown: returned as-is
 * - application/vnd.plotly.v1+json: structured summary (traces, axes, sample data)
 * - image/png, image/jpeg, image/gif: returned as multimodal content so the model
 *   can actually see the image (via toModelOutput in tool-schemas.ts)
 * - image/svg+xml: SVG source text (already human-readable)
 * - stream: stdout/stderr text
 * - error: ename, evalue, traceback
 *
 * For image outputs, returns a `MultimodalToolResult` object instead of a string.
 * The `toModelOutput` function in tool-schemas.ts converts this to a
 * `{ type: "content", value: [...] }` ToolResultOutput with image-data parts
 * that the Anthropic provider renders as native image blocks for the model.
 */

import { BaseTool } from "./base-tool";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import { guardMultimodalToolResult } from "../tool-output-guard";
import type {
  ReadCellOutputParams,
  MultimodalToolResult,
  NotebookDocument,
} from "./types";
import { getDefaultMimeRegistry } from "@/lib/notebook/mime-registry";

/** Mime types that contain raster image data we can send to the model */
const RASTER_IMAGE_MIMES: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/gif": "image/gif",
};

const BATCH_SEPARATOR = "\n\n==========\n\n";

/**
 * Combine multiple read_cell_output results into one string or multimodal payload.
 */
function mergeReadCellOutputParts(
  parts: Array<string | MultimodalToolResult>
): string | MultimodalToolResult {
  if (parts.length === 0) {
    return "[Empty output]";
  }
  if (parts.length === 1) {
    return parts[0]!;
  }

  const textChunks: string[] = [];
  const images: Array<{ mimeType: string; data: string }> = [];

  for (const p of parts) {
    if (typeof p === "string") {
      textChunks.push(p);
    } else {
      if (p.text) textChunks.push(p.text);
      images.push(...(p.images ?? []));
    }
  }

  if (images.length === 0) {
    return textChunks.join(BATCH_SEPARATOR);
  }

  return {
    text: textChunks.join(BATCH_SEPARATOR),
    images,
  };
}

export class ReadCellOutputTool extends BaseTool {
  private notebookManager: NotebookManager;
  private mimeRegistry = getDefaultMimeRegistry();

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager,
    snapshotProvider?: OpenDocumentSnapshotProvider | null
  ) {
    super(kernelService, sidecar, snapshotProvider);
    this.notebookManager = notebookManager;
  }

  /**
   * Read one or more outputs from the currently active notebook.
   *
   * @param params.reads - (cellIndex, outputIndex) pairs in read order
   * @returns Text description, structured table, plotly summary, or multimodal result with image(s)
   */
  async execute(params: ReadCellOutputParams): Promise<string | MultimodalToolResult> {
    const { reads } = params;

    if (!reads || reads.length === 0) {
      return "[ERROR] reads must contain at least one { cellIndex, outputIndex } entry.";
    }

    const path = this.notebookManager.getCurrentNotebookPath();
    if (!path) {
      return "[ERROR] No current notebook is active. Use use_notebook first.";
    }

    const readResult = await this.readNotebookWithSource(path);
    const notebook = readResult.notebook;
    const sourcePrefix =
      readResult.source === "editor-buffer" && readResult.dirty
        ? "[source: editor buffer]\n"
        : "";
    const parts: Array<string | MultimodalToolResult> = [];

    for (const { cellIndex, outputIndex } of reads) {
      parts.push(
        this.readOneOutput(notebook, cellIndex, outputIndex)
      );
    }

    const merged = mergeReadCellOutputParts(parts);
    if (typeof merged === "string") {
      return this.truncateOutput(`${sourcePrefix}${merged}`);
    }
    const guarded = guardMultimodalToolResult(merged);
    if (!guarded.images || guarded.images.length === 0) {
      const text =
        guarded.text ?? "[Image output omitted: content too large to send safely.]";
      return this.truncateOutput(`${sourcePrefix}${text}`);
    }
    return {
      text: guarded.text
        ? this.truncateOutput(`${sourcePrefix}${guarded.text}`)
        : sourcePrefix.trim(),
      images: guarded.images,
    };
  }

  /**
   * Read a single output; used for each entry in `reads`.
   */
  private readOneOutput(
    notebook: NotebookDocument,
    cellIndex: number,
    outputIndex: number
  ): string | MultimodalToolResult {
    const totalCells = notebook.cells.length;

    let resolvedIndex = cellIndex;
    if (resolvedIndex < 0) {
      resolvedIndex = totalCells + resolvedIndex;
    }

    if (resolvedIndex < 0 || resolvedIndex >= totalCells) {
      return `[ERROR] Cell index ${cellIndex} is out of range. Notebook has ${totalCells} cells.`;
    }

    const cell = notebook.cells[resolvedIndex];

    if (cell.cell_type !== "code") {
      return `[ERROR] Cell ${resolvedIndex} is a ${cell.cell_type} cell. Only code cells have outputs.`;
    }

    const outputs = cell.outputs ?? [];

    if (outputs.length === 0) {
      return `[Cell ${resolvedIndex} has no outputs. Execute it first.]`;
    }

    if (outputIndex >= outputs.length) {
      return `[ERROR] Output index ${outputIndex} is out of range. Cell ${resolvedIndex} has ${outputs.length} output(s).`;
    }

    const output = outputs[outputIndex];
    const outputType = output.output_type;
    const prefix = `Cell ${resolvedIndex}, output ${outputIndex} (${outputType}):\n`;
    const agentResult = this.mimeRegistry.toAgentResult(output);
    if (agentResult) {
      const text = this.truncateOutput(`${prefix}${agentResult.text}`);
      if (!agentResult.images || agentResult.images.length === 0) {
        return text;
      }
      const guardedResult = guardMultimodalToolResult({
        text,
        images: agentResult.images
          .map((image) => {
            const mediaType = RASTER_IMAGE_MIMES[image.mimeType];
            if (!mediaType) {
              return null;
            }
            return { mimeType: mediaType, data: image.data };
          })
          .filter((image): image is { mimeType: string; data: string } => image !== null),
      });
      if (!guardedResult.images || guardedResult.images.length === 0) {
        return guardedResult.text ?? "[Image output omitted: content too large to send safely.]";
      }
      return {
        text: guardedResult.text ?? text,
        images: guardedResult.images,
      };
    }

    if (outputType === "execute_result" || outputType === "display_data") {
      const mimeTypes = Object.keys(output.data ?? {}).join(", ");
      return `[Cell ${resolvedIndex} output ${outputIndex}: unsupported mime types: ${mimeTypes || "(none)"}]`;
    }

    return `[Cell ${resolvedIndex} output ${outputIndex}: unknown output_type '${outputType}']`;
  }
}
