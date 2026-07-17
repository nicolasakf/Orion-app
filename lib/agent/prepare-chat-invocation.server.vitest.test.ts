// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDefaultInteractionModeConfig } from "@/lib/agent/interaction-modes";

import { prepareChatInvocation } from "./prepare-chat-invocation.server";

describe("prepareChatInvocation", () => {
  it("uses the real mode prompt, normalized messages, and mode tool set without inference", () => {
    const prepared = prepareChatInvocation({
      messages: [{ role: "user", content: "Explain this notebook." }],
      modelId: "gpt-test",
      providerId: "openai",
      credential: { type: "byok", apiKey: "test-key" },
      requestId: "request-1",
      interactionMode: getDefaultInteractionModeConfig("Ask"),
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
    expect(prepared.toolChoice).toBe("auto");
  });
});
