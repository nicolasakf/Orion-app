import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { estimateMessageTokens } from "./token-budget";

describe("estimateMessageTokens", () => {
  it("counts user image file parts in the image budget", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "Please inspect this image." },
          {
            type: "file",
            mediaType: "image/png",
            filename: "chart.png",
            url: "data:image/png;base64,abc123",
          },
        ],
      },
    ];

    const estimate = estimateMessageTokens(messages, "", { contextWindow: 100_000 });

    expect(estimate.breakdown.images).toBe(1500);
  });

  it("counts pending draft image attachments", () => {
    const estimate = estimateMessageTokens([], "", {
      contextWindow: 100_000,
      additionalImageCount: 2,
    });

    expect(estimate.breakdown.images).toBe(3000);
  });
});
