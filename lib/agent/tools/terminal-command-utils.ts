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
import { stripAnsi } from "@/lib/shell/terminal-text";

/** Result of parsing marker state from buffered terminal output. */
export interface CommandProgress {
  completed: boolean;
  exitCode: number | null;
  output: string;
}

/** Machine-readable status returned by terminal tools. */
export type TerminalResultStatus =
  | "completed"
  | "running"
  | "matched"
  | "stalled"
  | "killed"
  | "error";

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
  /** Milliseconds since the command last produced output (stalled results only). */
  idleMs?: number;
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
 * Silence after which an unfinished command is reported as stalled rather than
 * running, so the model is told it may recover instead of awaiting forever.
 */
export const IDLE_STALL_MS = 20_000;

/**
 * When bash returns status: running because the foreground wait budget elapsed.
 * A command is still in flight — the next tool call must be await_command only.
 */
export const NEXT_STEP_REQUIRED_AWAIT_AFTER_BASH_TIMEOUT =
  "REQUIRED: The command is still running. Your very next tool call must be await_command with this same terminalName (copy the exact value returned above), or kill_command with that terminalName if you decide to stop it. Do not call bash again, resend the command, or invent a new terminalName.";

/**
 * When await_command returns status: running because its wait budget elapsed while a command is still tracked.
 */
export const NEXT_STEP_REQUIRED_AWAIT_AFTER_AWAIT_TIMEOUT =
  "REQUIRED: The command is still running. Your very next tool call must be await_command again with this same terminalName (copy the exact value returned above), or kill_command with that terminalName if you decide to stop it. Do not call bash, resend the command, or invent a new terminalName.";

/** When bash used background: true — poll with await_command; do not resend via bash. */
export const NEXT_STEP_AWAIT_BACKGROUND =
  "Use await_command with this same terminalName (copy the exact value returned above) to read output and wait for completion. Do not resend the command via bash or invent a new terminalName.";

/** When await_command matched a pattern before the shell command finished. */
export const NEXT_STEP_AWAIT_AFTER_PATTERN_MATCH =
  "REQUIRED: Call await_command again with this same terminalName (copy the exact value returned above) to wait for command completion. Do not call bash, resend the command, or invent a new terminalName.";

/**
 * When output stopped at something that looks like an interactive prompt.
 * The command cannot finish on its own, so waiting longer is pointless.
 */
export const NEXT_STEP_STALLED_TERMINAL =
  "REQUIRED: This terminal is blocked on an interactive prompt and will never complete on its own. Call kill_command with this same terminalName (mode: \"interrupt\"), then re-run the command non-interactively — for example add --no-pager, pipe through cat, or pass the flag that skips confirmation. Do not keep calling await_command.";

/**
 * When a tracked command has produced no output for a long time but shows no
 * prompt: it may be a slow command or a silent block, so both paths are allowed.
 */
export const NEXT_STEP_IDLE_TERMINAL =
  "The command may be working silently or blocked on input. Either call await_command again with this same terminalName to keep waiting, or call kill_command with that terminalName (mode: \"interrupt\") and re-run it non-interactively. Do not call bash with this terminalName or invent a new one.";

/** When kill_command could not free a terminal by interrupting it. */
export const NEXT_STEP_KILL_CLOSE_TERMINAL =
  'REQUIRED: Call kill_command again with this same terminalName and mode: "close" to shut the terminal down, then run the next command with terminalName "" to get a fresh one.';

/** When bash is asked to reuse a terminal that still has a tracked command. */
export const NEXT_STEP_REQUIRED_AWAIT_BEFORE_REUSE =
  "REQUIRED: This terminal already has a tracked command. Call await_command with this same terminalName until status is completed or error, then retry the new command. The new command was not dispatched.";

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
  const endRegex = new RegExp(
    `${escapeRegex(pending.endMarkerPrefix)}:(-?\\d+)`
  );
  const endMatch = endRegex.exec(clean);
  let exitCode: number | null = null;
  let endOffset = -1;

  if (endMatch?.index !== undefined) {
    endOffset = endMatch.index;
    exitCode = Number.parseInt(endMatch[1]!, 10);
  }

  const completed = endOffset !== -1;
  const searchEnd = completed ? endOffset : clean.length;
  const outputStart = findCommandOutputStart(
    clean,
    pending.startMarker,
    searchEnd
  );
  const outputEnd = completed ? endOffset : clean.length;
  const output = stripKnownMarkerTokens(clean.slice(outputStart, outputEnd)).trim();

  return { completed, exitCode, output };
}

/**
 * Signatures of prompts that keep a PTY command from ever completing.
 *
 * Each pattern is matched against the last non-empty output line only: the same
 * text appearing mid-output (a file that contains "(END)", a log line ending in
 * "[y/N]") is ordinary output, not a prompt.
 */
