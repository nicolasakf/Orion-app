import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/prompts/agent-system-prompt.md", () => ({
  default: "BASE AGENT PROMPT",
}));
vi.mock("@/lib/agent/prompts/agent-system-prompt-ask.md", () => ({
  default: "BASE ASK PROMPT",
}));
vi.mock("@/lib/agent/prompts/agent-system-prompt-edit.md", () => ({
  default: "BASE EDIT PROMPT",
}));

import {
  buildAgentSystemPrompt,
  buildAskModeSystemPrompt,
  buildEditModeSystemPrompt,
} from "./agent-system-prompt";
import { buildSubagentSystemPrompt } from "./subagents";
import type { AgentRule } from "./rules";

const rules: AgentRule[] = [
  {
    path: "AGENTS.md",
    filename: "AGENTS.md",
    scope: "workspace",
    content: "Always run the focused checks.",
  },
];

describe("agent rule prompt injection", () => {
  it("injects workspace rules into Agent, Ask, and Edit prompts", () => {
    for (const prompt of [
      buildAgentSystemPrompt({ agentRules: rules }),
      buildAskModeSystemPrompt({ agentRules: rules }),
      buildEditModeSystemPrompt({ agentRules: rules }),
    ]) {
      expect(prompt).toContain("## Workspace Rules");
      expect(prompt).toContain("`AGENTS.md`");
      expect(prompt).toContain("Always run the focused checks.");
    }
  });

  it("omits the workspace rules section when no rules are loaded", () => {
    expect(buildAgentSystemPrompt()).not.toContain("## Workspace Rules");
    expect(buildAskModeSystemPrompt()).not.toContain("## Workspace Rules");
    expect(buildEditModeSystemPrompt()).not.toContain("## Workspace Rules");
  });

  it("injects workspace rules into sub-agent prompts", () => {
    const prompt = buildSubagentSystemPrompt({
      subagent: {
        name: "analyst",
        label: "Analyst",
        originalNotebookPath: ".agents/subagents/analyst.agent.ipynb",
        tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
        systemPrompt: "Analyze carefully.",
      },
      agentRules: rules,
    });

    expect(prompt).toContain("## Workspace Rules");
    expect(prompt).toContain("`AGENTS.md`");
    expect(prompt).toContain("Always run the focused checks.");
  });
});
