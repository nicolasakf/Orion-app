import { describe, expect, it } from "vitest";

import {
  SESSION_FALLBACK_CHAT_MODEL_ID,
  resolveSelectedModelFallback,
} from "./model-selection";

describe("resolveSelectedModelFallback", () => {
  it("waits for settings before replacing a stored local endpoint model", () => {
    const fallback = resolveSelectedModelFallback({
      selectedModel: "ollama-local:gemma-4b",
      models: [{ value: SESSION_FALLBACK_CHAT_MODEL_ID, provider: "google" }],
      modelsCatalogLoaded: true,
      settingsReady: false,
    });

    expect(fallback).toBeNull();
  });

  it("keeps the stored model when settings-backed models make it available", () => {
    const fallback = resolveSelectedModelFallback({
      selectedModel: "ollama-local:gemma-4b",
      models: [
        { value: SESSION_FALLBACK_CHAT_MODEL_ID, provider: "google" },
        { value: "ollama-local:gemma-4b", provider: "ollama" },
      ],
      modelsCatalogLoaded: true,
      settingsReady: true,
    });

    expect(fallback).toBeNull();
  });

  it("uses the catalog fallback only after loaded sources cannot resolve the stored model", () => {
    const fallback = resolveSelectedModelFallback({
      selectedModel: "removed-model",
      models: [
        { value: "gpt-5.5", provider: "openai" },
        { value: SESSION_FALLBACK_CHAT_MODEL_ID, provider: "google" },
      ],
      modelsCatalogLoaded: true,
      settingsReady: true,
    });

    expect(fallback).toBe(SESSION_FALLBACK_CHAT_MODEL_ID);
  });

  it("keeps a composite selected model when duplicate model ids exist", () => {
    const fallback = resolveSelectedModelFallback({
      selectedModel: "vercel/moonshotai/kimi-k2.6",
      models: [
        { value: "moonshotai/kimi-k2.6", provider: "moonshotai" },
        { value: "moonshotai/kimi-k2.6", provider: "vercel" },
      ],
      modelsCatalogLoaded: true,
      settingsReady: true,
    });

    expect(fallback).toBeNull();
  });
});
