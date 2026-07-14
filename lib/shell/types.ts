/**
 * Shared types for the lib/shell terminal pool.
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
  /** Chat session ID (only for Agent terminals; null for User terminals) */
  chatId: string | null;
  /** Epoch ms of last terminal activity (creation, send, or read) */
  lastActivityMs: number;
  /** Raw Jupyter WebSocket connection (needed by xterm.js for User/Agent terminals) */
  connection: Terminal.ITerminalConnection;
  /** In-flight marker state for bash / await_command */
  pendingCommand?: PendingTerminalCommand;
}

export interface TerminalPoolOptions {
  /** Idle timeout for Agent terminals in ms (default: 3_600_000 = 1h) */
  idleTimeoutMs?: number;
  /** Interval in ms for the idle-reaper background sweep (default: 60_000) */
  reaperIntervalMs?: number;
}

/** Snapshot of pool state for UI rendering. */
export interface TerminalPoolState {
  terminals: ReadonlyArray<Readonly<PooledTerminal>>;
}
