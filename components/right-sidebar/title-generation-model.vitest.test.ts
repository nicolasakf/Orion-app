import { describe, expect, it } from "vitest";

import { resolveTitleGenerationModel } from "./title-generation-model";

const models = [
  { provider: "google", value: "gemini-3.1-flash-lite" },
  { provider: "openai", value: "gpt-5.4-mini" },
  { provider: "openai", value: "gpt-5.4-nano" },
  { provider: "anthropic", value: "claude-sonnet-4" },
];

describe("resolveTitleGenerationModel", () => {
  it("uses GPT-5.4 Mini when ChatGPT OAuth is the only configured provider", () => {
    const model = resolveTitleGenerationModel({
      configuredModelId: "gemini-3.1-flash-lite",
      defaultModelId: "gemini-3.1-flash-lite",
      models,
      credentials: {
        openai: { type: "chatgpt_oauth", configured: true, expiresAt: 0 },
      },
    });

    expect(model).toEqual({ provider: "openai", value: "gpt-5.4-mini" });
  });

  it("replaces a persisted Nano selection for ChatGPT OAuth", () => {
    const model = resolveTitleGenerationModel({
      configuredModelId: "openai/gpt-5.4-nano",
      defaultModelId: "gemini-3.1-flash-lite",
      models,
      credentials: {
        openai: { type: "chatgpt_oauth", configured: true, expiresAt: 0 },
      },
    });

    expect(model).toEqual({ provider: "openai", value: "gpt-5.4-mini" });
  });

  it("keeps the configured model when its provider has a credential", () => {
    const model = resolveTitleGenerationModel({
      configuredModelId: "gemini-3.1-flash-lite",
      defaultModelId: "gemini-3.1-flash-lite",
      models,
      credentials: {
        google: { type: "api_key", configured: true },
        openai: { type: "chatgpt_oauth", configured: true, expiresAt: 0 },
      },
    });

    expect(model).toEqual({ provider: "google", value: "gemini-3.1-flash-lite" });
  });

  it("does not use the OpenAI fallback when another provider is configured", () => {
    const model = resolveTitleGenerationModel({
      configuredModelId: "gemini-3.1-flash-lite",
      defaultModelId: "gemini-3.1-flash-lite",
      models,
      credentials: {
        anthropic: { type: "api_key", configured: true },
        openai: { type: "chatgpt_oauth", configured: true, expiresAt: 0 },
      },
    });

    expect(model).toEqual({ provider: "google", value: "gemini-3.1-flash-lite" });
  });
});
