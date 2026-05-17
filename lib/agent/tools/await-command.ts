/**
 * AwaitCommandTool - Continue waiting on terminal output using pending marker
 * state tracked by the terminal pool.
 *
 * This tool blocks server-side until:
 * - the in-flight command completion marker is observed
 * - an optional regex pattern matches output
 * - the built-in await wait budget elapses
 */

import { BaseTool } from "./base-tool";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type { AwaitCommandParams } from "./types";
import type { TerminalPool } from "@/lib/shell/terminal-pool";
import {
  DEFAULT_AWAIT_BUDGET_MS,
  formatTerminalResult,
  NEXT_STEP_AWAIT_AFTER_PATTERN_MATCH,
  NEXT_STEP_REQUIRED_AWAIT_AFTER_AWAIT_TIMEOUT,
  parseCommandProgress,
  sleep,
  stripTerminalMarkerNoise,
  TERMINAL_POLL_INTERVAL_MS,
} from "./terminal-command-utils";

/** Compile optional pattern for await_command early-match behavior. */
function compilePattern(pattern: string): RegExp | null {
  if (!pattern.trim()) return null;
  return new RegExp(pattern, "m");
}

export class AwaitCommandTool extends BaseTool {
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
   * Read buffered stdout output from a terminal while optionally blocking.
   *
   * @param params.terminalName - Exact terminalName from a prior bash or await_command result.
   * @param params.pattern - Optional regex pattern; empty string disables early pattern matching.
   * @returns Structured status text with completion/running/matched state.
   */
  async execute(params: AwaitCommandParams): Promise<string> {
    const { terminalName, pattern } = params;
    const startedAtMs = Date.now();

    if (!terminalName?.trim()) {
      return "[ERROR: terminalName is required]";
    }

    let patternRegex: RegExp | null = null;
    try {
      patternRegex = compilePattern(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.truncateOutput(
        formatTerminalResult({
          status: "error",
          terminalName,
          elapsedMs: Date.now() - startedAtMs,
          output: "",
          message: `Invalid regex pattern: ${message}`,
        })
      );
    }

    let pending = this.pool?.getPendingCommand(terminalName) ?? null;
    let accumulated = pending?.buffer ?? "";
    const deadline = Date.now() + DEFAULT_AWAIT_BUDGET_MS;

    try {
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        await sleep(Math.max(0, Math.min(TERMINAL_POLL_INTERVAL_MS, remaining)));

        const output = this.kernelService.readTerminalBuffer(terminalName);
        if (output) {
          accumulated += output;
          if (pending) {
            this.pool?.appendPendingBuffer(terminalName, output);
          }
          this.pool?.touchActivity(terminalName);
        }

        // Re-check pending state in case another call cleared/replaced it.
        if (this.pool) {
          pending = this.pool.getPendingCommand(terminalName);
        }

        if (pending) {
          const progress = parseCommandProgress(accumulated, pending);
          if (progress.completed) {
            this.pool?.clearPendingCommand(terminalName);
            return this.truncateOutput(
              formatTerminalResult({
                status: "completed",
                terminalName,
                elapsedMs: Date.now() - startedAtMs,
                exitCode: progress.exitCode,
                output: progress.output,
              })
            );
          }

          if (patternRegex && patternRegex.test(progress.output)) {
            return this.truncateOutput(
              formatTerminalResult({
                status: "matched",
                terminalName,
                elapsedMs: Date.now() - startedAtMs,
                pattern,
                output: progress.output,
                message:
                  "Pattern matched before command completion. The command may still be running.",
                nextStep: NEXT_STEP_AWAIT_AFTER_PATTERN_MATCH,
              })
            );
          }
          continue;
        }

        const cleaned = stripTerminalMarkerNoise(accumulated);
        if (patternRegex && patternRegex.test(cleaned)) {
          return this.truncateOutput(
            formatTerminalResult({
              status: "matched",
              terminalName,
              elapsedMs: Date.now() - startedAtMs,
              pattern,
              output: cleaned,
              message: "Pattern matched in terminal output.",
            })
          );
        }
      }

      // Final parse at timeout boundary.
      if (pending) {
        const progress = parseCommandProgress(accumulated, pending);
        if (progress.completed) {
          this.pool?.clearPendingCommand(terminalName);
          return this.truncateOutput(
            formatTerminalResult({
              status: "completed",
              terminalName,
              elapsedMs: Date.now() - startedAtMs,
              exitCode: progress.exitCode,
              output: progress.output,
            })
          );
        }

        return this.truncateOutput(
          formatTerminalResult({
            status: "running",
            terminalName,
            elapsedMs: Date.now() - startedAtMs,
            output: progress.output,
            message: `Command still running after ${DEFAULT_AWAIT_BUDGET_MS}ms await wait budget.`,
            nextStep: NEXT_STEP_REQUIRED_AWAIT_AFTER_AWAIT_TIMEOUT,
          })
        );
      }

      const cleaned = stripTerminalMarkerNoise(accumulated);
      return this.truncateOutput(
        formatTerminalResult({
          status: "running",
          terminalName,
          elapsedMs: Date.now() - startedAtMs,
          output: cleaned,
          message:
            "No pending command marker is being tracked for this terminal. Output is returned as a stream snapshot.",
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
}
