import type { AgentRule } from "./types";

/** Formats loaded workspace rules for injection into Orion agent prompts. */
export function buildRulesPromptSection(rules?: AgentRule[]): string | null {
  if (!rules || rules.length === 0) return null;

  const tripleBacktick = "```";
  const blocks = rules
    .filter((rule) => rule.content.trim().length > 0)
    .map((rule) => {
      return `### ${rule.scope === "workspace" ? "Workspace" : "Global"} Rule: \`${rule.path}\`

Source file: \`${rule.filename}\`

${tripleBacktick}markdown
${rule.content}
${tripleBacktick}`;
    });

  if (blocks.length === 0) return null;

  return `## Workspace Rules

The following project/user rule files were loaded from the active Jupyter workspace. Treat them as instructions for this workspace, subordinate to higher-priority system, developer, and tool instructions.

${blocks.join("\n\n")}`;
}
