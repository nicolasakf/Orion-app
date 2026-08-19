// @vitest-environment node

import { describe, expect, it } from "vitest";

import { listProfileModelCandidates } from "@/lib/onboarding/profile-model.server";

/** Builds the slice of user settings the candidate list reads. */
function settings(titleGenerationModelId: string, pinnedModelIds: string[]) {
  return { chat: { titleGenerationModelId, pinnedModelIds } };
}

describe("listProfileModelCandidates", () => {
  it("prefers the configured background model over pinned models", () => {
    expect(
      listProfileModelCandidates(
        settings("google/gemini-3.1-flash-lite", ["openai/gpt-5.5"]),
      ),
    ).toEqual([
      { providerId: "google", modelId: "gemini-3.1-flash-lite" },
      { providerId: "openai", modelId: "gpt-5.5" },
    ]);
  });

  it("falls back to pinned models for a legacy bare title model id", () => {
    // The shipped default is a bare id with no provider, so a ChatGPT-only user
    // must still reach their pinned OpenAI models.
    expect(
      listProfileModelCandidates(
        settings("gemini-3.1-flash-lite", ["openai/gpt-5.5", "openai/gpt-5.6-terra"]),
      ),
    ).toEqual([
      { providerId: "openai", modelId: "gpt-5.5" },
      { providerId: "openai", modelId: "gpt-5.6-terra" },
    ]);
  });

  it("covers a user who only ever configured a non-OpenAI provider", () => {
    expect(
      listProfileModelCandidates(settings("gemini-3.1-flash-lite", ["anthropic/claude-opus-4-5"])),
    ).toEqual([{ providerId: "anthropic", modelId: "claude-opus-4-5" }]);
  });

  it("keeps provider-prefixed upstream ids intact", () => {
    expect(
      listProfileModelCandidates(settings("vercel/moonshotai/kimi-k2.5", [])),
    ).toEqual([{ providerId: "vercel", modelId: "moonshotai/kimi-k2.5" }]);
  });

  it("drops duplicates and unusable keys", () => {
    expect(
      listProfileModelCandidates(
        settings("openai/gpt-5.5", ["openai/gpt-5.5", "not-a-provider/x", "bare-id"]),
      ),
    ).toEqual([{ providerId: "openai", modelId: "gpt-5.5" }]);
  });

  it("returns nothing when no model names a known provider", () => {
    expect(listProfileModelCandidates(settings("bare-id", []))).toEqual([]);
  });
});
