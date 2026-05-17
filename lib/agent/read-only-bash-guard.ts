/**
 * Shared read-only bash command guard.
 *
 * Used by Ask mode in the main agent loop to prevent destructive shell
 * commands from running in read-only contexts.
 */

const BLOCKED_COMMAND_PATTERNS: ReadonlyArray<RegExp> = [
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bpip\s+install\b/,
  /\bpip3\s+install\b/,
  /\bconda\s+install\b/,
  /\bnpm\s+install\b/,
  /\bnpm\s+ci\b/,
  /\byarn\s+add\b/,
  /\bgit\s+(commit|push|add|reset|checkout|merge|rebase|tag)\b/,
  />\s*\S+/,         // redirect to file: cmd > file or cmd >> file
  /\bdd\b/,
  /\btruncate\b/,
  /\bwget\b.*-[Oo]/, // wget with output flag
  /\bcurl\b.*-[Oo]/, // curl with output flag
];

/**
 * Returns a block-reason string if the command matches a destructive pattern,
 * or null if the command is safe to run in a read-only context.
 */
export function isReadOnlyBashBlocked(command: string): string | null {
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return `[BLOCKED] Terminal command blocked by read-only policy (matches pattern "${pattern.source}"). Only read-only shell commands are allowed.`;
    }
  }
  return null;
}
