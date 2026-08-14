import type { ModelMessage } from "@ai-sdk/provider-utils";
import { describe, expect, it } from "vitest";

import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";
import { mergeModelCatalog } from "@/lib/agent/model-catalog-merge";
import { ModelGateway } from "@/lib/agent/model-gateway";
import { getProviderAdapter } from "@/lib/agent/providers/registry";

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
    expect(result.providerOptions).toMatchObject({
      openai: { store: false },
    });
  });
});

describe("provider registry", () => {
  it("resolves curated providers and custom OpenAI-compatible endpoints", () => {
    expect(getProviderAdapter("groq", { type: "byok", apiKey: "test" })?.label).toBe("Groq");
    expect(getProviderAdapter("cerebras", { type: "byok", apiKey: "test" })?.label).toBe("Cerebras");
    expect(getProviderAdapter("vercel", { type: "byok", apiKey: "test" })?.label).toBe("Vercel AI Gateway");
    expect(
      getProviderAdapter("my-provider", {
        type: "local_endpoint",
        baseUrl: "http://localhost:4000/v1",
        modelId: "my-model",
      })?.label
    ).toBe("my-provider");
    expect(getProviderAdapter("my-provider")).toBeUndefined();
  });

  it("normalizes the legacy extra-high reasoning effort to OpenAI's xhigh value", () => {
    const adapter = getProviderAdapter("openai");

    expect(
      adapter?.providerOptions({ modelSettings: { reasoningEffort: "extra-high" } })
    ).toMatchObject({
      openai: { reasoningEffort: "xhigh" },
    });
  });

  it("serializes named effort for direct Anthropic and Google calls", () => {
    expect(
      getProviderAdapter("anthropic")?.providerOptions({
        providerId: "anthropic",
        modelId: "claude-test",
        modelSettings: { reasoningEffort: "max" },
      })
    ).toEqual({ anthropic: { effort: "max" } });
    expect(
      getProviderAdapter("google")?.providerOptions({
        providerId: "google",
        modelId: "gemini-test",
        modelSettings: { reasoningEffort: "minimal" },
      })
    ).toEqual({ google: { thinkingConfig: { thinkingLevel: "minimal" } } });
  });

  it("serializes only xAI adapter-supported direct effort values", () => {
    const adapter = getProviderAdapter("xai");
    expect(adapter?.providerOptions({
      providerId: "xai",
      modelId: "grok-test",
      modelSettings: { reasoningEffort: "high" },
    })).toMatchObject({ openai: { reasoningEffort: "high" } });
    expect(adapter?.providerOptions({
      providerId: "xai",
      modelId: "grok-test",
      modelSettings: { reasoningEffort: "xhigh" },
    })).not.toMatchObject({ openai: { reasoningEffort: "xhigh" } });
  });

  it("does not force legacy Anthropic thinking budgets", () => {
    expect(
      getProviderAdapter("anthropic")?.providerOptions({
        providerId: "anthropic",
        modelId: "claude-test",
        modelSettings: { extendedThinking: true, thinkingBudgetTokens: 25_000 },
      })
    ).toEqual({});
  });

  it("uses native provider namespaces for verified Vercel creators", () => {
    const adapter = getProviderAdapter("vercel");
    expect(adapter?.providerOptions({
      providerId: "vercel",
      modelId: "openai/gpt-test",
      modelSettings: { reasoningEffort: "high" },
    })).toEqual({ openai: { reasoningEffort: "high" } });
    expect(adapter?.providerOptions({
      providerId: "vercel",
      modelId: "anthropic/claude-test",
      modelSettings: { reasoningEffort: "high" },
    })).toEqual({ anthropic: { effort: "high" } });
    expect(adapter?.providerOptions({
      providerId: "vercel",
      modelId: "google/gemini-test",
      modelSettings: { reasoningEffort: "low" },
    })).toEqual({ google: { thinkingConfig: { thinkingLevel: "low" } } });
    expect(adapter?.providerOptions({
      providerId: "vercel",
      modelId: "xai/grok-test",
      modelSettings: { reasoningEffort: "medium" },
    })).toEqual({ xai: { reasoningEffort: "medium" } });
    expect(adapter?.providerOptions({
      providerId: "vercel",
      modelId: "moonshotai/kimi-test",
      modelSettings: { reasoningEffort: "high" },
    })).toEqual({});
  });
});

describe("model catalog merging", () => {
  it("lets later catalog sources override snapshot rows", () => {
    const base: ModelCatalogEntry = {
      model_id: "m",
      label: "Snapshot",
      provider_id: "custom-provider",
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
      source: "snapshot" as const,
    };

    expect(
      mergeModelCatalog([base], [{ ...base, label: "User", source: "user" }])
    ).toEqual([{ ...base, label: "User", source: "user" }]);
  });

  it("does not erase reasoning enrichment when a later row omits it", () => {
    const base: ModelCatalogEntry = {
      model_id: "m",
      label: "Model",
      provider_id: "vercel",
      input_price_per_1m: null,
      output_price_per_1m: null,
      cached_price_per_1m: null,
      context_window: null,
      max_output_tokens: null,
      reasoning_options: [{ type: "effort", values: ["low", "high"] }],
      long_context_threshold: null,
      long_context_input_price_per_1m: null,
      long_context_output_price_per_1m: null,
      client_avail: true,
      pinned_by_default: false,
      created_at: "2026-01-01T00:00:00.000Z",
      source: "models_dev" as const,
    };

    expect(
      mergeModelCatalog([base], [{
        ...base,
        source: "vercel_gateway",
        reasoning_options: undefined,
      }])[0]?.reasoning_options
    ).toEqual([{ type: "effort", values: ["low", "high"] }]);
  });
});
