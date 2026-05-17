/**
 * Standalone glob function — finds files matching a glob pattern.
 *
 * Strategy (in order of preference):
 *   1. `fd` via a pooled system terminal — fast, respects .gitignore,
 *      native glob support, cross-platform.
 *   2. `find` via a pooled system terminal — POSIX-compatible fallback;
 *      uses only flags available on both macOS (BSD) and Linux (GNU).
 *
 * Returns structured data (not a formatted string) so callers can apply
 * their own rendering — agent tools format for the LLM, future UI components
 * can render a file list.
 *
 * Cross-OS notes:
 *   - `find` flags are kept strictly POSIX to work on macOS BSD find and GNU find.
 *   - Single quotes are used for shell arguments (compatible with bash/zsh/sh).
 *   - Path separators are always `/` (Jupyter normalises this on all platforms).
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { TerminalPool } from "../terminal-pool";
import type { GlobOptions, GlobResult } from "../types";
import { executeInSystemTerminal } from "../terminal-executor";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_RESULTS = 500;
const FIND_TIMEOUT_MS = 15_000;
const WHICH_TIMEOUT_MS = 3_000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Find files matching a glob pattern in the Jupyter workspace.
 *
 * @param pool          - TerminalPool for acquiring system terminals
 * @param kernelService - KernelService for I/O to the terminal
 * @param options       - `pattern`, `path` (optional), `maxResults` (optional)
 * @returns             Structured result with matched file paths and metadata
 */
export async function glob(
  pool: TerminalPool,
  kernelService: KernelService,
  options: GlobOptions
): Promise<GlobResult> {
  const {
    pattern,
    path,
    maxResults = DEFAULT_MAX_RESULTS,
    parse = true,
    caseSensitive = true,
    cwd,
  } = options;

  // 1. Try fd (fast, cross-platform, respects .gitignore)
  try {
    const fdResult = await tryFd(
      pool,
      kernelService,
      pattern,
      path,
      maxResults,
      parse,
      caseSensitive,
      cwd
    );
    if (fdResult !== null) return fdResult;
  } catch {
    // Fall through to find
  }

  // 2. Try POSIX find (universally available)
  try {
    const findResult = await tryFind(
      pool,
      kernelService,
      pattern,
      path,
      maxResults,
      parse,
      caseSensitive,
      cwd
    );
    if (findResult !== null) return findResult;
  } catch {
    // Both strategies failed
  }

  return { success: false, files: [], truncated: false, total: 0, source: null };
}

// ============================================================================
// fd strategy
// ============================================================================

async function tryFd(
  pool: TerminalPool,
  kernelService: KernelService,
  pattern: string,
  path: string | undefined,
  maxResults: number,
  parse: boolean,
  caseSensitive: boolean,
  cwd?: string
): Promise<GlobResult | null> {
  const searchPath = (path || ".").replace(/'/g, "'\\''");
  const effectivePattern = normalizeRecursiveRootGlob(pattern);
  const escapedPattern = effectivePattern.replace(/'/g, "'\\''");

  // For patterns containing `/`, match against the full path (not just basename)
  const fullPathFlag = effectivePattern.includes("/") ? "--full-path" : "";
  const caseFlag = caseSensitive ? "" : "--ignore-case";

  const fdSearch = [
    "fd",
    "--type f",
    "--color never",
    `--glob '${escapedPattern}'`,
    fullPathFlag,
    caseFlag,
    `--max-results ${maxResults}`,
    `'${searchPath}'`,
    "2>/dev/null",
  ]
    .filter(Boolean)
    .join(" ");

  const escapedCwd = cwd?.replace(/'/g, "'\\''");
  const fdCmd = escapedCwd ? `(cd '${escapedCwd}' && ${fdSearch})` : fdSearch;

  const result = await executeInSystemTerminal(pool, kernelService, {
    command: fdCmd,
    timeoutMs: FIND_TIMEOUT_MS,
    availabilityCheck: "command -v fd",
    availabilityCheckTimeoutMs: WHICH_TIMEOUT_MS,
  });

  if (!result.success || result.toolUnavailable) return null;

  if (!parse) {
    return {
      success: true,
      raw: result.output,
      files: [],
      truncated: false,
      total: 0,
      source: "fd",
      shellCommand: fdCmd,
    };
  }

  return { ...parseFileList(result.output, maxResults, "fd"), shellCommand: fdCmd };
}

// ============================================================================
// find strategy (POSIX-compatible)
// ============================================================================

async function tryFind(
  pool: TerminalPool,
  kernelService: KernelService,
  pattern: string,
  path: string | undefined,
  maxResults: number,
  parse: boolean,
  caseSensitive: boolean,
  cwd?: string
): Promise<GlobResult | null> {
  const searchPath = (path || ".").replace(/'/g, "'\\''");
  const effectivePattern = normalizeRecursiveRootGlob(pattern);
  const escapedPattern = effectivePattern.replace(/'/g, "'\\''");

  // -name only matches the filename component; -path '*/<pattern>' matches the
  // full path. Use -path when the glob contains a `/`.
  const matchFlag = effectivePattern.includes("/")
    ? `-path '*/${escapedPattern}'`
    : caseSensitive
      ? `-name '${escapedPattern}'`
      : `-iname '${escapedPattern}'`;

  // `head` is POSIX and available on all supported OS targets.
  const findSearch =
    `find '${searchPath}' -type f ${matchFlag} 2>/dev/null` +
    ` | head -${maxResults}`;

  const escapedCwd = cwd?.replace(/'/g, "'\\''");
  const findCmd = escapedCwd
    ? `(cd '${escapedCwd}' && ${findSearch})`
    : findSearch;

  const result = await executeInSystemTerminal(pool, kernelService, {
    command: findCmd,
    timeoutMs: FIND_TIMEOUT_MS,
    // `find` is always available; no availability check needed
  });

  if (!result.success) return null;

  if (!parse) {
    return {
      success: true,
      raw: result.output,
      files: [],
      truncated: false,
      total: 0,
      source: "find",
      shellCommand: findCmd,
    };
  }

  return { ...parseFileList(result.output, maxResults, "find"), shellCommand: findCmd };
}

/**
 * Normalise the leading double-star segment so root-level files are included.
 *
 * Example:
 * - pattern `double-star slash *.md` -> `*.md`
 * - pattern `double-star slash README.md` -> `README.md`
 */
function normalizeRecursiveRootGlob(pattern: string): string {
  return pattern.startsWith("**/") ? pattern.slice(3) : pattern;
}

// ============================================================================
// Helpers
// ============================================================================

/** Parse one-path-per-line terminal output from fd or find. */
function parseFileList(
  raw: string,
  maxResults: number,
  source: "fd" | "find"
): GlobResult {
  const rawLines = raw.split("\n");
  const files = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("ORION_"));

  const truncated = files.length >= maxResults;

  return {
    success: true,
    files,
    truncated,
    total: files.length,
    source,
  };
}
