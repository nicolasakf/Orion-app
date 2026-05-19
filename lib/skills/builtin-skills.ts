/**
 * Built-in skills shipped with Orion.
 *
 * Each skill lives in its own SKILL.md file under lib/skills/builtin/<name>/SKILL.md.
 * This file imports the raw markdown and parses the YAML frontmatter at module load time.
 * Workspace and user skills (`.agents/skills` vs `.orion/skills` overrides) can override these by name.
 */

import { parseFrontmatter } from "./parse-frontmatter";
import type { SkillInfo } from "./types";

import createSkillRaw from "./builtin/create-skill/SKILL.md";
import createSubagentRaw from "./builtin/create-subagent/SKILL.md";
import chatHistoryRaw from "./builtin/chat-history/SKILL.md";
import orionMetadataRaw from "./builtin/orion-metadata/SKILL.md";
import orionSettingsRaw from "./builtin/orion-settings/SKILL.md";

/** Converts a bundled SKILL.md file into a registry entry. */
function parseBuiltinSkill(raw: string): SkillInfo {
  const { name, description, disableModelInvocation, content } = parseFrontmatter(raw);
  if (!name || !description) {
    throw new Error(`Built-in SKILL.md is missing required frontmatter fields (name, description)`);
  }
  return {
    name,
    description,
    content,
    ...(disableModelInvocation !== undefined ? { disableModelInvocation } : {}),
    source: "builtin",
  };
}

export const BUILTIN_SKILLS: SkillInfo[] = [
  parseBuiltinSkill(createSkillRaw),
  parseBuiltinSkill(createSubagentRaw),
  parseBuiltinSkill(orionSettingsRaw),
  parseBuiltinSkill(chatHistoryRaw),
  parseBuiltinSkill(orionMetadataRaw),
];
