/** ANSI escape-sequence matcher used when presenting terminal-derived text. */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_SEQUENCE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/** Removes ANSI escape sequences from terminal or kernel output. */
export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_ESCAPE_SEQUENCE, "");
}
