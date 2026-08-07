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
    expect(prepared.agentSystemPrompt).toContain(
      "Durable memory updates are reserved for the parent agent",
    );
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

    expect(prepared.agentSystemPrompt).toContain("CRITICAL: READ-ONLY ACCESS");
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
