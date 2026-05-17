/**
 * Shared constants and utilities for file-system operations.
 *
 * Relocated from lib/agent/tools/constants.ts so that both agent tools and
 * future UI components (e.g. the left-sidebar search) share the same
 * definitions without importing from the agent layer.
 */

// ============================================================================
// Constants
// ============================================================================

/** Directory names skipped during recursive directory listings (e.g. list tool). */
export const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".ipynb_checkpoints",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".venv",
  "venv",
  "env",
  ".env",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".parcel-cache",
  ".DS_Store",
]);

/** Extensions of file formats that cannot be meaningfully searched as text. */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".bmp",
  ".svg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".parquet",
  ".pickle",
  ".pkl",
  ".h5",
  ".hdf5",
  ".nc",
  ".npy",
  ".npz",
  ".sqlite",
  ".db",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pyc",
  ".pyo",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
]);

// ============================================================================
// Glob → RegExp conversion
// ============================================================================

/**
 * Convert a glob pattern to a RegExp that can be matched against file paths.
 *
 * Supported syntax:
 *   `**`   — any sequence of path segments (crosses `/`)
 *   `*`    — any sequence of non-`/` characters
 *   `?`    — any single non-`/` character
 *   `.`    — literal dot
 *   `{a,b}`— alternation (either `a` or `b`)
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        regexStr += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === ".") {
      regexStr += "\\.";
      i++;
    } else if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end !== -1) {
        const alternatives = pattern
          .slice(i + 1, end)
          .split(",")
          .map(escapeRegexLiteral)
          .join("|");
        regexStr += `(?:${alternatives})`;
        i = end + 1;
      } else {
        regexStr += "\\{";
        i++;
      }
    } else if ("/[]()|^$+\\".includes(ch)) {
      regexStr += `\\${ch}`;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`, "i");
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Include-glob parsing
// ============================================================================

/**
 * Parse a user-supplied include-glob string into individual glob patterns.
 *
 * Supports:
 *   - Single glob:             `*.ts`
 *   - Comma-separated globs:   `*.ts,*.tsx,*.js`
 *   - Brace-expansion glob:    `*.{ts,tsx}` (kept as one glob)
 *   - Newline/semicolon-separated globs
 */
export function parseIncludeGlobs(include: string): string[] {
  const trimmed = include.trim();
  if (!trimmed) return [];

  const globs: string[] = [];
  let current = "";
  let braceDepth = 0;

  const flush = () => {
    const value = current.trim();
    if (value) globs.push(value);
    current = "";
  };

  for (const ch of trimmed) {
    if (ch === "{") braceDepth++;
    if (ch === "}" && braceDepth > 0) braceDepth--;

    if ((ch === "," || ch === "\n" || ch === ";") && braceDepth === 0) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();

  // If a single "glob" contains whitespace but no braces, treat it as
  // space-separated patterns (e.g. "*.ts *.tsx")
  if (globs.length === 1 && /\s+/.test(globs[0]) && !globs[0].includes("{")) {
    return globs[0].split(/\s+/).map((v) => v.trim()).filter(Boolean);
  }
  return globs;
}
