/**
 * GrepFilesTool - Search file contents by regex pattern.
 *
 * Thin wrapper around the standalone `grep` function from lib/shell.
 * The search logic (rg → POSIX grep fallback, cross-OS compatibility, pool
 * management) lives in lib/shell/system-commands/grep.ts.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { GrepFilesParams } from "./types";
import type { TerminalPool } from "@/lib/shell/terminal-pool";
import { grep } from "@/lib/shell/system-commands";
import { logToolShellCommand } from "@/lib/logging/dev-logger-client";

// ============================================================================
// Constants
// ============================================================================

/** Max total matches returned to the LLM */
const MAX_MATCHES = 100;

/** Max characters shown per matching line */
const MAX_LINE_LENGTH = 200;

const IS_DEV = process.env.NODE_ENV === "development";

// ============================================================================
// Tool
// ============================================================================

export class GrepFilesTool extends BaseTool {
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
   * Search file contents for a regex pattern.
   *
   * @param params.pattern - Regular-expression pattern to search for
   * @param params.path    - Directory to search (relative to Jupyter root; empty = workspace root)
   * @param params.include - Glob filter(s) for files to search (e.g. `*.py`, `*.ts,*.tsx`); empty = all text files
   * @returns Matches grouped by file with line numbers, or a "no matches" message
   */
  async execute(params: GrepFilesParams): Promise<string> {
    if (!this.pool) {
      return `[ERROR: grep requires a terminal pool — no pool configured]`;
    }
    const result = await grep(this.pool, this.kernelService, {
      pattern: params.pattern,
      path: params.path || undefined,
      include: params.include || undefined,
      maxResults: MAX_MATCHES,
      maxLineLength: MAX_LINE_LENGTH,
      parse: false,
      cwd: this.getWorkspaceDirectory?.(),
    });

    if (IS_DEV && result.shellCommand) {
      logToolShellCommand(
        { toolName: "grep_files", shellCommand: result.shellCommand },
        this.getChatId?.() ?? null
      );
    }

    if (!result.success) {
      return `No matches for "${params.pattern}" in "${params.path || "/"}"`;
    }

    if (!result.raw?.trim()) {
      return `No matches for "${params.pattern}" in "${params.path || "/"}"`;
    }

    const sourceNote = result.source ? ` via ${result.source}` : "";
    const header = `Matches for "${params.pattern}"${sourceNote}:\n`;

    return header + result.raw.trim();
  }
}
