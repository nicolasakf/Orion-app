/**
 * ListDirectoryTool - List subdirectories only (no files) at a Jupyter-relative path
 *
 * Uses the ContentsManager REST API (same as the file tree sidebar) to fetch
 * directory contents. No kernel execution needed — this is a lightweight
 * alternative to spinning up a terminal just to run `ls`.
 *
 * Supports two modes:
 *   - Flat listing (recursive: false): immediate child folders only, sorted alphabetically.
 *   - Recursive tree (recursive: true): folder subtree up to maxDepth, rendered as
 *     an indented directory tree.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { ListDirectoryParams } from "./types";
import { DEFAULT_IGNORE_DIRS } from "./constants";

export class ListDirectoryTool extends BaseTool {
  constructor(kernelService: KernelService, sidecar: KernelSidecar | null) {
    super(kernelService, sidecar);
  }

  /**
   * List child folders of a directory on the Jupyter server (files and notebooks are omitted).
   *
   * @param params.directoryPath - Path relative to the Jupyter root; empty string for root
   * @param params.recursive     - When true, walk the subtree and render a tree view
   * @param params.maxDepth      - Maximum recursion depth (1–10); only used when recursive is true
   * @returns Formatted folder listing
   */
  async execute(params: ListDirectoryParams): Promise<string> {
    const { directoryPath, recursive, maxDepth } = params;

    if (recursive) {
      return this.executeRecursive(directoryPath, maxDepth);
    }
    return this.executeFlat(directoryPath);
  }

  // ==========================================================================
  // Flat listing (immediate subfolders only)
  // ==========================================================================

  private async executeFlat(directoryPath: string): Promise<string> {
    const contents = this.kernelService.getContentsManager();

    let entries: Array<{ name: string; path: string; type: string; size?: number; last_modified?: string }>;

    try {
      const model = await contents.get(directoryPath || "", { content: true });

      if (model.type !== "directory") {
        return `[ERROR] '${directoryPath}' is not a directory.`;
      }

      entries = (model.content as typeof entries) ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not list directory '${directoryPath || "/"}': ${message}`;
    }

    const folders = entries.filter((e) => e.type === "directory");

    if (folders.length === 0) {
      return `Directory '${directoryPath || "/"}' has no subfolders.`;
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));

    const header = `Directory: ${directoryPath || "/"} (${folders.length} folders)\n`;
    const separator = "─".repeat(60) + "\n";

    const rows = folders.map((entry) => `  ${entry.name}/`);

    return header + separator + rows.join("\n");
  }

  // ==========================================================================
  // Recursive tree listing
  // ==========================================================================

  private async executeRecursive(directoryPath: string, maxDepth: number): Promise<string> {
    const contents = this.kernelService.getContentsManager();
    const clampedDepth = Math.max(1, Math.min(10, maxDepth));
    const lines: string[] = [];

    const walk = async (dirPath: string, indent: string, depth: number): Promise<void> => {
      if (depth > clampedDepth) return;

      let model;
      try {
        model = await contents.get(dirPath, { content: true });
      } catch {
        return;
      }

      if (model.type !== "directory") return;

      const rawEntries = (
        model.content as Array<{
          name: string;
          path: string;
          type: string;
          size?: number;
        }>
      ) ?? [];

      const subfolders = rawEntries.filter((e) => e.type === "directory");
      subfolders.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of subfolders) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
          lines.push(`${indent}${entry.name}/  [skipped]`);
          continue;
        }
        lines.push(`${indent}${entry.name}/`);
        await walk(entry.path, indent + "  ", depth + 1);
      }
    };

    try {
      await walk(directoryPath || "", "", 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[ERROR] Could not list directory '${directoryPath || "/"}': ${message}`;
    }

    if (lines.length === 0) {
      return `Directory '${directoryPath || "/"}' has no subfolders within the requested depth.`;
    }

    const header = `Directory: ${directoryPath || "/"} (recursive, max depth: ${clampedDepth})\n`;
    const separator = "─".repeat(60) + "\n";
    return header + separator + lines.join("\n");
  }
}
