import { describe, expect, it } from "vitest";

import {
  getIntelligenceLevels,
  getSelectedIntelligenceLevel,
} from "./model-intelligence";
import type { LLM } from "./types";

describe("model Intelligence levels", () => {
  it("uses canonical ordering and the active adapter's wire values", () => {
    const model: LLM = {
      value: "gemini-test",
      label: "Gemini Test",
      provider: "google",
      reasoningOptions: [
        { type: "toggle" },
        { type: "effort", values: ["high", "xhigh", "none", "minimal", "low"] },
        { type: "budget_tokens", min: 0, max: 24_576 },
      ],
    };

    expect(getIntelligenceLevels("google", model).map((level) => level.value))
      .toEqual(["minimal", "low", "high"]);
  });

  it("hides budget-only, toggle-only, and absent capabilities", () => {
    const makeModel = (reasoningOptions: LLM["reasoningOptions"]): LLM => ({
      value: "test",
      label: "Test",
      provider: "anthropic",
      reasoningOptions,
    });

    expect(getIntelligenceLevels("anthropic", makeModel([
      { type: "budget_tokens", min: 1024 },
    ]))).toEqual([]);
    expect(getIntelligenceLevels("anthropic", makeModel([
      { type: "toggle" },
    ]))).toEqual([]);
    expect(getIntelligenceLevels("anthropic", makeModel(undefined))).toEqual([]);
  });

  it("falls back visually without writing a stale saved setting", () => {
    const withMedium: LLM = {
      value: "gpt-test",
      label: "GPT Test",
      provider: "openai",
      reasoningOptions: [{ type: "effort", values: ["low", "medium", "high"] }],
    };
    const withoutMedium: LLM = {
      ...withMedium,
      reasoningOptions: [{ type: "effort", values: ["minimal", "high"] }],
    };

    expect(getSelectedIntelligenceLevel("openai", withMedium, {
      reasoningEffort: "xhigh",
    })).toBe("medium");
    expect(getSelectedIntelligenceLevel("openai", withoutMedium, {})).toBe("minimal");
  });
});
