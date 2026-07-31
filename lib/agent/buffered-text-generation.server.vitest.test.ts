import type { LanguageModel, LanguageModelUsage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("ai", () => aiMocks);

import { generateBufferedText } from "./buffered-text-generation.server";

const usage = {
  inputTokens: 12,
  outputTokens: 4,
  totalTokens: 16,
} as LanguageModelUsage;

const options = {
  model: {} as LanguageModel,
  messages: [{ role: "user" as const, content: "Summarize this." }],
  maxOutputTokens: 100,
};

describe("generateBufferedText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses non-streaming generation for ordinary credentials", async () => {
    aiMocks.generateText.mockResolvedValue({
      text: "Summary",
      usage,
      providerMetadata: { openai: { responseId: "response-1" } },
    });

    await expect(generateBufferedText(options, "byok")).resolves.toEqual({
      text: "Summary",
      usage,
      providerMetadata: { openai: { responseId: "response-1" } },
    });
    expect(aiMocks.generateText).toHaveBeenCalledWith(options);
    expect(aiMocks.streamText).not.toHaveBeenCalled();
  });

  it("streams and buffers ChatGPT OAuth generation", async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve("Streamed summary"),
      usage: Promise.resolve(usage),
      providerMetadata: Promise.resolve({
        openai: { responseId: "response-2" },
      }),
    });

    await expect(
      generateBufferedText(options, "chatgpt_oauth"),
    ).resolves.toEqual({
      text: "Streamed summary",
      usage,
      providerMetadata: { openai: { responseId: "response-2" } },
    });
    expect(aiMocks.streamText).toHaveBeenCalledWith({
      ...options,
      onError: expect.any(Function),
    });
    expect(aiMocks.generateText).not.toHaveBeenCalled();
  });

  it("preserves the original provider error from a ChatGPT OAuth stream", async () => {
    const providerError = new Error("provider exploded");
    aiMocks.streamText.mockImplementation(
      (streamOptions: typeof options & {
        onError?: (event: { error: unknown }) => void;
      }) => {
        streamOptions.onError?.({ error: providerError });
        return {
          text: Promise.reject(
            new Error("No output generated. Check the stream for errors."),
          ),
          usage: Promise.resolve(usage),
          providerMetadata: Promise.resolve(undefined),
        };
      },
    );

    await expect(
      generateBufferedText(options, "chatgpt_oauth"),
    ).rejects.toBe(providerError);
  });
});
