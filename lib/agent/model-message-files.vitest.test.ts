import { describe, expect, it } from "vitest";
import type { ModelMessage } from "@ai-sdk/provider-utils";

import { normalizeInlineDataUrlFileParts } from "./model-message-files";

describe("normalizeInlineDataUrlFileParts", () => {
  it("converts inline image file data URLs to raw base64 payloads", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "inspect this" },
          {
            type: "file",
            mediaType: "image/png",
            filename: "chart.png",
            data: "data:image/png;base64,QUJD123=",
          },
        ],
      },
    ] as ModelMessage[];

    const normalized = normalizeInlineDataUrlFileParts(messages);

    expect(normalized[0].content).toEqual([
      { type: "text", text: "inspect this" },
      {
        type: "file",
        mediaType: "image/png",
        filename: "chart.png",
        data: "QUJD123=",
      },
    ]);
  });

  it("leaves remote file URLs unchanged", () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "image/png",
            filename: "chart.png",
            data: "https://example.com/chart.png",
          },
        ],
      },
    ] as ModelMessage[];

    expect(normalizeInlineDataUrlFileParts(messages)).toEqual(messages);
  });
});
