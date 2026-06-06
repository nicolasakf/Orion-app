export type AgentRuleScope = "global" | "workspace";

export interface AgentRule {
  path: string;
  filename: "AGENTS.md" | "CLAUDE.md";
  scope: AgentRuleScope;
  content: string;
}
