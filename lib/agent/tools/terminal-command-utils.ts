/**
 * Shared helpers for marker-based terminal command tracking.
 *
 * These utilities are used by bash and await_command to:
 * - detect command completion
 * - parse exit codes from end markers
 * - strip marker lines from user-visible output
 * - format consistent structured text responses for the model
 */

import type { PendingTerminalCommand } from "@/lib/shell/types";
import { stripAnsi } from "@/lib/shell/terminal-executor";

/** Result of parsing marker state from buffered terminal output. */
export interface CommandProgress {
  completed: boolean;
  exitCode: number | null;
  output: string;
}

/** Machine-readable status returned by terminal tools. */
export type TerminalResultStatus = "completed" | "running" | "matched" | "error";

/** Payload for formatting a stable, LLM-friendly terminal result envelope. */
export interface TerminalResultPayload {
  status: TerminalResultStatus;
  terminalName: string;
  elapsedMs: number;
  output: string;
  exitCode?: number | null;
  message?: string;
  nextStep?: string;
  pattern?: string;
}

/** Poll interval used by bash / await_command loops. */
export const TERMINAL_POLL_INTERVAL_MS = 150;
/** Foreground wait budget used by bash before handing off to await_command. */
export const DEFAULT_FOREGROUND_BUDGET_MS = 5_000;
/** Wait budget used by await_command before returning running status. */
export const DEFAULT_AWAIT_BUDGET_MS = 30_000;
/** Maximum block wait accepted by terminal tools (10 minutes). */
export const MAX_TERMINAL_BLOCK_MS = 10 * 60 * 1000;

/**
 * When bash returns status: running because the foreground wait budget elapsed.
 * A command is still in flight — the next tool call must be await_command only.
 */
export const NEXT_STEP_REQUIRED_AWAIT_AFTER_BASH_TIMEOUT =
  "REQUIRED: The command is still running. Your very next tool call must be await_command with this same terminalName (copy the exact value returned above). Do not call bash again, resend the command, or invent a new terminalName. Keep calling await_command until status is completed or error.";

/**
 * When await_command returns status: running because its wait budget elapsed while a command is still tracked.
 */
export const NEXT_STEP_REQUIRED_AWAIT_AFTER_AWAIT_TIMEOUT =
  "REQUIRED: The command is still running. Your very next tool call must be await_command again with this same terminalName (copy the exact value returned above). Do not call bash, resend the command, or invent a new terminalName. Keep calling await_command until status is completed or error.";

/** When bash used background: true — poll with await_command; do not resend via bash. */
export const NEXT_STEP_AWAIT_BACKGROUND =
  "Use await_command with this same terminalName (copy the exact value returned above) to read output and wait for completion. Do not resend the command via bash or invent a new terminalName.";

/** When await_command matched a pattern before the shell command finished. */
export const NEXT_STEP_AWAIT_AFTER_PATTERN_MATCH =
  "REQUIRED: Call await_command again with this same terminalName (copy the exact value returned above) to wait for command completion. Do not call bash, resend the command, or invent a new terminalName.";

/**
 * Parse buffered terminal output for a pending command.
 *
 * The parser expects:
 * - a start marker line equal to `pending.startMarker`
 * - an end marker line equal to `${pending.endMarkerPrefix}:<exitCode>`
 *
 * Marker lines are removed from the returned output.
 */
export function parseCommandProgress(
  rawBuffer: string,
  pending: Pick<PendingTerminalCommand, "startMarker" | "endMarkerPrefix">
): CommandProgress {
  const clean = stripAnsi(rawBuffer);
  const lines = clean.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === pending.startMarker);

  const endRegex = new RegExp(`^${escapeRegex(pending.endMarkerPrefix)}:(-?\\d+)\\s*$`);
  let endIndex = -1;
  let exitCode: number | null = null;

  for (let i = Math.max(0, startIndex + 1); i < lines.length; i += 1) {
    const match = lines[i]?.trim().match(endRegex);
    if (!match) continue;
    endIndex = i;
    exitCode = Number.parseInt(match[1]!, 10);
    break;
  }

  const completed = endIndex !== -1;
  const outputLines = extractOutputLines(lines, startIndex, endIndex);
  const output = stripKnownMarkerLines(outputLines).join("\n").trim();

  return { completed, exitCode, output };
}

/** Strip ANSI and known marker lines from arbitrary terminal output. */
export function stripTerminalMarkerNoise(rawBuffer: string): string {
  const lines = stripAnsi(rawBuffer).split(/\r?\n/);
  return stripKnownMarkerLines(lines).join("\n").trim();
}

/**
 * Build stable, line-oriented text for terminal tool responses.
 *
 * Keeps fields unambiguous even when output is truncated later by guardrails.
 */
export function formatTerminalResult(payload: TerminalResultPayload): string {
  const lines: string[] = [
    `status: ${payload.status}`,
    `terminalName: ${payload.terminalName}`,
    `elapsed_ms: ${payload.elapsedMs}`,
  ];

  if (typeof payload.exitCode === "number") {
    lines.push(`exit_code: ${payload.exitCode}`);
  }
  if (payload.pattern) {
    lines.push(`pattern: ${payload.pattern}`);
  }
  if (payload.message) {
    lines.push(`message: ${payload.message}`);
  }
  if (payload.nextStep) {
    lines.push(`next_step: ${payload.nextStep}`);
  }

  lines.push("output:");
  lines.push(payload.output.trim() ? payload.output.trim() : "[no output]");
  return lines.join("\n");
}

/**
 * Returns only the terminal stdout section from {@link formatTerminalResult} output
 * (everything after the `output:` marker line). Used for UI cards; the full formatted
 * string remains in the tool result for the model.
 *
 * If no `output:` line is found, returns `formatted` unchanged (e.g. `[ERROR: …]`).
 */
export function extractTerminalResultOutputForDisplay(formatted: string): string {
  const lines = formatted.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trim() === "output:");
  if (idx === -1) return formatted;
  return lines.slice(idx + 1).join("\n");
}

/** Promisified setTimeout. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOutputLines(lines: string[], startIndex: number, endIndex: number): string[] {
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return lines.slice(startIndex + 1, endIndex);
  }
  if (startIndex !== -1) {
    return lines.slice(startIndex + 1);
  }
  return lines;
}

function stripKnownMarkerLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^ORION_CMD_START_[A-Za-z0-9_]+$/.test(trimmed)) return false;
    if (/^ORION_CMD_END_[A-Za-z0-9_]+:-?\d+$/.test(trimmed)) return false;
    return true;
  });
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
