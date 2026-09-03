import { describe, expect, it } from "vitest";

import {
  CONTEXT_USAGE_VERSION,
  type ContextMeasurement,
} from "@/lib/agent/context-usage";

import {
  normalizeChatMessageMetadata,
  parseChatMessageContextUsage,
  parseChatMessageGoalMessage,
} from "./chat-references";
import {
  ChatWireSchema,
  deserializeChat,
  serializeChat,
  type Chat,
} from "./chat-types";

function makeMeasurement(): ContextMeasurement {
  return {
    version: CONTEXT_USAGE_VERSION,
    kind: "provider",
    rawInputTokens: 18_000,
    inputTokens: 21_400,
    buckets: {
      system: 4000,
      messages: 9000,
      tools: 3000,
      images: 1500,
      framing: 500,
    },
    calibrationDelta: 3_400,
    confidence: "exact",
    calibrationSampleCount: 4,
    estimatorVersion: 2,
    window: {
      providerId: "anthropic",
      modelId: "claude-opus-5",
      contextWindow: 200_000,
      maxOutputTokens: 16_384,
      contextWindowSource: "models_dev",
      contextWindowFetchedAt: "2026-08-01T00:00:00.000Z",
      contextWindowIsFallback: false,
    },
    budget: {
      outputReserve: 10_000,
      usableInputTokens: 190_000,
      thresholdTokens: 174_800,
      autoCompactThreshold: 0.92,
    },
    status: "ok",
    percentUsed: 21_400 / 190_000,
    measuredAt: "2026-08-14T00:00:00.000Z",
  };
}

describe("normalizeChatMessageMetadata", () => {
  /**
   * The regression that would make the whole ground-truth path inert: assistant
   * messages carry context usage and nothing else, so an early return keyed only
   * on references and slash commands silently discards it on persist.
   */
  it("preserves context usage when it is the only field present", () => {
    const normalized = normalizeChatMessageMetadata({
      contextUsage: makeMeasurement(),
    });

    expect(normalized?.contextUsage?.inputTokens).toBe(21_400);
  });

  it("preserves context usage alongside other metadata", () => {
    const normalized = normalizeChatMessageMetadata({
      slashCommands: [{ label: "/compact" }],
      contextUsage: makeMeasurement(),
    });

    expect(normalized?.slashCommands).toHaveLength(1);
    expect(normalized?.contextUsage?.kind).toBe("provider");
  });

  it("still returns undefined for genuinely empty metadata", () => {
    expect(normalizeChatMessageMetadata({})).toBeUndefined();
    expect(
      normalizeChatMessageMetadata({ references: [], slashCommands: [] }),
    ).toBeUndefined();
  });

  it("preserves a goal draft marker without adding visible slash metadata", () => {
    expect(normalizeChatMessageMetadata({ goalContractDraft: true })).toEqual({
      goalContractDraft: true,
    });
  });

  it("validates and preserves supervisor message provenance", () => {
    const goalMessage = {
      source: "supervisor" as const,
      kind: "repair" as const,
      goalSessionId: "goal-1",
      reviewNumber: 2,
      evaluationId: "evaluation-2",
    };
    expect(normalizeChatMessageMetadata({ goalMessage })).toEqual({ goalMessage });
    expect(parseChatMessageGoalMessage({ goalMessage })).toEqual(goalMessage);
    expect(parseChatMessageGoalMessage({
      goalMessage: { ...goalMessage, reviewNumber: 0 },
    })).toBeNull();
  });

  it("drops malformed context usage rather than persisting it", () => {
    const normalized = normalizeChatMessageMetadata({
      contextUsage: { version: CONTEXT_USAGE_VERSION, inputTokens: "lots" },
    });

    expect(normalized).toBeUndefined();
  });
});

describe("parseChatMessageContextUsage", () => {
  it("returns the measurement from valid metadata", () => {
    expect(
      parseChatMessageContextUsage({ contextUsage: makeMeasurement() })
        ?.inputTokens,
    ).toBe(21_400);
  });

  it("returns null rather than throwing on unknown input", () => {
    expect(parseChatMessageContextUsage(undefined)).toBeNull();
    expect(
      parseChatMessageContextUsage({ contextUsage: { nope: true } }),
    ).toBeNull();
    expect(parseChatMessageContextUsage({ references: [] })).toBeNull();
  });
});

describe("chat persistence", () => {
  it("round-trips context usage through the wire shape", () => {
    const chat: Chat = {
      id: "chat-1",
      title: "Measured chat",
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      updatedAt: new Date("2026-08-14T00:00:00.000Z"),
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
          metadata: { contextUsage: makeMeasurement() },
          timestamp: new Date("2026-08-14T00:00:00.000Z"),
        },
      ],
    } as unknown as Chat;

    const wire = serializeChat(chat);

    // The wire schema is passthrough, so the anchor survives reload and chat
    // switch without a dedicated persistence path.
    expect(() => ChatWireSchema.parse(wire)).not.toThrow();
    const restored = deserializeChat(ChatWireSchema.parse(wire));
    const usage = parseChatMessageContextUsage(restored.messages[0].metadata);

    expect(usage?.inputTokens).toBe(21_400);
    expect(usage?.confidence).toBe("exact");
  });
});
