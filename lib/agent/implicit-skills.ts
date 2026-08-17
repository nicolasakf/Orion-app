/** Built-in skill used for Orion-native interactive notebook UI work. */
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
  void options;
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
${loadLines}

Load them by these exact names. The user selected them for this turn, so they are loadable whether or not they also appear under Available Skills.`;
}
