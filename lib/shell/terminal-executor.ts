/**
 * Pool-backed terminal executor for system commands.
 *
 * Unlike the previous per-invocation approach (create → drain → run → close),
 * this executor acquires an idle system terminal from the TerminalPool and
 * returns it when the command finishes. Warm terminals skip the initial drain
 * delay, reducing latency for back-to-back grep/glob calls.
 *
 * Error handling:
 *   - If the command fails cleanly (exit code, empty output) the terminal is
 *     released back to the pool.
 *   - If the terminal itself appears broken (e.g. server dropped the session),
 *     it is closed rather than returned to the pool so a fresh one is created
 *     on the next acquisition.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { TerminalPool } from "./terminal-pool";
import type { SystemExecOptions, SystemExecResult } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Max time to wait for the main command to finish (until the end marker appears as its own output line). */
const DEFAULT_TIMEOUT_MS = 15_000;
/** Max time to wait for the optional `availabilityCheck` probe (until its end marker appears as its own output line). */
const DEFAULT_AVAILABILITY_TIMEOUT_MS = 3_000;
/** Interval between `readTerminalBuffer` polls while waiting for a completion marker. */
const POLL_INTERVAL_MS = 300;
/** After acquiring a cold (non-warm) terminal, pause so shell welcome / prompt noise can settle before we drain the buffer. */
const DRAIN_DELAY_MS = 400;

/** ANSI escape-sequence stripper */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

// ============================================================================
// Public API
// ============================================================================

/**
 * Run a shell command inside a pooled system terminal.
 *
 * @param pool         - TerminalPool that manages system terminal lifecycle
 * @param kernelService - KernelService used to send/read terminal I/O
 * @param opts         - Command options (command string, timeouts, availability check)
 * @returns            Exec result: `success`, `output`, and optional `toolUnavailable`
 */
export async function executeInSystemTerminal(
  pool: TerminalPool,
  kernelService: KernelService,
  opts: SystemExecOptions
): Promise<SystemExecResult> {
  const {
    command,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    availabilityCheck,
    availabilityCheckTimeoutMs = DEFAULT_AVAILABILITY_TIMEOUT_MS,
  } = opts;

  let terminalName: string | null = null;
  let releaseToPool = false;

  try {
    const { terminal, isWarm } = await pool.acquireSystemTerminal();
    terminalName = terminal.name;
    releaseToPool = true;

    // Drain shell welcome noise only on fresh (non-warm) terminals
    if (!isWarm) {
      await sleep(DRAIN_DELAY_MS);
      kernelService.readTerminalBuffer(terminalName);
    }

    // ── Optional availability check ────────────────────────────────────────
    if (availabilityCheck) {
      const checkStartMarker = `ORION_CHECK_START_${Date.now()}`;
      const checkEndMarker = `ORION_CHECK_END_${Date.now()}`;
      const presentToken = "__ORION_TOOL_PRESENT__1";
      const missingToken = "__ORION_TOOL_PRESENT__0";
      kernelService.sendToTerminal(
        terminalName,
        `echo '${checkStartMarker}' ; if ${availabilityCheck} >/dev/null 2>&1; then echo '${presentToken}'; else echo '${missingToken}'; fi ; echo '${checkEndMarker}'\r`
      );
      const checkRaw = await pollUntilMarker(
        kernelService,
        terminalName,
        checkEndMarker,
        availabilityCheckTimeoutMs
      );
      const checkClean = stripAnsi(checkRaw);
      const checkOutput = extractBetweenMarkers(
        checkClean,
        checkStartMarker,
        checkEndMarker
      );
      const toolPresent = checkOutput
        .split("\n")
        .map((line) => line.trim())
        .includes(presentToken);

      if (!toolPresent) {
        return { success: false, toolUnavailable: true, output: "" };
      }
    }

    // ── Main command ───────────────────────────────────────────────────────
    // Clear any residual buffer before sending the real command
    kernelService.readTerminalBuffer(terminalName);

    const cmdStartMarker = `ORION_CMD_START_${Date.now()}`;
    const cmdEndMarker = `ORION_CMD_END_${Date.now()}`;
    kernelService.sendToTerminal(
      terminalName,
      `echo '${cmdStartMarker}' ; ${command} ; echo '${cmdEndMarker}'\r`
    );
    const raw = await pollUntilMarker(
      kernelService,
      terminalName,
      cmdEndMarker,
      timeoutMs
    );

    const output = extractBetweenMarkers(
      stripAnsi(raw),
      cmdStartMarker,
      cmdEndMarker
    );

    return { success: true, output };
  } catch {
    // On exception the terminal state is unknown — close it rather than reuse
    releaseToPool = false;
    if (terminalName !== null) {
      try {
        await pool.closeTerminal(terminalName);
      } catch {
        // Ignore cleanup errors
      }
    }
    return { success: false, output: "" };
  } finally {
    if (releaseToPool && terminalName !== null) {
      pool.releaseSystemTerminal(terminalName);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Accumulate terminal output until `marker` appears or `timeoutMs` elapses.
 */
async function pollUntilMarker(
  kernelService: KernelService,
  terminalName: string,
  marker: string,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let accumulated = "";

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const chunk = kernelService.readTerminalBuffer(terminalName);
    if (chunk) accumulated += chunk;
    if (hasMarkerLine(accumulated, marker)) break;
  }

  return accumulated;
}

/** True when marker appears as a standalone output line (ignores echoed command text). */
function hasMarkerLine(raw: string, marker: string): boolean {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .includes(marker);
}

/**
 * Extract output between standalone marker lines.
 *
 * Falls back to removing marker substrings if either marker line is missing.
 */
function extractBetweenMarkers(raw: string, startMarker: string, endMarker: string): string {
  const lines = raw.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === startMarker);
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return lines
      .slice(startIndex + 1, endIndex)
      .join("\n")
      .trim();
  }

  return lines
    .filter((line) => !line.includes(startMarker) && !line.includes(endMarker))
    .join("\n")
    .trim();
}

/** Strip ANSI escape sequences from terminal output. */
export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, "");
}

/** Promisified setTimeout. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
