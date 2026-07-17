// @vitest-environment node

import type { ModelMessage } from "@ai-sdk/provider-utils";
import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { measurePreparedPrompt } from "./context-measurement.server";

describe("measurePreparedPrompt", () => {
  it("measures prepared system, messages, tools, tool results, framing, and images", async () => {
    const messages = [
      { role: "system", content: "Real mode-specific system prompt" },
      { role: "user", content: [
        { type: "text", text: "Candidate user message with attachment context" },
        { type: "image", image: "data:image/png;base64,abc" },
      ] },
      { role: "tool", content: [{
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "read_file",
        output: { type: "text", value: "optimized tool result" },
      }] },
    ] as unknown as ModelMessage[];
    const tools = {
      read_file: tool({
        description: "Reads a workspace file",
        inputSchema: z.object({ path: z.string() }),
      }),
    };

    const measured = await measurePreparedPrompt({ messages, tools });

    expect(measured.breakdown.system).toBeGreaterThan(0);
    expect(measured.breakdown.messages).toBeGreaterThan(0);
    expect(measured.breakdown.tools).toBeGreaterThan(0);
    expect(measured.breakdown.images).toBe(1500);
    expect(measured.breakdown.framing).toBeGreaterThan(0);
    expect(measured.estimatedInputTokens).toBe(Math.ceil(measured.rawInputTokens * 1.15));
    expect(measured).toMatchObject({ confidence: "low", calibrationSampleCount: 0 });
  });

  it("applies persisted calibrated correction after three samples", async () => {
    const measured = await measurePreparedPrompt({
      messages: [{ role: "user", content: "hello" }],
      tools: {},
      calibration: { sampleCount: 3, correctionRatio: 1.4 },
    });

    expect(measured.estimatedInputTokens).toBe(Math.ceil(measured.rawInputTokens * 1.4));
    expect(measured).toMatchObject({ confidence: "calibrated", calibrationSampleCount: 3 });
  });
});
