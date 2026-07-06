import { describe, expect, it, vi } from "vitest";

vi.mock("./prompts/agent-system-prompt.md", () => ({
  default: "BASE AGENT PROMPT",
}));
vi.mock("./prompts/agent-system-prompt-ask.md", () => ({
  default: "BASE ASK PROMPT",
}));
vi.mock("./prompts/agent-system-prompt-edit.md", () => ({
  default: "BASE EDIT PROMPT",
}));

import {
  buildAgentSystemPrompt,
  buildAskModeSystemPrompt,
  buildEditModeSystemPrompt,
  buildResearchModeSystemPrompt,
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

describe("custom interaction mode prompt injection", () => {
  it("appends custom mode instructions while keeping workspace rules", () => {
    const prompt = buildAgentSystemPrompt({
      agentRules: rules,
      customSystemPrompt: "Prefer concise SQL explanations.",
    });

    expect(prompt).toContain("## Workspace Rules");
    expect(prompt).toContain("## Custom Interaction Mode Instructions");
    expect(prompt).toContain("Prefer concise SQL explanations.");
  });

  it("omits skill and delegation sections when their tools are disabled", () => {
    const prompt = buildAgentSystemPrompt({
      availableSkills: [{ name: "demo", description: "Demo skill" }],
      availableSubagents: [{ name: "analyst", description: "Analyze data" }],
      enableSkills: false,
      enableSubagents: false,
    });

    expect(prompt).not.toContain("## Available Skills");
    expect(prompt).not.toContain("## Sub-agent Delegation");
  });
});

describe("Research mode prompt", () => {
  it("frames research as iterative coherent steps without numeric batch limits", () => {
    const prompt = buildResearchModeSystemPrompt();

    expect(prompt).toContain("Do not draft the whole notebook up front");
    expect(prompt).toContain("document the observation and decision");
    expect(prompt).toContain("one plot family");
    expect(prompt).not.toContain("at most 3");
  });
});
