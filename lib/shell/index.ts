/**
 * lib/shell — Terminal pool utilities.
 *
 * Public exports:
 *   - TerminalPool:     Centralised lifecycle manager for all Jupyter terminals
 *   - TerminalType:     Enum for Agent / User terminal classifications
 *   - All pool types:   PooledTerminal, TerminalPoolOptions, TerminalPoolState, …
 */

export { TerminalPool } from "./terminal-pool";
export { stripAnsi } from "./terminal-text";
export { resolveUserTerminalCwd } from "./user-terminal-cwd";

export {
  TerminalType,
  type PooledTerminal,
  type TerminalPoolOptions,
  type TerminalPoolState,
} from "./types";
