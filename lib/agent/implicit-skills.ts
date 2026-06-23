/** Built-in skill auto-loaded for notebook work unless the editor context is a non-notebook file. */
export const ORION_UI_SKILL_NAME = "orion-ui";

/**
 * Skills Orion injects into `forcedSkillNames` based on session context.
 * Explicit slash-command selections are merged separately in `/api/chat`.
 */
export function resolveImplicitForcedSkillNames(options: {
  notebookPath?: string;
  activeFilePath?: string;
  origin?: string;
}): string[] {
  // Sub-agents always run in a temporary notebook copy.
  if (options.origin === "subagent") {
    return [ORION_UI_SKILL_NAME];
  }

  // A non-notebook file is open in the editor (e.g. `.py`, `.md`) — skip notebook UI guidance.
  if (options.activeFilePath && !options.notebookPath) {
    return [];
  }

  // A notebook is open in the editor.
  if (options.notebookPath) {
    return [ORION_UI_SKILL_NAME];
  }

  return [];
}

/** Builds the system-prompt section that requires loading one or more skills before other work. */
export function buildRequiredSkillsPromptSection(requiredSkillNames: string[]): string | null {
  if (requiredSkillNames.length === 0) return null;

  const skillList = requiredSkillNames.map((name) => `\`${name}\``).join(", ");
  const loadLines = requiredSkillNames
    .map((name) => `- You MUST call \`load_skill\` with \`name: "${name}"\`.`)
    .join("\n");

  return `## Required Skills

The following skills must be loaded before other work: ${skillList}.
${loadLines}`;
}
