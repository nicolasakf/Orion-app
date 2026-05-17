/**
 * Standalone grep function — searches file contents by regex pattern.
 *
 * Strategy (in order of preference):
 *   1. `rg` (ripgrep) via a pooled system terminal — fast, handles binary
 *      detection, respects .gitignore, cross-platform.
 *   2. POSIX `grep -r` via a pooled system terminal — universally available
 *      fallback on macOS (BSD grep) and Linux (GNU grep).
 *
 * Returns structured data (not a formatted string) so callers can apply
 * their own rendering — agent tools format for the LLM, future UI components
 * can render a match list.
 *
 * Cross-OS notes:
 *   - Only POSIX-compatible grep flags are used (`-r`, `-n`, `--color=never`).
 *   - `--include` is supported by both BSD grep (macOS 10.9+) and GNU grep.
 *   - Single quotes are used for shell arguments (bash/zsh/sh compatible).
 *   - Both rg and grep produce `file:lineno:content` output, so a single
 *     parser covers both tools.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { TerminalPool } from "../terminal-pool";
import type { GrepOptions, GrepResult, GrepMatch } from "../types";
import { executeInSystemTerminal } from "../terminal-executor";
import { parseIncludeGlobs } from "./constants";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_LINE_LENGTH = 200;
const GREP_TIMEOUT_MS = 15_000;
const WHICH_TIMEOUT_MS = 3_000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Search file contents for a regex pattern in the Jupyter workspace.
 *
 * @param pool          - TerminalPool for acquiring system terminals
 * @param kernelService - KernelService for I/O to the terminal
 * @param options       - `pattern`, `path`, `include`, `maxResults`, `maxLineLength`
 * @returns             Structured result with matches grouped by file path
 */
export async function grep(
  pool: TerminalPool,
  kernelService: KernelService,
  options: GrepOptions
): Promise<GrepResult> {
  const {
    pattern,
    path,
    include,
    maxResults = DEFAULT_MAX_RESULTS,
    maxLineLength = DEFAULT_MAX_LINE_LENGTH,
    parse = true,
    caseSensitive = true,
    cwd,
  } = options;

  // 1. Try ripgrep (fast, cross-platform)
  try {
    const rgResult = await tryRipgrep(
      pool,
      kernelService,
      pattern,
      path,
      include,
      maxResults,
      maxLineLength,
      parse,
      caseSensitive,
      cwd
    );
    if (rgResult !== null) return rgResult;
  } catch {
    // Fall through to POSIX grep
  }

  // 2. Try POSIX grep (universally available)
  try {
    const grepResult = await tryPosixGrep(
      pool,
      kernelService,
      pattern,
      path,
      include,
      maxResults,
      maxLineLength,
      parse,
      caseSensitive,
      cwd
    );
    if (grepResult !== null) return grepResult;
  } catch {
    // Both strategies failed
  }

  return {
    success: false,
    matches: new Map(),
    truncated: false,
    total: 0,
    source: null,
  };
}
// ============================================================================
// ripgrep strategy
// ============================================================================

