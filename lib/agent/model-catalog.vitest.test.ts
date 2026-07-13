import { describe, expect, it } from "vitest";

import { CLIENT_MODEL_CATALOG } from "@/lib/agent/model-catalog";

describe("OpenAI default pins", () => {
  it("includes GPT-5.5, GPT-5.6 Terra, and GPT-5.6 Luna", () => {
    const defaultOpenAIModelIds = CLIENT_MODEL_CATALOG
      .filter(
        (model) => model.provider_id === "openai" && model.pinned_by_default,
      )
      .map((model) => model.model_id);

    expect(defaultOpenAIModelIds).toEqual(
      expect.arrayContaining(["gpt-5.5", "gpt-5.6-terra", "gpt-5.6-luna"]),
    );
  });
});
