/**
 * KillCommandTool - Recover a terminal whose command cannot finish on its own.
 *
 * A PTY command that stops at an interactive prompt (a pager, a confirmation,
 * a password) never emits the completion marker, so `bash` refuses to reuse the
 * terminal and `await_command` can only report it as stalled. This tool is the
 * escape hatch: it interrupts the foreground command, quits a pager if one is
 * holding the terminal, and can close the terminal outright as a last resort.
 *
 * Interrupting cannot be confirmed from the wrapper's end marker — a shell that
 * takes SIGINT abandons the rest of the command list, marker included. Recovery
 * is confirmed instead by sending a probe command and watching for its echo-safe
 * marker to be printed back.
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { KillCommandParams } from "./types";
import type { TerminalPool } from "@/lib/shell/terminal-pool";
import {
  formatTerminalResult,
  NEXT_STEP_KILL_CLOSE_TERMINAL,
  parseCommandProgress,
  sleep,
  TERMINAL_POLL_INTERVAL_MS,
} from "./terminal-command-utils";

/** How long to watch for the probe marker after each escalation step. */
const ESCALATION_WAIT_MS = 2_000;

/** Ctrl-C: interrupts the foreground process group. */
const CTRL_C = "\x03";
/** Ctrl-U: clears anything left on the shell input line. */
const CTRL_U = "\x15";
/** Quit key understood by `less`, `more`, and most other pagers. */
const PAGER_QUIT = "q";
/** Enter: answers prompts that accept nothing else, such as "Press RETURN". */
const ENTER = "\r";
/** Ctrl-D: end of input, which drops out of a REPL that captured the terminal. */
const EOF = "\x04";
export class KillCommandTool extends BaseTool {
  private pool: TerminalPool | null;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    pool?: TerminalPool | null
  ) {
    super(kernelService, sidecar);
    this.pool = pool ?? null;
  }

  /**
   * Interrupt or close a terminal that is stuck on an unfinished command.
   *
   * @param params.terminalName - Exact terminalName from a prior bash or await_command result.
   * @param params.mode - "interrupt" sends Ctrl-C and escalates to a pager quit; "close" shuts the terminal down.
   * @param abortSignal - Optional signal that cancels the escalation waits.
   * @returns Structured status envelope describing the state the terminal was left in.
   */
  async execute(
    params: KillCommandParams,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const { terminalName, mode } = params;
    const startedAtMs = Date.now();

    if (!terminalName?.trim()) {
      return "[ERROR: terminalName is required]";
    }
    if (mode !== "interrupt" && mode !== "close") {
      return '[ERROR: mode must be "interrupt" or "close"]';
    }

    if (mode === "close") {
      return this.closeTerminal(terminalName, startedAtMs);
    }

    try {
      return await this.interruptTerminal(terminalName, startedAtMs, abortSignal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/^Terminal ".+" not found$/.test(message)) {
        this.pool?.clearPendingCommand(terminalName);
        return this.truncateOutput(
          formatTerminalResult({
            status: "killed",
            terminalName,
            elapsedMs: Date.now() - startedAtMs,
            output: "",
            message:
              'Terminal is gone along with whatever it was running. Run the next command with terminalName "" to get a fresh terminal.',
          })
        );
      }
      return this.truncateOutput(
        formatTerminalResult({
          status: "error",
          terminalName,
          elapsedMs: Date.now() - startedAtMs,
          output: "",
          message,
        })
      );
    }
  }

  /**
   * Interrupt whatever holds the terminal, then probe to see whether the shell
   * is accepting commands again.
   *
   * The three keys cover the three ways a terminal gets stuck, and are sent
   * together because a pager swallows the probe's keystrokes as pager commands
   * if it is still running when the probe is typed: Ctrl-C stops an ordinary
   * foreground command, `q` quits a pager (which ignores SIGINT), and Ctrl-U
   * clears the `q` off the input line when no pager was running.
   */
  private async interruptTerminal(
    terminalName: string,
    startedAtMs: number,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const probe = buildProbeMarker();
    let accumulated = this.kernelService.readTerminalBuffer(terminalName);

    this.sendInterruptKeys(terminalName);
    accumulated += await this.probeShell(terminalName, probe, abortSignal);
    let settled = this.settle(terminalName, accumulated, startedAtMs, {
      probeMarker: probe.marker,
      killMessage: "Interrupted the command; the terminal is accepting commands again.",
    });
    if (settled) return settled;

    // Some prompts ("Press RETURN to continue") consume nothing but Enter, so
    // answer one before repeating the interrupt keys. Ctrl-D last drops out of
    // a REPL (python, node, psql) that swallowed the terminal; if the shell
    // itself takes that EOF the terminal closes, which is where this ladder was
    // heading anyway.
    this.kernelService.sendToTerminal(terminalName, ENTER);
    this.sendInterruptKeys(terminalName);
    this.kernelService.sendToTerminal(terminalName, EOF);
    accumulated += await this.probeShell(terminalName, probe, abortSignal);
    settled = this.settle(terminalName, accumulated, startedAtMs, {
      probeMarker: probe.marker,
      killMessage:
        "Answered a pending prompt and interrupted the command; the terminal is accepting commands again.",
    });
    if (settled) return settled;

    return this.truncateOutput(
      formatTerminalResult({
        status: "stalled",
        terminalName,
        elapsedMs: Date.now() - startedAtMs,
        output: accumulated,
        message:
          "Terminal did not respond to an interrupt or a pager quit; something is still holding it.",
        nextStep: NEXT_STEP_KILL_CLOSE_TERMINAL,
      })
    );
  }

  /** Send the interrupt / pager-quit / clear-line keys in one burst. */
  private sendInterruptKeys(terminalName: string): void {
    this.kernelService.sendToTerminal(terminalName, CTRL_C);
    this.kernelService.sendToTerminal(terminalName, PAGER_QUIT);
    this.kernelService.sendToTerminal(terminalName, CTRL_U);
  }

  /** Shut the terminal down and drop its pending command state. */
  private async closeTerminal(
    terminalName: string,
    startedAtMs: number
  ): Promise<string> {
    this.pool?.clearPendingCommand(terminalName);
    try {
      if (this.pool?.getTerminal(terminalName)) {
        await this.pool.closeTerminal(terminalName);
      } else {
        await this.kernelService.closeTerminal(terminalName);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.truncateOutput(
        formatTerminalResult({
          status: "error",
          terminalName,
          elapsedMs: Date.now() - startedAtMs,
          output: "",
          message: `Failed to close terminal: ${message}`,
        })
      );
    }

    return this.truncateOutput(
      formatTerminalResult({
        status: "killed",
        terminalName,
        elapsedMs: Date.now() - startedAtMs,
        output: "",
        message:
          'Terminal was closed along with whatever it was running. Run the next command with terminalName "" to get a fresh terminal.',
      })
    );
  }

  /**
   * Send a probe command and collect output for one escalation window.
   *
   * The probe prints its marker from two concatenated string literals, so the
   * PTY echo of the typed line never matches the contiguous marker the shell
   * prints when it actually runs the command.
   */
  private async probeShell(
    terminalName: string,
    probe: { marker: string; token: string },
    abortSignal?: AbortSignal
  ): Promise<string> {
    this.kernelService.sendToTerminal(
      terminalName,
      `command printf '\\n%s%s\\n' '${PROBE_MARKER_PREFIX}' '${probe.token}'\r`
    );

    const deadline = Date.now() + ESCALATION_WAIT_MS;
    let collected = "";
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await sleep(
        Math.max(0, Math.min(TERMINAL_POLL_INTERVAL_MS, remaining)),
        abortSignal
      );
      collected += this.kernelService.readTerminalBuffer(terminalName);
      if (collected.includes(probe.marker)) break;
    }
    return collected;
  }

  /**
   * Decide the outcome after one escalation step.
   *
   * @returns A formatted result, or null when the terminal has not recovered yet.
   */
  private settle(
    terminalName: string,
    accumulated: string,
    startedAtMs: number,
    options: { probeMarker: string; killMessage: string }
  ): string | null {
    const pending = this.pool?.getPendingCommand(terminalName);
    const progress = pending
      ? parseCommandProgress(pending.buffer + accumulated, pending)
      : null;

    // The command finished on its own between the stall report and the kill.
    if (progress?.completed) {
      this.pool?.clearPendingCommand(terminalName);
      return this.truncateOutput(
        formatTerminalResult({
          status: "completed",
          terminalName,
          elapsedMs: Date.now() - startedAtMs,
          exitCode: progress.exitCode,
          output: progress.output,
          message: "Command had already completed before it could be stopped.",
        })
      );
    }

    if (!accumulated.includes(options.probeMarker)) return null;

    this.pool?.clearPendingCommand(terminalName);
    return this.truncateOutput(
      formatTerminalResult({
        status: "killed",
        terminalName,
        elapsedMs: Date.now() - startedAtMs,
        output: progress?.output ?? "",
        message: `${options.killMessage} Partial output from the stopped command is below; reuse this terminalName for the next command.`,
      })
    );
  }
}

/** Build a marker unique to one kill_command call. */
function buildProbeMarker(): { marker: string; token: string } {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { marker: `${PROBE_MARKER_PREFIX}${token}`, token };
}

/** Prefix of the marker printed by the shell-responsiveness probe. */
const PROBE_MARKER_PREFIX = "ORION_KILL_OK_";
