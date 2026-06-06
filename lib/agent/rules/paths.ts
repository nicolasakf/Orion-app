const RULE_FILENAMES = new Set(["AGENTS.md", "CLAUDE.md"]);

/** Returns true when a Jupyter path points at an Orion-compatible rule file. */
export function isRuleFilePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  const filename = normalized.split("/").pop();
  return filename !== undefined && RULE_FILENAMES.has(filename);
}
