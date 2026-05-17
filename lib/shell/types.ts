/**
 * Shared types for the lib/shell package: terminal pool, system command
 * execution, and standalone grep/glob functions.
 */

import type { Terminal } from "@jupyterlab/services";

// ============================================================================
// Terminal types
// ============================================================================

export enum TerminalType {
  /** Agent-created terminal, scoped to a chat session, reaped after 1h idle */
  Agent = "agent",
  /** User-created terminal via the UI, never reaped */
  User = "user",
  /** System-internal terminal for grep/glob, pooled for reuse, reaped after 1h idle */
  System = "system",
}

/** Marker state tracked for an in-flight terminal command. */
export interface PendingTerminalCommand {
  /** Marker line emitted before the command body starts */
  startMarker: string;
  /** Marker prefix emitted at command completion (`${endMarkerPrefix}:<exitCode>`) */
  endMarkerPrefix: string;
  /** Epoch ms when command dispatch started */
  startedAtMs: number;
  /** Accumulated ANSI/raw output observed so far for this command */
  buffer: string;
}

/** A terminal session tracked by the pool, with lifecycle metadata. */
export interface PooledTerminal {
  /** Server-assigned terminal name */
  name: string;
  /** Terminal classification */
  type: TerminalType;
  /** Chat session ID (only for Agent terminals; null for User/System) */
  chatId: string | null;
  /** Epoch ms of last activity (send, read, or acquire) */
  lastActivityMs: number;
  /** Whether a system terminal is currently checked out for a command */
  busy: boolean;
  /** Raw Jupyter WebSocket connection (needed by xterm.js for User/Agent terminals) */
  connection: Terminal.ITerminalConnection;
  /** In-flight marker state for bash / await_command */
  pendingCommand?: PendingTerminalCommand;
}

export interface TerminalPoolOptions {
  /** Idle timeout for Agent and System terminals in ms (default: 3_600_000 = 1h) */
  idleTimeoutMs?: number;
  /** Max idle System terminals kept warm between commands (default: 2) */
  systemPoolSize?: number;
  /** Interval in ms for the idle-reaper background sweep (default: 60_000) */
  reaperIntervalMs?: number;
}

/** Snapshot of pool state for UI rendering. */
export interface TerminalPoolState {
  terminals: ReadonlyArray<Readonly<PooledTerminal>>;
}

// ============================================================================
// Command execution types
// ============================================================================

/** Options for running a single shell command via a pooled system terminal. */
export interface SystemExecOptions {
  /** Shell command to execute */
  command: string;
  /** Timeout in ms for the main command (default: 15_000) */
  timeoutMs?: number;
  /**
   * Optional shell command to check tool availability before running the main
   * command (e.g. `"command -v rg"`). If the output does not look like a path,
   * the tool is considered absent and `toolUnavailable: true` is returned.
   */
  availabilityCheck?: string;
  /** Timeout in ms for the availability check (default: 3_000) */
  availabilityCheckTimeoutMs?: number;
}

export interface SystemExecResult {
  /** True when the command ran to completion (or produced output before timeout) */
  success: boolean;
  /** ANSI-stripped output with marker lines removed */
  output: string;
  /** True when the availability check determined the required tool is not installed */
  toolUnavailable?: boolean;
}

// ============================================================================
// System command types
// ============================================================================

export interface GlobOptions {
  /** Glob pattern to match file paths against (e.g. `**\/*.py`, `*.{ts,tsx}`) */
  pattern: string;
  /** Root directory relative to Jupyter root; empty string or undefined = workspace root */
  path?: string;
  /** Maximum number of file paths returned (default: 500) */
  maxResults?: number;
  /** When false, skip parseFileList and return raw terminal output in `raw` (default: true) */
  parse?: boolean;
  /** When false, perform case-insensitive matching where supported (default: true) */
  caseSensitive?: boolean;
  /** Working directory passed to `executeInSystemTerminal` to guarantee correct cwd */
  cwd?: string;
}

export interface GlobResult {
  /** True when at least one terminal strategy succeeded */
  success: boolean;
  /** Matched file paths, capped at `maxResults` */
  files: string[];
  /** True when results were capped at `maxResults` */
  truncated: boolean;
  /** Total matched files before capping */
  total: number;
  /** Which CLI tool produced the results; null on failure */
  source: "fd" | "find" | null;
  /** Raw terminal output; populated when `parse` was false */
  raw?: string;
  /** Exact shell command run when a strategy succeeded (dev logging / debugging) */
  shellCommand?: string;
}

export interface GrepMatch {
  /** 1-based line number */
  line: number;
  /** Matched line content, possibly truncated */
  content: string;
}

export interface GrepOptions {
  /** Regular-expression pattern to search for in file contents */
  pattern: string;
  /** Directory relative to Jupyter root; empty string or undefined = workspace root */
  path?: string;
  /** File glob filter(s), e.g. `*.py` or `*.{ts,tsx}` (empty = all text files) */
  include?: string;
  /** Maximum number of match lines returned (default: 100) */
  maxResults?: number;
  /** Maximum characters shown per matching line (default: 200) */
  maxLineLength?: number;
  /** When false, skip parseGrepOutput and return raw terminal output in `raw` (default: true) */
  parse?: boolean;
  /** When false, perform case-insensitive matching (default: true) */
  caseSensitive?: boolean;
  /** Working directory passed to `executeInSystemTerminal` to guarantee correct cwd */
  cwd?: string;
}

export interface GrepResult {
  /** True when at least one terminal strategy succeeded */
  success: boolean;
  /** Matches grouped by file path */
  matches: Map<string, GrepMatch[]>;
  /** True when results were capped at `maxResults` */
  truncated: boolean;
  /** Total match count before capping */
  total: number;
  /** Which CLI tool produced the results; null on failure */
  source: "rg" | "grep" | null;
  /** Raw terminal output; populated when `parse` was false */
  raw?: string;
  /** Exact shell command run when a strategy succeeded (dev logging / debugging) */
  shellCommand?: string;
}
