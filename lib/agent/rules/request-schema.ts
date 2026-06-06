import { z } from "zod";

import type { AgentRule } from "./types";
import { MAX_AGENT_RULE_CONTENT_CHARS, MAX_AGENT_RULES } from "./constants";

export const AgentRuleSchema = z.object({
  path: z.string().min(1).max(1_000),
  filename: z.enum(["AGENTS.md", "CLAUDE.md"]),
  scope: z.enum(["global", "workspace"]),
  content: z.string().min(1).max(MAX_AGENT_RULE_CONTENT_CHARS),
});

const AgentRulesSchema = z.array(AgentRuleSchema).max(MAX_AGENT_RULES);

/** Validates agent rule payloads supplied by the Orion browser client. */
export function parseAgentRulesPayload(raw: unknown): AgentRule[] | null {
  if (raw === undefined) return [];

  const parsed = AgentRulesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
