/**
 * lib/shell — Terminal pool and system commands.
 *
 * Public exports:
 *   - TerminalPool:     Centralised lifecycle manager for all Jupyter terminals
 *   - TerminalType:     Enum for Agent / User / System terminal classifications
 *   - All pool types:   PooledTerminal, TerminalPoolOptions, TerminalPoolState, …
 *   - glob / grep:      Standalone file-search functions (pool-backed, cross-OS)
 *   - Constants:        DEFAULT_IGNORE_DIRS, BINARY_EXTENSIONS, globToRegex, …
 */

export { TerminalPool } from "./terminal-pool";
export { executeInSystemTerminal, stripAnsi, sleep } from "./terminal-executor";

export {
  TerminalType,
  type PooledTerminal,
  type TerminalPoolOptions,
  type TerminalPoolState,
  type SystemExecOptions,
  type SystemExecResult,
  type GlobOptions,
  type GlobResult,
  type GrepOptions,
  type GrepResult,
  type GrepMatch,
} from "./types";

export {
  glob,
  grep,
  DEFAULT_IGNORE_DIRS,
  BINARY_EXTENSIONS,
  globToRegex,
  parseIncludeGlobs,
} from "./system-commands";
