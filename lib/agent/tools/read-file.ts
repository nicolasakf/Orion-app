/**
 * ReadFileTool - Read a non-notebook file from the Jupyter server
 *
 * Supports optional line-range slicing to avoid flooding the LLM context
 * window when reading large files. Returns line-numbered output for easy
 * reference in follow-up edit operations.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { ReadFileParams } from "./types";

export class ReadFileTool extends BaseTool {
  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    snapshotProvider?: OpenDocumentSnapshotProvider | null
  ) {
    super(kernelService, sidecar, snapshotProvider);
  }

  /**
   * Read a text file from the Jupyter server contents API.
   *
   * @param params.filePath - Path relative to the Jupyter root directory
   * @param params.startLine - 0-based start line (0 = from beginning)
   * @param params.endLine - 0-based end line inclusive (0 = to end of file)
   * @returns Line-numbered file content, optionally sliced to the requested range
   */
  async execute(params: ReadFileParams): Promise<string> {
    const { filePath, startLine, endLine } = params;

    if (!filePath) {
      return "[ERROR] filePath is required.";
    }

    let rawContent: string;
    const snapshot = this.snapshotProvider?.getTextSnapshot(filePath);
    const readFromEditorBuffer = Boolean(snapshot?.dirty);

    try {
      if (snapshot) {
        rawContent = snapshot.content;
      } else {
        const contents = this.kernelService.getContentsManager();
        const model = await contents.get(filePath, {
          content: true,
          format: "text",
        });

        if (model.content === null || model.content === undefined) {
          return `[ERROR] File '${filePath}' has no content or is not a text file.`;
        }

        rawContent = model.content as string;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not read file '${filePath}': ${message}`;
    }

    const lines = rawContent.split("\n");
    const totalLines = lines.length;

    // Resolve line range (both 0 means "full file")
    const resolvedStart = startLine > 0 ? Math.min(startLine, totalLines) : 0;
    const resolvedEnd =
      endLine > 0 ? Math.min(endLine + 1, totalLines) : totalLines;

    if (resolvedStart >= resolvedEnd) {
      return `[ERROR] startLine (${startLine}) must be less than endLine (${endLine}). File has ${totalLines} lines.`;
    }

    const selectedLines = lines.slice(resolvedStart, resolvedEnd);

    // Build line-numbered output (1-based for human readability)
    const numbered = selectedLines
      .map((line, i) => {
        const lineNum = resolvedStart + i + 1;
        return `${String(lineNum).padStart(4, " ")}  ${line}`;
      })
      .join("\n");

    const isPartial = resolvedStart > 0 || resolvedEnd < totalLines;
    const sourceSuffix = readFromEditorBuffer ? " [source: editor buffer]" : "";
    const header = isPartial
      ? `File: ${filePath} (lines ${resolvedStart + 1}–${resolvedEnd} of ${totalLines})`
      : `File: ${filePath} (${totalLines} lines)`;

    const output = `${header}${sourceSuffix}\n${"─".repeat(60)}\n${numbered}`;
    return this.truncateOutput(output);
  }
}
