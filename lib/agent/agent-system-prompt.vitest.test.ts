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

describe("user-facing terminology", () => {
  it("injects Orion notebook terminology only in Business View mode", () => {
    const businessPrompt = buildAgentSystemPrompt({ businessExperienceMode: true });
    const defaultPrompt = buildAgentSystemPrompt();
    const researchPrompt = buildResearchModeSystemPrompt();

    expect(businessPrompt).toContain("## User-Facing Terminology");
    expect(businessPrompt).toContain("Internally, you are working with **Jupyter notebooks**");
    expect(businessPrompt).toContain("Orion notebook");
    expect(businessPrompt).toContain('Never say "Jupyter notebook"');

    expect(defaultPrompt).not.toContain("## User-Facing Terminology");
    expect(researchPrompt).not.toContain("## User-Facing Terminology");
    expect(buildAskModeSystemPrompt()).not.toContain("## User-Facing Terminology");
    expect(buildEditModeSystemPrompt()).not.toContain("## User-Facing Terminology");
  });
});

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

describe("Business View mode prompt", () => {
  it("injects App View requirements when businessExperienceMode is true", () => {
    const prompt = buildAgentSystemPrompt({ businessExperienceMode: true });

    expect(prompt).toContain("## Business View Mode");
    expect(prompt).toContain("Load the `create-app` skill");
    expect(prompt).toContain("included in App View");
  });

  it("omits Business View mode guidance in the default experience", () => {
    expect(buildAgentSystemPrompt()).not.toContain("## Business View Mode");
    expect(buildResearchModeSystemPrompt()).not.toContain("## Business View Mode");
  });
});

describe("agent path prompt contract", () => {
  it("uses absolute host paths when a Jupyter root is known", () => {
    const prompt = buildAgentSystemPrompt({
      rootDirectory: "/Users/taylor",
      workspaceDirectory: "project",
      notebookPath: "project/notebooks/analysis.ipynb",
    });

    expect(prompt).toContain("Jupyter root absolute path: `/Users/taylor`");
    expect(prompt).toContain("Workspace absolute path: `/Users/taylor/project`");
    expect(prompt).toContain("Use absolute host paths for all path-like tool inputs");
    expect(prompt).toContain('notebookPath="/Users/taylor/project/notebooks/analysis.ipynb"');
    expect(prompt).toContain('cwd: "/Users/taylor/project"');
    expect(prompt).toContain("including outside the active workspace");
    expect(prompt).not.toContain("All file paths you reference should be relative");
    expect(prompt).not.toContain("always prefix the notebookPath with this directory");
  });

  it("uses absolute open-file hints when a Jupyter root is known", () => {
    const prompt = buildAskModeSystemPrompt({
      rootDirectory: "/Users/taylor",
      workspaceDirectory: "project",
      activeFilePath: "project/src/app.py",
    });

    expect(prompt).toContain("When the user says \"this file\", they mean `/Users/taylor/project/src/app.py`");
    expect(prompt).toContain('read_file` with path="/Users/taylor/project/src/app.py"');
    expect(prompt).toContain('edit_file` with path="/Users/taylor/project/src/app.py"');
  });

  it("falls back to Jupyter-relative paths when the root is unavailable", () => {
    const prompt = buildEditModeSystemPrompt({
      workspaceDirectory: "project",
      activeFilePath: "project/src/app.py",
    });

    expect(prompt).toContain("Absolute host paths are unavailable");
    expect(prompt).toContain("Use Jupyter-root-relative paths");
    expect(prompt).toContain('read_file` with path="project/src/app.py"');
  });
});
