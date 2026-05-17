/**
 * Skill types for Orion's skills system.
 *
 * Skills are reusable instruction sets that guide the AI agent's behavior
 * for specific task types (e.g. EDA, data cleaning, visualization).
 */

import { z } from "zod";

export const SkillInfoSchema = z.object({
  /** Unique identifier — lowercase alphanumeric with single-hyphen separators (e.g. "eda", "data-cleaning") */
  name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Name must be lowercase alphanumeric with hyphens"),
  /** Short description shown in the UI and injected into the system prompt */
  description: z.string().min(1).max(1024),
  /** Full markdown instruction content loaded when the skill is invoked */
  content: z.string(),
  /** When true, the model should not see or invoke this skill automatically. */
  disableModelInvocation: z.boolean().optional(),
  /** Where the skill originates from */
  source: z.enum(["builtin", "workspace"]),
  /** Workspace path (only set for workspace skills) */
  location: z.string().optional(),
});

export type SkillInfo = z.infer<typeof SkillInfoSchema>;
