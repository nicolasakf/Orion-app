import { describe, expect, it } from "vitest";

import { sanitizeTitleGenerationProviderOptions } from "./non-streaming-provider-options";

describe("sanitizeTitleGenerationProviderOptions", () => {
  it("removes only OpenAI's streaming-only option", () => {
    expect(
      sanitizeTitleGenerationProviderOptions({
        openai: {
          stream_options: { include_usage: true },
          reasoningEffort: "low",
        },
        anthropic: { thinking: { type: "disabled" } },
      })
    ).toEqual({
      openai: { reasoningEffort: "low" },
      anthropic: { thinking: { type: "disabled" } },
    });
  });

  it("returns provider options unchanged when OpenAI has no stream option", () => {
    const providerOptions = { google: { safetySettings: [] } };

    expect(sanitizeTitleGenerationProviderOptions(providerOptions)).toBe(
      providerOptions,
    );
  });

  it("removes Anthropic thinking from short title requests", () => {
    expect(
      sanitizeTitleGenerationProviderOptions({
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 10_000 },
          sendReasoning: true,
        },
      }),
    ).toEqual({
      anthropic: { sendReasoning: true },
    });
  });
});
