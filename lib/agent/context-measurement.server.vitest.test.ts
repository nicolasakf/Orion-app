// @vitest-environment node

import type { ModelMessage } from "@ai-sdk/provider-utils";
import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { makeModelMessages, makeToolSet } from "./__fixtures__/context-payloads";
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

  it("does not count inline image bytes as both text and fixed image tokens", async () => {
    /** Measures one normalized inline image payload without model tools. */
    const measureImage = (image: string) =>
      measurePreparedPrompt({
        messages: [{
          role: "user",
          content: [{ type: "image", image, mediaType: "image/png" }],
        }] as unknown as ModelMessage[],
        tools: {},
      });

    const small = await measureImage("aGVsbG8=");
    const large = await measureImage("a".repeat(200_000));

    expect(large.breakdown.images).toBe(1500);
    expect(large.breakdown.messages).toBe(small.breakdown.messages);
    expect(large.rawInputTokens).toBe(small.rawInputTokens);
  });

  it("keeps the buckets exhaustive, so a displayed breakdown can sum to its total", async () => {
    const measured = await measurePreparedPrompt({
      messages: makeModelMessages({ turns: 3 }),
      tools: makeToolSet(),
    });

    const bucketSum = Object.values(measured.breakdown).reduce((sum, value) => sum + value, 0);

    expect(bucketSum).toBe(measured.rawInputTokens);
    expect(measured.breakdown.tools).toBeGreaterThan(0);
  });

  it("applies a calibrated ratio below 1 instead of flooring it", async () => {
    const measured = await measurePreparedPrompt({
      messages: [{ role: "user", content: "hello" }],
      tools: {},
      calibration: { sampleCount: 8, correctionRatio: 0.8 },
    });

    // A model the estimator systematically overshoots must be correctable
    // downward; flooring at 1 made that impossible before estimator version 2.
    expect(measured.estimatedInputTokens).toBe(Math.ceil(measured.rawInputTokens * 0.8));
  });

  it("clamps an implausible calibrated ratio to the supported band", async () => {
    const tooLow = await measurePreparedPrompt({
      messages: [{ role: "user", content: "hello" }],
      tools: {},
      calibration: { sampleCount: 8, correctionRatio: 0.01 },
    });
    const tooHigh = await measurePreparedPrompt({
      messages: [{ role: "user", content: "hello" }],
      tools: {},
      calibration: { sampleCount: 8, correctionRatio: 99 },
    });

    expect(tooLow.estimatedInputTokens).toBe(Math.ceil(tooLow.rawInputTokens * 0.5));
    expect(tooHigh.estimatedInputTokens).toBe(Math.ceil(tooHigh.rawInputTokens * 3));
  });
});
