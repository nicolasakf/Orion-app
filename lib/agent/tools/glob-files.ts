/**
 * GlobFilesTool - Find files by glob pattern.
 *
 * Thin wrapper around the standalone `glob` function from lib/shell.
 * The search logic (fd → find fallback, cross-OS compatibility, pool
 * management) lives in lib/shell/system-commands/glob.ts.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { GlobFilesParams } from "./types";
import type { TerminalPool } from "@/lib/shell/terminal-pool";
import { glob } from "@/lib/shell/system-commands";
import { logToolShellCommand } from "@/lib/logging/dev-logger-client";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of results passed to the underlying glob command */
const TERMINAL_MAX_RESULTS = 500;

/** Maximum number of results forwarded to the LLM */
const MAX_DISPLAY_RESULTS = 100;

// ============================================================================
// Tool
// ============================================================================

const IS_DEV = process.env.NODE_ENV === "development";

export class GlobFilesTool extends BaseTool {
  private pool: TerminalPool | null;
  private getChatId: (() => string | null) | null;
  private getWorkspaceDirectory: (() => string | undefined) | null;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    pool: TerminalPool | null,
    getChatId?: (() => string | null) | null,
    getWorkspaceDirectory?: (() => string | undefined) | null
  ) {
    super(kernelService, sidecar);
    this.pool = pool;
    this.getChatId = getChatId ?? null;
    this.getWorkspaceDirectory = getWorkspaceDirectory ?? null;
  }

  /**
   * Find files matching a glob pattern within the workspace.
   *
   * @param params.pattern - Glob pattern (e.g. `**\/*.py`, `data/**\/*.csv`, `*.{json,yaml}`)
   * @param params.path    - Root directory relative to the Jupyter root; empty string for workspace root
   * @returns File paths matching the pattern, one per line
   */
  async execute(params: GlobFilesParams): Promise<string> {
    if (!this.pool) {
      return `[ERROR: glob requires a terminal pool — no pool configured]`;
    }
    const result = await glob(this.pool, this.kernelService, {
      pattern: params.pattern,
      path: params.path || undefined,
      maxResults: TERMINAL_MAX_RESULTS,
      parse: false,
      cwd: this.getWorkspaceDirectory?.(),
    });

    if (IS_DEV && result.shellCommand) {
      logToolShellCommand(
        { toolName: "glob_files", shellCommand: result.shellCommand },
        this.getChatId?.() ?? null
      );
    }

    if (!result.success || !result.raw?.trim()) {
      return `No files matched pattern "${params.pattern}" in "${params.path || "/"}"`;
    }

    const files = result.raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const displayed = files.slice(0, MAX_DISPLAY_RESULTS);
    const truncated = files.length > MAX_DISPLAY_RESULTS;

    const countLabel = truncated
      ? `first ${MAX_DISPLAY_RESULTS} of ${files.length} matches`
      : `${displayed.length} file(s)`;

    const header =
      `${countLabel} matching "${params.pattern}" in "${params.path || "/"}":` +
      (result.source ? ` (via ${result.source})` : "") +
      "\n";

    return header + displayed.join("\n");
  }
}
