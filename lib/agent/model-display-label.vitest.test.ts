import { describe, expect, it } from "vitest";

import {
  buildModelLabelsUpdate,
  getCustomModelLabel,
  resolveModelDisplayLabel,
} from "@/lib/agent/model-display-label";

describe("model display labels", () => {
  it("returns custom labels by provider/model key", () => {
    expect(
      getCustomModelLabel({ "openai/gpt-4o": "Work GPT" }, "openai", "gpt-4o")
    ).toBe("Work GPT");
    expect(getCustomModelLabel({}, "openai", "gpt-4o")).toBeUndefined();
  });

  it("falls back to the base label when no override exists", () => {
    expect(
      resolveModelDisplayLabel("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", {})
    ).toBe("Claude Sonnet 4.6");
    expect(
      resolveModelDisplayLabel(
        "anthropic",
        "claude-sonnet-4-6",
        "Claude Sonnet 4.6",
        { "anthropic/claude-sonnet-4-6": "Fast Sonnet" }
      )
    ).toBe("Fast Sonnet");
  });

  it("adds, updates, and removes label overrides", () => {
    expect(
      buildModelLabelsUpdate({}, "google", "gemini-3-flash", "Gemini Flash", "Gemini 3 Flash")
    ).toEqual({ "google/gemini-3-flash": "Gemini Flash" });

    expect(
      buildModelLabelsUpdate(
        { "google/gemini-3-flash": "Gemini Flash" },
        "google",
        "gemini-3-flash",
        "Gemini Fast",
        "Gemini 3 Flash"
      )
    ).toEqual({ "google/gemini-3-flash": "Gemini Fast" });

    expect(
      buildModelLabelsUpdate(
        { "google/gemini-3-flash": "Gemini Flash" },
        "google",
        "gemini-3-flash",
        "Gemini 3 Flash",
        "Gemini 3 Flash"
      )
    ).toEqual({});
  });
});