const INTERACTIVE_PROMPT_SIGNATURES: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "pager end-of-file prompt ((END))", pattern: /\(END\)$/ },
  { label: "pager prompt (--More--)", pattern: /--\s?More\s?--(\(\d+%\))?$/i },
  { label: "pager prompt (:)", pattern: /^:$/ },
  { label: "pager quit hint", pattern: /\(q to quit\)$/i },
  {
    label: "yes/no confirmation prompt",
    pattern: /(\[y\/n\]|\[yes\/no\]|\(y\/n\))[\s?:]*$/i,
  },
  { label: "password prompt", pattern: /(password|passphrase)[^:]*:$/i },
  { label: "keypress prompt", pattern: /press\s+(enter|return|any key)\b/i },
];

/**
 * Return a label describing the interactive prompt the output ends at, or null
 * when the tail does not look like a prompt.
 */
export function detectInteractivePrompt(output: string): string | null {
  const lines = stripAnsi(output).split(/\r?\n|\r/);
  let lastLine = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index]!.trim();
    if (candidate) {
      lastLine = candidate;
      break;
    }
  }
  if (!lastLine) return null;

  for (const { label, pattern } of INTERACTIVE_PROMPT_SIGNATURES) {
    if (pattern.test(lastLine)) return label;
  }
  return null;
}

/**
 * Decide whether an unfinished command should be reported as stalled.
 *
 * A command is stalled when its output ends at an interactive prompt (it can
 * never complete on its own) or when it has produced nothing for
 * {@link IDLE_STALL_MS} (it may be blocked on input Orion cannot see).
 *
 * @param options.output - Cleaned command output observed so far.
 * @param options.lastOutputAtMs - Epoch ms of the last observed output byte.
 * @param options.idleStallMs - Optional idle threshold override.
 */
export function classifyUnfinishedCommand(options: {
  output: string;
  lastOutputAtMs: number;
  idleStallMs?: number;
}): { stalled: boolean; promptLabel: string | null; idleMs: number } {
  const idleMs = Math.max(0, Date.now() - options.lastOutputAtMs);
  const promptLabel = detectInteractivePrompt(options.output);
  const idleThreshold = options.idleStallMs ?? IDLE_STALL_MS;
  return {
    stalled: promptLabel !== null || idleMs >= idleThreshold,
    promptLabel,
    idleMs,
  };
}

/**
 * Build the message and next_step for a stalled command result.
 *
 * @param promptLabel - Prompt signature found at the end of the output, if any.
 * @param idleMs - Milliseconds since the command last produced output.
 */
export function buildStalledResultText(
  promptLabel: string | null,
  idleMs: number
): { message: string; nextStep: string } {
  if (promptLabel) {
    return {
      message: `Command is waiting at an interactive ${promptLabel} and cannot finish on its own.`,
      nextStep: NEXT_STEP_STALLED_TERMINAL,
    };
  }
  return {
    message: `Command produced no output for ${Math.round(idleMs / 1000)}s.`,
    nextStep: NEXT_STEP_IDLE_TERMINAL,
  };
}

/** Strip ANSI and known marker lines from arbitrary terminal output. */
export function stripTerminalMarkerNoise(rawBuffer: string): string {
  return stripKnownMarkerTokens(stripAnsi(rawBuffer)).trim();
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
  if (typeof payload.idleMs === "number") {
    lines.push(`idle_ms: ${payload.idleMs}`);
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
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createTerminalAbortError());
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(createTerminalAbortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

/** Return whether an error represents cancellation of terminal polling. */
export function isTerminalAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Locate output after the last emitted standalone start marker before completion. */
function findCommandOutputStart(
  clean: string,
  startMarker: string,
  searchEnd: number
): number {
  const prefix = clean.slice(0, searchEnd);
  const standaloneRegex = new RegExp(
    `(?:^|\\n)[\\t ]*${escapeRegex(startMarker)}[\\t ]*(?:\\n|$)`,
    "g"
  );
  let standaloneEnd = -1;
  let standaloneMatch: RegExpExecArray | null;
  while ((standaloneMatch = standaloneRegex.exec(prefix)) !== null) {
    standaloneEnd = standaloneMatch.index + standaloneMatch[0].length;
  }
  if (standaloneEnd !== -1) {
    return standaloneEnd;
  }

  const fallbackIndex = prefix.lastIndexOf(startMarker);
  if (fallbackIndex === -1) return 0;
  let outputStart = fallbackIndex + startMarker.length;
  if (prefix[outputStart] === "\r") outputStart += 1;
  if (prefix[outputStart] === "\n") outputStart += 1;
  return outputStart;
}

/** Remove marker tokens without discarding real text attached to either side. */
function stripKnownMarkerTokens(text: string): string {
  return text
    .replace(/ORION_CMD_START_\d+_[A-Za-z0-9]{6}/g, "")
    .replace(/ORION_CMD_END_\d+_[A-Za-z0-9]{6}:-?\d+/g, "");
}

/** Build the standard cancellation error used by browser tool execution. */
function createTerminalAbortError(): DOMException {
  return new DOMException("Terminal wait was cancelled.", "AbortError");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
