import { describe, expect, it } from "vitest";

import { patchChatGPTBody } from "./registry";

describe("patchChatGPTBody", () => {
  it("removes response limits unsupported by the ChatGPT Codex backend", () => {
    const body = JSON.stringify({
      model: "gpt-5.2-codex",
      input: [{ role: "user", content: "Summarize this conversation." }],
      max_output_tokens: 1000,
      store: true,
      stream: true,
    });

    expect(JSON.parse(patchChatGPTBody(body) ?? "")).toEqual({
      model: "gpt-5.2-codex",
      input: [{ role: "user", content: "Summarize this conversation." }],
      store: false,
      stream: true,
    });
  });
});
