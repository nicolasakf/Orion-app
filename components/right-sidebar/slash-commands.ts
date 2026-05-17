import { Bot, Brain, Minimize2, type LucideIcon } from "lucide-react";

/** A slash command available in the chat textbox. */
export interface SlashCommand {
  /** Internal identifier, e.g. "compact". */
  name: string;
  /** Display label shown in the palette, e.g. "/compact". */
  label: string;
  /** Short description shown next to the label. */
  description: string;
  /** Icon rendered alongside the command. */
  icon: LucideIcon;
  /** Category — used to group commands in the palette. */
  category?: "builtin" | "subagent" | "skill";
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "compact",
    label: "/compact",
    description: "Summarize conversation history to free context window space",
    icon: Minimize2,
    category: "builtin",
  },
];

/**
 * Build slash commands for the given skills.
 * Each skill is invoked as `/<name>`.
 */
export function buildSkillSlashCommands(
  skills: Array<{ name: string; description?: string }>
): SlashCommand[] {
  return skills.map((skill) => ({
    name: `skill:${skill.name}`,
    label: `/${skill.name}`,
    description: skill.description ?? "",
    icon: Brain,
    category: "skill" as const,
  }));
}

/**
 * Build slash commands for notebook-defined subagents.
 * Each subagent is invoked as `/<name>` and then translated to a delegate call.
 */
export function buildSubagentSlashCommands(
  subagents: Array<{ name: string; label?: string; description?: string; options?: unknown }>
): SlashCommand[] {
  return subagents.map((subagent) => ({
    name: `subagent:${subagent.name}`,
    label: `/${subagent.name}`,
    description: subagent.description ?? subagent.label ?? "",
    icon: Bot,
    category: "subagent" as const,
  }));
}
