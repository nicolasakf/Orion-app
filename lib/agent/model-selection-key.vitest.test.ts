import { describe, expect, it } from "vitest";

import {
  findModelBySelectionKey,
  formatModelSelectionKey,
  normalizePinnedModelKey,
  parseModelSelectionKey,
  resolveCatalogModelIdForApi,
} from "@/lib/agent/model-selection-key";

describe("model-selection-key", () => {
  it("formats and parses provider/model keys", () => {
    const key = formatModelSelectionKey("vercel", "anthropic/claude-sonnet-4-6");
    expect(key).toBe("vercel/anthropic/claude-sonnet-4-6");
    expect(parseModelSelectionKey(key)).toEqual({
      providerId: "vercel",
      modelId: "anthropic/claude-sonnet-4-6",
    });
  });

  it("finds models by composite key before bare id collisions", () => {
    const models = [
      { value: "claude-sonnet-4-6", provider: "anthropic" },
      { value: "claude-sonnet-4-6", provider: "vercel" },
    ];
    const vercelKey = formatModelSelectionKey("vercel", "claude-sonnet-4-6");
    expect(findModelBySelectionKey(models, vercelKey)?.provider).toBe("vercel");
    expect(findModelBySelectionKey(models, "claude-sonnet-4-6")?.provider).toBe(
      "anthropic"
    );
  });

  it("upgrades legacy pins when catalog match is unique", () => {
    expect(
      normalizePinnedModelKey("gemini-3.1-flash-lite", [
        { model_id: "gemini-3.1-flash-lite", provider_id: "google" },
      ])
    ).toBe("google/gemini-3.1-flash-lite");
  });

  it("keeps ambiguous legacy pins unchanged", () => {
    expect(
      normalizePinnedModelKey("claude-sonnet-4-6", [
        { model_id: "claude-sonnet-4-6", provider_id: "anthropic" },
        { model_id: "claude-sonnet-4-6", provider_id: "vercel" },
      ])
    ).toBe("claude-sonnet-4-6");
  });

  it("does not treat slash-bearing bare model ids as composite keys", () => {
    expect(parseModelSelectionKey("moonshotai/kimi-k2.5")).toBeNull();
    const models = [{ value: "moonshotai/kimi-k2.5", provider: "vercel" }];
    expect(findModelBySelectionKey(models, "moonshotai/kimi-k2.5")?.provider).toBe(
      "vercel"
    );
    expect(
      normalizePinnedModelKey("moonshotai/kimi-k2.5", [
        { model_id: "moonshotai/kimi-k2.5", provider_id: "vercel" },
      ])
    ).toBe("vercel/moonshotai/kimi-k2.5");
  });

  it("resolves gateway ids whose prefix matches another Orion provider", () => {
    // Vercel AI Gateway routes with upstream ids like openai/…; prefix must not steal lookup.
    const models = [{ value: "openai/gpt-oss-120b", provider: "vercel" }];
    expect(findModelBySelectionKey(models, "openai/gpt-oss-120b")?.provider).toBe("vercel");
    expect(resolveCatalogModelIdForApi("vercel/openai/gpt-oss-120b", models[0])).toBe(
      "openai/gpt-oss-120b"
    );
  });

  it("resolves slash-bearing ids on non-gateway providers", () => {
    const models = [{ value: "qwen/qwen3-32b", provider: "groq" }];
    expect(parseModelSelectionKey("qwen/qwen3-32b")).toBeNull();
    expect(findModelBySelectionKey(models, "qwen/qwen3-32b")?.provider).toBe("groq");
  });
});
