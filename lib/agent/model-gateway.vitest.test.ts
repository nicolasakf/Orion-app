import type { ModelMessage } from "@ai-sdk/provider-utils";
import { describe, expect, it } from "vitest";

import { ModelGateway } from "@/lib/agent/model-gateway";

describe("ModelGateway ChatGPT OAuth history replay", () => {
  it("keeps encrypted reasoning replay data while stripping reusable OpenAI item ids", () => {
    const gateway = new ModelGateway();
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "",
            providerOptions: {
              openai: {
                itemId: "rs_encrypted",
                reasoningEncryptedContent: "encrypted-reasoning",
              },
            },
          },
          {
            type: "reasoning",
            text: "",
            providerOptions: {
              openai: {
                itemId: "rs_item_only",
              },
            },
          },
          {
            type: "text",
            text: "Visible assistant reply.",
            providerOptions: {
              openai: {
                itemId: "msg_123",
              },
            },
          },
        ],
      },
    ] as ModelMessage[];

    const result = gateway.processRequest({
      messages,
      modelId: "gpt-5.5",
      providerId: "openai",
      credentials: {
        type: "chatgpt_oauth",
        accessToken: "test-token",
      },
    });

    expect(result.messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "",
            providerOptions: {
              openai: {
                reasoningEncryptedContent: "encrypted-reasoning",
              },
            },
          },
          {
            type: "text",
            text: "Visible assistant reply.",
          },
        ],
      },
    ]);
  });
});