async function tryRipgrep(
  pool: TerminalPool,
  kernelService: KernelService,
  pattern: string,
  path: string | undefined,
  include: string | undefined,
  maxResults: number,
  maxLineLength: number,
  parse: boolean,
  caseSensitive: boolean,
  cwd?: string
): Promise<GrepResult | null> {
  const searchPath = (path || ".").replace(/'/g, "'\\''");
  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const includeGlobs = parseIncludeGlobs(include ?? "");

  let rgSearch = `rg --no-heading -n --color=never`;
  if (!caseSensitive) {
    rgSearch += " --ignore-case";
  }
  rgSearch += ` -e '${escapedPattern}'`;

  for (const g of includeGlobs) {
    const escaped = g.replace(/'/g, "'\\''");
    rgSearch += ` -g '${escaped}'`;
  }

  rgSearch += ` '${searchPath}' 2>/dev/null`;

  const escapedCwd = cwd?.replace(/'/g, "'\\''");
  const rgCmd = escapedCwd ? `(cd '${escapedCwd}' && ${rgSearch})` : rgSearch;

  const result = await executeInSystemTerminal(pool, kernelService, {
    command: rgCmd,
    timeoutMs: GREP_TIMEOUT_MS,
    availabilityCheck: "command -v rg",
    availabilityCheckTimeoutMs: WHICH_TIMEOUT_MS,
  });

  if (!result.success || result.toolUnavailable) return null;

  if (!parse) {
    return {
      success: true,
      raw: result.output,
      matches: new Map(),
      truncated: false,
      total: 0,
      source: "rg",
      shellCommand: rgCmd,
    };
  }

  return {
    ...parseGrepOutput(result.output, maxResults, maxLineLength, "rg"),
    shellCommand: rgCmd,
  };
}

// ============================================================================
// POSIX grep strategy
// ============================================================================

async function tryPosixGrep(
  pool: TerminalPool,
  kernelService: KernelService,
  pattern: string,
  path: string | undefined,
  include: string | undefined,
  maxResults: number,
  maxLineLength: number,
  parse: boolean,
  caseSensitive: boolean,
  cwd?: string
): Promise<GrepResult | null> {
  const searchPath = (path || ".").replace(/'/g, "'\\''");
  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const includeGlobs = parseIncludeGlobs(include ?? "");

  // --include is supported on BSD grep (macOS 10.9+) and GNU grep.
  // It matches against the filename component only (not the full path),
  // which is sufficient for the typical `*.py`, `*.{ts,tsx}` patterns.
  const includeFlags = includeGlobs
    .map((g) => `--include='${g.replace(/'/g, "'\\''")}'`)
    .join(" ");

  const grepSearch = [
    "grep",
    "-r",           // recursive
    "-n",           // line numbers
    "--color=never",
    !caseSensitive ? "-i" : "",
    includeFlags,
    `-e '${escapedPattern}'`,
    `'${searchPath}'`,
    "2>/dev/null",
  ]
    .filter(Boolean)
    .join(" ");

  const escapedCwd = cwd?.replace(/'/g, "'\\''");
  const grepCmd = escapedCwd
    ? `(cd '${escapedCwd}' && ${grepSearch})`
    : grepSearch;

  const result = await executeInSystemTerminal(pool, kernelService, {
    command: grepCmd,
    timeoutMs: GREP_TIMEOUT_MS,
    // grep is always available; no availability check needed
  });

  if (!result.success) return null;

  // grep exits with code 1 (no matches) — this produces empty output, not an error
  if (!result.output.trim()) {
    return {
      success: true,
      matches: new Map(),
      truncated: false,
      total: 0,
      source: "grep",
      shellCommand: grepCmd,
    };
  }

  if (!parse) {
    return {
      success: true,
      raw: result.output,
      matches: new Map(),
      truncated: false,
      total: 0,
      source: "grep",
      shellCommand: grepCmd,
    };
  }

  return {
    ...parseGrepOutput(result.output, maxResults, maxLineLength, "grep"),
    shellCommand: grepCmd,
  };
}

// ============================================================================
// Shared output parser
// ============================================================================

/**
 * Parse `rg --no-heading -n` or `grep -rn` output.
 *
 * Line format (common to both tools):
 *   filepath:lineno:matched line content
 */
function parseGrepOutput(
  raw: string,
  maxResults: number,
  maxLineLength: number,
  source: "rg" | "grep"
): GrepResult {
  const matchLineRe = /^([^:]+):(\d+):(.*)/;
  const matches = new Map<string, GrepMatch[]>();
  let total = 0;
  let truncated = false;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(matchLineRe);
    if (!m) continue;

    if (total >= maxResults) {
      truncated = true;
      break;
    }

    const [, filePath, lineNoStr, content] = m;
    if (!matches.has(filePath)) matches.set(filePath, []);
    matches.get(filePath)!.push({
      line: parseInt(lineNoStr, 10),
      content: content.slice(0, maxLineLength),
    });
    total++;
  }

  return { success: true, matches, truncated, total, source };
}
