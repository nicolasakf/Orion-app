/**
 * Minimal YAML frontmatter parser for SKILL.md files.
 *
 * Handles the subset of YAML used in skill files: scalar key-value pairs
 * separated by the first colon on each line.
 */
export function parseFrontmatter(rawContent: string): {
  name?: string;
  description?: string;
  disableModelInvocation?: boolean;
  content: string;
} {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { content: rawContent };
  }
  const [, yaml, body] = match;
  const data: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) data[key] = value;
    }
  }
  const disableModelInvocation = parseBoolean(data["disable-model-invocation"]);
  return {
    name: data.name,
    description: data.description,
    ...(disableModelInvocation !== undefined ? { disableModelInvocation } : {}),
    content: body.trim(),
  };
}

/** Parses YAML-style boolean scalars used by Orion skill frontmatter. */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}
