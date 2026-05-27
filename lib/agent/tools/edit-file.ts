/**
 * EditFileTool - Write or modify a non-notebook file on the Jupyter server
 *
 * Supports two modes:
 * - "overwrite": Replace the entire file content with the provided string
 * - "replace": Find a unique oldString in the file and replace it with newString
 *
 * All operations go through the Jupyter ContentsManager, keeping writes
 * sandboxed to the Jupyter root directory.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { EditFileParams } from "./types";

export class EditFileTool extends BaseTool {
  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    snapshotProvider?: OpenDocumentSnapshotProvider | null
  ) {
    super(kernelService, sidecar, snapshotProvider);
  }

  /**
   * Edit a text file via the Jupyter server contents API.
   *
   * @param params.filePath - Path relative to the Jupyter root directory
   * @param params.mode - "overwrite" replaces entire content; "replace" does targeted substitution
   * @param params.content - Full new content (overwrite mode only)
   * @param params.oldString - Text to find and replace (replace mode only)
   * @param params.newString - Replacement text (replace mode only)
   * @returns Confirmation message with details about the change
   */
  async execute(params: EditFileParams): Promise<string> {
    const { filePath, mode, content, oldString, newString } = params;

    if (!filePath) {
      return "[ERROR] filePath is required.";
    }

    const contents = this.kernelService.getContentsManager();

    if (mode === "overwrite") {
      return this.overwrite(contents, filePath, content);
    }

    if (mode === "replace") {
      return this.replace(contents, filePath, oldString, newString);
    }

    return `[ERROR] Unknown mode '${mode}'. Use "overwrite" or "replace".`;
  }

  /**
   * Replace the entire file content with the provided string.
   */
  private async overwrite(
    contents: ReturnType<KernelService["getContentsManager"]>,
    filePath: string,
    newContent: string
  ): Promise<string> {
    try {
      await contents.save(filePath, {
        type: "file",
        format: "text",
        content: newContent,
      });

      const lineCount = newContent.split("\n").length;
      return `Successfully wrote ${filePath} (${lineCount} lines).`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not write file '${filePath}': ${message}`;
    }
  }

  /**
   * Find a unique occurrence of oldString in the file and replace it with newString.
   *
   * Fails if oldString appears zero times (not found) or more than once (ambiguous).
   */
  private async replace(
    contents: ReturnType<KernelService["getContentsManager"]>,
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<string> {
    if (!oldString) {
      return "[ERROR] oldString is required in replace mode.";
    }

    let currentContent: string;
    try {
      const snapshot = this.snapshotProvider?.getTextSnapshot(filePath);
      if (snapshot) {
        currentContent = snapshot.content;
      } else {
        const model = await contents.get(filePath, {
          content: true,
          format: "text",
        });

        if (model.content === null || model.content === undefined) {
          return `[ERROR] File '${filePath}' has no content or is not a text file.`;
        }

        currentContent = model.content as string;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not read file '${filePath}': ${message}`;
    }

    // Validate uniqueness
    const occurrences = this.countOccurrences(currentContent, oldString);

    if (occurrences === 0) {
      return `[ERROR] oldString not found in '${filePath}'. No changes made. Double-check whitespace and indentation.`;
    }

    if (occurrences > 1) {
      return `[ERROR] oldString appears ${occurrences} times in '${filePath}'. Provide more context to make it unique. No changes made.`;
    }

    // Perform the replacement
    const updatedContent = currentContent.replace(oldString, newString);

    try {
      await contents.save(filePath, {
        type: "file",
        format: "text",
        content: updatedContent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not write file '${filePath}': ${message}`;
    }

    // Report what changed
    const removedLines = oldString.split("\n").length;
    const addedLines = newString.split("\n").length;
    return `Successfully edited '${filePath}': replaced ${removedLines}-line block with ${addedLines}-line block.`;
  }

  /**
   * Count non-overlapping occurrences of needle in haystack.
   */
  private countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = haystack.indexOf(needle, pos)) !== -1) {
      count++;
      pos += needle.length;
    }
    return count;
  }
}
