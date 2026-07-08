/**
 * BashTool - Run shell commands in persistent PTY-backed terminals.
 *
 * This tool unifies terminal creation + command dispatch.
 * Reuse is explicit via `terminalName`; passing `terminalName: ""` creates
 * a fresh shell session so the model does not inherit unknown terminal state.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { BashParams } from "./types";
import type { TerminalPool } from "@/lib/shell/terminal-pool";
import { resolveAgentPath } from "../path-resolver";
import {
  DEFAULT_FOREGROUND_BUDGET_MS,
  formatTerminalResult,
  NEXT_STEP_AWAIT_BACKGROUND,
  NEXT_STEP_REQUIRED_AWAIT_AFTER_BASH_TIMEOUT,
  parseCommandProgress,
  sleep,
  TERMINAL_POLL_INTERVAL_MS,
  type TerminalResultPayload,
} from "./terminal-command-utils";

/** Large-output threshold above which text is persisted to a file. */
const OUTPUT_SPILL_THRESHOLD_CHARS = 200_000;
/** Preview head size used when output is spilled to file. */
const OUTPUT_PREVIEW_HEAD_CHARS = 6_000;
/** Preview tail size used when output is spilled to file. */
const OUTPUT_PREVIEW_TAIL_CHARS = 6_000;
/** Matches option-like tokens that include any non-ASCII characters. */
const NON_ASCII_OPTION_TOKEN_RE = /(?:^|\s)(-{1,2}[^\s]*[^\x00-\x7F][^\s]*)/u;

export type TerminalShell = "posix" | "powershell";

/**
 * Find a command-line option token that contains non-ASCII characters.
 *
 * This intentionally ignores non-ASCII text that is not part of an option
 * (for example in quoted file paths).
 */
function findNonAsciiOptionToken(command: string): string | null {
  const match = command.match(NON_ASCII_OPTION_TOKEN_RE);
  return match?.[1] ?? null;
}

/**
 * Explain how to recover when the model references a terminal that does not exist.
 */
function buildUnknownTerminalGuidance(terminalName: string): string {
  return [
    `Terminal "${terminalName}" not found.`,
    'Pass `terminalName: ""` to create a fresh chat-scoped terminal.',
    "Only pass a non-empty terminalName when intentionally reusing the exact value returned by a previous bash/await_command result. Do not invent terminal names.",
  ].join(" ");
}

/**
 * Build the marker wrapper for the active terminal shell.
 *
 * The completion parser depends on a start marker and an end marker shaped as
 * `${endMarkerPrefix}:<exitCode>`, so each shell-specific wrapper preserves
 * that contract while using syntax native to the terminal.
 */
export function buildShellWrappedCommand(options: {
  command: string;
  startMarker: string;
  endMarkerPrefix: string;
  shell: TerminalShell;
}): string {
  const { command, startMarker, endMarkerPrefix, shell } = options;
  if (shell === "powershell") {
    return buildPowerShellWrappedCommand(command, startMarker, endMarkerPrefix);
  }
  return buildPosixWrappedCommand(command, startMarker, endMarkerPrefix);
}

/**
 * Build a POSIX shell wrapper that captures the command exit code.
 */
function buildPosixWrappedCommand(
  command: string,
  startMarker: string,
  endMarkerPrefix: string
): string {
  return [
    "(set +e",
    `echo '${startMarker}'`,
    command,
    "__orion_rc=$?",
    `echo '${endMarkerPrefix}:'"$__orion_rc"`,
    ")",
  ].join("\n");
}

/**
 * Build a single-line PowerShell wrapper that captures native-process and
 * cmdlet failures.
 *
 * PowerShell terminals entered through Jupyter PTYs can remain in continuation
 * mode when fed multiline script blocks. Keeping the wrapper on one physical
 * line avoids the `>>` prompt trap while preserving marker parsing.
 */
function buildPowerShellWrappedCommand(
  command: string,
  startMarker: string,
  endMarkerPrefix: string
): string {
  const inlineCommand = command.replace(/[\r\n]+/g, "; ").trim();
  return [
    "$__orion_rc = 0;",
    "$global:LASTEXITCODE = $null;",
    `Write-Output '${startMarker}'`,
    "; try {",
    inlineCommand,
    "; $__orion_success = $?",
    "; $__orion_last_exit = $global:LASTEXITCODE",
    "; if ($__orion_last_exit -is [int]) {",
    "$__orion_rc = $__orion_last_exit",
    "} elseif (-not $__orion_success) {",
    "$__orion_rc = 1",
    "}",
    "} catch {",
    "Write-Error $_",
    "; $__orion_rc = 1",
    "};",
    `Write-Output "${endMarkerPrefix}:$__orion_rc"`,
  ].join(" ");
}

