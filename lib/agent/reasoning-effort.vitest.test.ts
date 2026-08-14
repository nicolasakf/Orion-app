import { describe, expect, it } from "vitest";

import type { ModelCatalogEntry, ReasoningOption } from "./model-catalog";
import {
  getSupportedReasoningEfforts,
  validateReasoningModelSettings,
} from "./reasoning-effort";

const baseEntry: ModelCatalogEntry = {
  model_id: "gpt-test",
  label: "GPT Test",
  provider_id: "openai",
  input_price_per_1m: null,
  output_price_per_1m: null,
  cached_price_per_1m: null,
  context_window: null,
  max_output_tokens: null,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
  client_avail: true,
  pinned_by_default: false,
  created_at: "2026-01-01T00:00:00.000Z",
  source: "models_dev",
};

describe("reasoning effort support", () => {
  it("orders positive catalog values and intersects them with the adapter", () => {
    expect(getSupportedReasoningEfforts("google", "gemini-test", [
      { type: "toggle" },
      { type: "effort", values: ["high", null, "none", "minimal", "xhigh", "low"] },
      { type: "budget_tokens", min: 0, max: 24_576 },
    ])).toEqual(["minimal", "low", "high"]);
  });

  it("supports verified Vercel families and rejects unverified creators", () => {
    const options: ReasoningOption[] = [
      { type: "effort", values: ["low", "medium", "high"] },
    ];
    expect(getSupportedReasoningEfforts("vercel", "xai/grok-test", options))
      .toEqual(["low", "medium", "high"]);
    expect(getSupportedReasoningEfforts("vercel", "moonshotai/kimi-test", options))
      .toEqual([]);
  });

  it("drops stale, forged, absent, and adapter-unsupported settings", () => {
    const catalogEntry: ModelCatalogEntry = {
      ...baseEntry,
      reasoning_options: [{ type: "effort", values: ["low", "high", "max"] }],
    };
    expect(validateReasoningModelSettings({
      providerId: "openai",
      modelId: "gpt-test",
      catalogEntry,
      modelSettings: { reasoningEffort: "high", forged: true },
    })).toEqual({ reasoningEffort: "high" });
    expect(validateReasoningModelSettings({
      providerId: "openai",
      modelId: "gpt-test",
      catalogEntry,
      modelSettings: { reasoningEffort: "max" },
    })).toBeUndefined();
    expect(validateReasoningModelSettings({
      providerId: "openai",
      modelId: "gpt-test",
      catalogEntry,
      modelSettings: { reasoningEffort: "forged" },
    })).toBeUndefined();
    expect(validateReasoningModelSettings({
      providerId: "openai",
      modelId: "gpt-test",
      catalogEntry: undefined,
      modelSettings: { reasoningEffort: "high" },
    })).toBeUndefined();
  });
});
