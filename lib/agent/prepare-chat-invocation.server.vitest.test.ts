// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDefaultInteractionModeConfig } from "@/lib/agent/interaction-modes";

import { prepareChatInvocation } from "./prepare-chat-invocation.server";

describe("prepareChatInvocation", () => {
  it("does not advertise update_memory to sub-agents", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Analyze the notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-subagent-memory",
      interactionMode: getDefaultInteractionModeConfig("Agent"),
      origin: "subagent",
      subagentPrompt: {
        name: "analyst",
        label: "Analyst",
        originalNotebookPath: ".agents/subagents/analyst.agent.ipynb",
        tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
        systemPrompt: "Analyze carefully.",
      },
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(Object.keys(prepared.tools)).not.toContain("update_memory");
    expect(Object.keys(prepared.tools)).not.toContain("delegate");
    expect(prepared.agentSystemPrompt).toContain(
      "Durable memory updates are reserved for the parent agent",
    );
  });

  it("keeps the parent's editor notebook out of the sub-agent prompt", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Analyze the notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-subagent-context",
      interactionMode: getDefaultInteractionModeConfig("Agent"),
      origin: "subagent",
      // The user has the sub-agent's own definition notebook open and connected.
      notebookPath: ".agents/subagents/analyst.agent.ipynb",
      connectedNotebookPath: ".agents/subagents/analyst.agent.ipynb",
      subagentPrompt: {
        name: "analyst",
        label: "Analyst",
        originalNotebookPath: ".agents/subagents/analyst.agent.ipynb",
        tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
        systemPrompt: "Analyze carefully.",
      },
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    const prompt = prepared.agentSystemPrompt ?? "";

    // The forbidden original path may appear only in the "never touch it" warning,
    // never as a notebook the sub-agent is told to connect to or operate on.
    expect(prompt).not.toContain("## Open Notebook");
    expect(prompt).not.toContain(
      "The notebook currently connected to the agent's notebook tools is: `.agents/subagents/analyst.agent.ipynb`",
    );
    expect(prompt).toContain("**CRITICAL — never touch the original notebook.**");
    expect(prompt).toContain(
      'use_notebook` with `notebookPath: ".agents/subagents/tmp/analyst/run.ipynb"',
    );
  });

  it("reports the sub-agent's own temp notebook once it is connected", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Keep going." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-subagent-connected",
      interactionMode: getDefaultInteractionModeConfig("Agent"),
      origin: "subagent",
      notebookPath: "project/notebooks/user.ipynb",
      connectedNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
      subagentPrompt: {
        name: "analyst",
        label: "Analyst",
        originalNotebookPath: ".agents/subagents/analyst.agent.ipynb",
        tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
        systemPrompt: "Analyze carefully.",
      },
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    const prompt = prepared.agentSystemPrompt ?? "";

    expect(prompt).toContain(
      "The notebook currently connected to the agent's notebook tools is: `.agents/subagents/tmp/analyst/run.ipynb`",
    );
    expect(prompt).not.toContain("project/notebooks/user.ipynb");
  });

  it("withholds delegate and load_skill when nothing is available to target", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Clean the data." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-empty-registries",
      interactionMode: getDefaultInteractionModeConfig("Agent"),
      availableSkills: [],
      availableSubagents: [],
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(Object.keys(prepared.tools)).not.toContain("delegate");
    expect(Object.keys(prepared.tools)).not.toContain("load_skill");
    expect(Object.keys(prepared.tools)).toContain("insert_cell");
    expect(prepared.agentSystemPrompt).not.toContain("## Sub-agent Delegation");
    expect(prepared.agentSystemPrompt).not.toContain("## Available Skills");
  });

  it("keeps delegate available for a sub-agent hidden from model invocation", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Review the sales notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-hidden-subagent",
      interactionMode: getDefaultInteractionModeConfig("Agent"),
      availableSubagents: [
        {
          name: "analyst",
          label: "Analyst",
          description: "Reviews notebooks.",
          options: { disableModelInvocation: true },
        },
      ],
      agentRules: [],
      missingForcedSkillNames: [],
      forcedSubagentName: "analyst",
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(Object.keys(prepared.tools)).toContain("delegate");
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "delegate" });
  });

  it("describes the real tool set of a customized built-in mode", () => {
    const askMode = getDefaultInteractionModeConfig("Ask");
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Fix the typo in utils.py." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-customized-ask",
      // A user can enable writes on the built-in Ask mode in settings.
      interactionMode: {
        ...askMode,
        toolNames: [...askMode.toolNames, "edit_file"],
        bashPolicy: "full",
      },
      availableSkills: [],
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    const prompt = prepared.agentSystemPrompt ?? "";

    expect(Object.keys(prepared.tools)).toContain("edit_file");
    expect(prompt).not.toContain("**No file writes.**");
    expect(prompt).not.toContain("**Read-only shell.**");
    expect(prompt).toContain("**No code execution.**");
  });

  it("applies Business View terminology in every mode", () => {
    for (const modeId of ["Agent", "Ask", "Edit"] as const) {
      const prepared = prepareChatInvocation({
        messages: [{ role: "user", content: "Summarize the report." }],
        modelId: "gpt-test",
        providerId: "openai",
        credential: { type: "byok", apiKey: "test-key" },
        requestId: `request-business-${modeId}`,
        interactionMode: getDefaultInteractionModeConfig(modeId),
        availableSkills: [],
        agentRules: [],
        missingForcedSkillNames: [],
        communicationStyle: "default",
        businessExperienceMode: true,
        automaticContinuationAttempt: 0,
        automaticContinuationReason: "",
        canForceToolChoice: true,
        hasDelegatedForcedSubagent: false,
      });

      expect(prepared.agentSystemPrompt).toContain("## User-Facing Terminology");
      expect(prepared.agentSystemPrompt).toContain('Never say "Jupyter notebook"');
    }
  });

  it("uses the real mode prompt, normalized messages, and mode tool set without inference", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Explain this notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-1",
      interactionMode: getDefaultInteractionModeConfig("Ask"),
      availableSkills: [
        { name: "orion-docs", description: "Answers Orion product questions." },
      ],
      agentRules: [],
      missingForcedSkillNames: [],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(prepared.agentSystemPrompt).toContain("## Tool Access");
    expect(prepared.agentSystemPrompt).toContain("**No code execution.**");
    expect(prepared.agentSystemPrompt).toContain("**No file writes.**");
    expect(prepared.agentSystemPrompt).toContain("**Read-only shell.**");
    expect(prepared.messages[0]).toMatchObject({ role: "system" });
    expect(prepared.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Explain this notebook.",
    });
    expect(Object.keys(prepared.tools)).not.toContain("delegate");
    expect(Object.keys(prepared.tools)).toContain("list_kernels");
    expect(Object.keys(prepared.tools)).toContain("load_skill");
    expect(prepared.agentSystemPrompt).toContain("**orion-docs**");
    expect(prepared.toolChoice).toBe("auto");
  });

  it("forces a user-selected skill in Ask mode", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "How do Orion interaction modes work?" }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-2",
      interactionMode: getDefaultInteractionModeConfig("Ask"),
      availableSkills: [
        { name: "orion-docs", description: "Answers Orion product questions." },
      ],
      agentRules: [],
      missingForcedSkillNames: ["orion-docs"],
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(prepared.agentSystemPrompt).toContain('load_skill` with `name: "orion-docs"');
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "load_skill" });
  });

  it("includes a forced sub-agent name in a custom Ask-based mode", () => {
    const askMode = getDefaultInteractionModeConfig("Ask");
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Review the sales notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-3",
      interactionMode: {
        ...askMode,
        id: "ask-with-delegation",
        label: "Ask with delegation",
        builtIn: false,
        toolNames: [...askMode.toolNames, "delegate"],
      },
      availableSubagents: [
        {
          name: "analyst",
          label: "Analyst",
          description: "Reviews notebooks.",
        },
      ],
      agentRules: [],
      missingForcedSkillNames: [],
      forcedSubagentName: "analyst",
      communicationStyle: "default",
      businessExperienceMode: false,
      automaticContinuationAttempt: 0,
      automaticContinuationReason: "",
      canForceToolChoice: true,
      hasDelegatedForcedSubagent: false,
    });

    expect(prepared.agentSystemPrompt).toContain("**Analyst (`analyst`)**");
    expect(prepared.agentSystemPrompt).toContain(
      'delegate` with `subagent: "analyst"',
    );
    expect(prepared.toolChoice).toEqual({ type: "tool", toolName: "delegate" });
  });
});