export class BashTool extends BaseTool {
  private pool: TerminalPool | null;
  private getChatId: (() => string | null) | null;
  private getTerminalShell: (() => TerminalShell) | null;
  private getJupyterRootDirectory: (() => string | undefined) | null;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    pool?: TerminalPool | null,
    getChatId?: (() => string | null) | null,
    getTerminalShell?: (() => TerminalShell) | null,
    getJupyterRootDirectory?: (() => string | undefined) | null
  ) {
    super(kernelService, sidecar);
    this.pool = pool ?? null;
    this.getChatId = getChatId ?? null;
    this.getTerminalShell = getTerminalShell ?? null;
    this.getJupyterRootDirectory = getJupyterRootDirectory ?? null;
  }

  /**
   * Run a shell command in a persistent terminal and return structured status.
   *
   * @param params.command - Shell command to run.
   * @param params.description - Human-readable one-line reason for running the command.
   * @param params.terminalName - Exact terminalName to reuse, or empty string to create a fresh chat-scoped terminal.
   * @param params.cwd - Working directory used only when a fresh chat terminal is created.
   * @param params.background - When true, return running status immediately after dispatch.
   * @returns Structured status envelope with terminal name, elapsed time, and output.
   */
  async execute(params: BashParams): Promise<string> {
    const { command, description, terminalName, cwd, background } = params;
    const startedAtMs = Date.now();

    if (!command?.trim()) {
      return "[ERROR: command is required]";
    }
    if (!description?.trim()) {
      return "[ERROR: description is required]";
    }

    const nonAsciiOptionToken = findNonAsciiOptionToken(command);
    if (nonAsciiOptionToken) {
      return `[ERROR: command contains non-ASCII option token "${nonAsciiOptionToken}". Use ASCII flags only (example: "ls -la").]`;
    }

    const resolvedCwd = resolveAgentPath(cwd, {
      rootDirectory: this.getJupyterRootDirectory?.(),
    });
    if (!resolvedCwd.ok) {
      return resolvedCwd.error;
    }

    const resolvedTerminalName = await this.resolveTerminalName({
      requestedTerminalName: terminalName,
      cwd: resolvedCwd.jupyterPath,
    });
    if (!resolvedTerminalName) {
      return "[ERROR: Unable to resolve a terminal for this command.]";
    }

    const markerId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startMarker = `ORION_CMD_START_${markerId}`;
    const endMarkerPrefix = `ORION_CMD_END_${markerId}`;
    let accumulated = "";

    try {
      this.kernelService.readTerminalBuffer(resolvedTerminalName);
      this.pool?.clearPendingCommand(resolvedTerminalName);
      this.pool?.setPendingCommand(resolvedTerminalName, {
        startMarker,
        endMarkerPrefix,
        startedAtMs,
        buffer: "",
      });
      const wrappedCommand = buildShellWrappedCommand({
        command,
        startMarker,
        endMarkerPrefix,
        shell: this.getTerminalShell?.() ?? "posix",
      });
      this.kernelService.sendToTerminal(
        resolvedTerminalName,
        `${wrappedCommand}\r`
      );
      this.pool?.touchActivity(resolvedTerminalName);
    } catch (error) {
      this.pool?.clearPendingCommand(resolvedTerminalName);
      const message = error instanceof Error ? error.message : String(error);
      const isUnknownTerminal = /^Terminal ".+" not found$/.test(message);
      return this.buildResult({
        status: "error",
        terminalName: resolvedTerminalName,
        elapsedMs: Date.now() - startedAtMs,
        output: "",
        message: isUnknownTerminal
          ? buildUnknownTerminalGuidance(resolvedTerminalName)
          : `Failed to send command: ${message}`,
      });
    }

    if (background) {
      return this.buildResult({
        status: "running",
        terminalName: resolvedTerminalName,
        elapsedMs: Date.now() - startedAtMs,
        output: "",
        message: "Command dispatched in background mode.",
        nextStep: NEXT_STEP_AWAIT_BACKGROUND,
      });
    }

    const deadline = Date.now() + DEFAULT_FOREGROUND_BUDGET_MS;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await sleep(Math.max(0, Math.min(TERMINAL_POLL_INTERVAL_MS, remaining)));
      try {
        const chunk = this.kernelService.readTerminalBuffer(resolvedTerminalName);
        if (chunk) {
          accumulated += chunk;
          this.pool?.appendPendingBuffer(resolvedTerminalName, chunk);
          this.pool?.touchActivity(resolvedTerminalName);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.buildResult({
          status: "error",
          terminalName: resolvedTerminalName,
          elapsedMs: Date.now() - startedAtMs,
          output: "",
          message: `Failed to read terminal output: ${message}`,
        });
      }

      const progress = parseCommandProgress(accumulated, {
        startMarker,
        endMarkerPrefix,
      });
      if (progress.completed) {
        this.pool?.clearPendingCommand(resolvedTerminalName);
        return this.buildResult({
          status: "completed",
          terminalName: resolvedTerminalName,
          elapsedMs: Date.now() - startedAtMs,
          exitCode: progress.exitCode,
          output: progress.output,
        });
      }
    }

    const finalProgress = parseCommandProgress(accumulated, {
      startMarker,
      endMarkerPrefix,
    });
    if (finalProgress.completed) {
      this.pool?.clearPendingCommand(resolvedTerminalName);
      return this.buildResult({
        status: "completed",
        terminalName: resolvedTerminalName,
        elapsedMs: Date.now() - startedAtMs,
        exitCode: finalProgress.exitCode,
        output: finalProgress.output,
      });
    }

    return this.buildResult({
      status: "running",
      terminalName: resolvedTerminalName,
      elapsedMs: Date.now() - startedAtMs,
      output: finalProgress.output,
      message: `Command still running after ${DEFAULT_FOREGROUND_BUDGET_MS}ms foreground wait budget.`,
      nextStep: NEXT_STEP_REQUIRED_AWAIT_AFTER_BASH_TIMEOUT,
    });
  }

  /** Resolve the terminal to use for this bash call. */
  private async resolveTerminalName(options: {
    requestedTerminalName: string;
    cwd: string;
  }): Promise<string | null> {
    const requestedTerminalName = options.requestedTerminalName.trim();
    if (requestedTerminalName) {
      return requestedTerminalName;
    }

    const requestedCwd = options.cwd.trim();
    const chatId = this.getChatId?.() ?? null;
    if (this.pool && chatId) {
      const terminal = await this.pool.createAgentTerminal(
        chatId,
        requestedCwd || undefined
      );
      return terminal.name;
    }

    return this.kernelService.startTerminal(requestedCwd || undefined);
  }

  /** Build, persist (if needed), and truncate the final tool result envelope. */
  private async buildResult(payload: TerminalResultPayload): Promise<string> {
    const spill = await this.persistLargeOutput(payload.output);
    const messageParts: string[] = [];
    if (payload.message) {
      messageParts.push(payload.message);
    }
    if (spill.outputFilePath) {
      messageParts.push(`Full output saved to ${spill.outputFilePath}.`);
    }
    if (spill.persistError) {
      messageParts.push(`Failed to persist full output: ${spill.persistError}`);
    }

    return this.truncateOutput(
      formatTerminalResult({
        ...payload,
        output: spill.previewOutput,
        message: messageParts.length > 0 ? messageParts.join(" ") : undefined,
      })
    );
  }

  /**
   * Persist very large output to a file and return a compact preview for model context.
   */
  private async persistLargeOutput(output: string): Promise<{
    previewOutput: string;
    outputFilePath?: string;
    persistError?: string;
  }> {
    if (output.length <= OUTPUT_SPILL_THRESHOLD_CHARS) {
      return { previewOutput: output };
    }

    const previewOutput = this.buildLargeOutputPreview(output);
    try {
      const response = await fetch("/api/terminal-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: output }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        const message =
          errorBody?.message ?? `HTTP ${response.status} ${response.statusText}`;
        return { previewOutput, persistError: message };
      }
      const payload = (await response.json()) as { filePath?: string };
      if (!payload.filePath?.trim()) {
        return {
          previewOutput,
          persistError: "Terminal output API returned no file path.",
        };
      }
      return { previewOutput, outputFilePath: payload.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { previewOutput, persistError: message };
    }
  }

  /** Build a head/tail preview string for very large terminal output. */
  private buildLargeOutputPreview(output: string): string {
    const head = output.slice(0, OUTPUT_PREVIEW_HEAD_CHARS).trimEnd();
    const tail = output.slice(-OUTPUT_PREVIEW_TAIL_CHARS).trimStart();
    return [
      head,
      "",
      `[... output truncated: ${output.length - OUTPUT_PREVIEW_HEAD_CHARS - OUTPUT_PREVIEW_TAIL_CHARS} chars omitted ...]`,
      "",
      tail,
    ]
      .filter(Boolean)
      .join("\n");
  }
}
