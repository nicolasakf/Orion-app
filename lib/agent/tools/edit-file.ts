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
import type { EditCheckpointRecorder } from "../edit-checkpoint-recorder";
import type { OpenDocumentSnapshotProvider } from "../open-document-snapshots";
import type { EditFileParams } from "./types";
import { resolveAgentPath } from "../path-resolver";

export class EditFileTool extends BaseTool {
  private getJupyterRootDirectory: (() => string | undefined) | null;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    snapshotProvider?: OpenDocumentSnapshotProvider | null,
    checkpointRecorder?: EditCheckpointRecorder | null,
    getJupyterRootDirectory?: (() => string | undefined) | null
  ) {
    super(kernelService, sidecar, snapshotProvider, checkpointRecorder);
    this.getJupyterRootDirectory = getJupyterRootDirectory ?? null;
  }

  /**
   * Edit a text file via the Jupyter server contents API.
   *
   * @param params.filePath - Agent-facing file path; absolute paths are normalized to Jupyter-relative paths
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

    const resolvedPath = resolveAgentPath(filePath, {
      rootDirectory: this.getJupyterRootDirectory?.(),
    });
    if (!resolvedPath.ok) {
      return resolvedPath.error;
    }

    const contents = this.kernelService.getContentsManager();

    if (mode === "overwrite") {
      return this.overwrite(contents, resolvedPath.jupyterPath, filePath, content);
    }

    if (mode === "replace") {
      return this.replace(contents, resolvedPath.jupyterPath, filePath, oldString, newString);
    }

    return `[ERROR] Unknown mode '${mode}'. Use "overwrite" or "replace".`;
  }

  /**
   * Replace the entire file content with the provided string.
   * Creates missing parent directories so overwrite can write nested paths.
   */
  private async overwrite(
    contents: ReturnType<KernelService["getContentsManager"]>,
    jupyterPath: string,
    displayPath: string,
    newContent: string
  ): Promise<string> {
    const beforeContent = await this.readCurrentTextContent(contents, jupyterPath);
    try {
      await this.ensureParentDirectoryExists(contents, jupyterPath);
      await contents.save(jupyterPath, {
        type: "file",
        format: "text",
        content: newContent,
      });

      await this.checkpointRecorder?.recordTarget(
        {
          kind: "text_file",
          operation: beforeContent === null ? "insert" : "update",
          path: jupyterPath,
          before: { content: beforeContent ?? "" },
          after: { content: newContent },
        },
        this.checkpointContext ?? undefined
      );

      const lineCount = newContent.split("\n").length;
      return `Successfully wrote ${displayPath} (${lineCount} lines).`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not write file '${displayPath}': ${message}`;
    }
  }

  /**
   * Find a unique occurrence of oldString in the file and replace it with newString.
   *
   * Fails if oldString appears zero times (not found) or more than once (ambiguous).
   */
  private async replace(
    contents: ReturnType<KernelService["getContentsManager"]>,
    jupyterPath: string,
    displayPath: string,
    oldString: string,
    newString: string
  ): Promise<string> {
    if (!oldString) {
      return "[ERROR] oldString is required in replace mode.";
    }

    let currentContent: string;
    try {
      const snapshot = this.snapshotProvider?.getTextSnapshot(jupyterPath);
      if (snapshot) {
        currentContent = snapshot.content;
      } else {
        const model = await contents.get(jupyterPath, {
          content: true,
          format: "text",
        });

        if (model.content === null || model.content === undefined) {
          return `[ERROR] File '${displayPath}' has no content or is not a text file.`;
        }

        currentContent = model.content as string;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not read file '${displayPath}': ${message}`;
    }

    // Validate uniqueness
    const occurrences = this.countOccurrences(currentContent, oldString);

    if (occurrences === 0) {
      return `[ERROR] oldString not found in '${displayPath}'. No changes made. Double-check whitespace and indentation.`;
    }

    if (occurrences > 1) {
      return `[ERROR] oldString appears ${occurrences} times in '${displayPath}'. Provide more context to make it unique. No changes made.`;
    }

    // Perform the replacement
    const updatedContent = currentContent.replace(oldString, newString);

    try {
      await contents.save(jupyterPath, {
        type: "file",
        format: "text",
        content: updatedContent,
      });
      await this.checkpointRecorder?.recordTarget(
        {
          kind: "text_file",
          operation: "update",
          path: jupyterPath,
          before: { content: currentContent },
          after: { content: updatedContent },
        },
        this.checkpointContext ?? undefined
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not write file '${displayPath}': ${message}`;
    }

    // Report what changed
    const removedLines = oldString.split("\n").length;
    const addedLines = newString.split("\n").length;
    return `Successfully edited '${displayPath}': replaced ${removedLines}-line block with ${addedLines}-line block.`;
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

  /** Read existing text content for checkpointing, returning null for new files. */
  private async readCurrentTextContent(
    contents: ReturnType<KernelService["getContentsManager"]>,
    filePath: string
  ): Promise<string | null> {
    const snapshot = this.snapshotProvider?.getTextSnapshot(filePath);
    if (snapshot) return snapshot.content;

    try {
      const model = await contents.get(filePath, {
        content: true,
        format: "text",
      });
      return typeof model.content === "string" ? model.content : null;
    } catch {
      return null;
    }
  }
}
