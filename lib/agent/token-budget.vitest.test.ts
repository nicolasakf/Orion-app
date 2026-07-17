import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { calculateContextBudget, estimateMessageTokens } from "./token-budget";

describe("calculateContextBudget", () => {
  it.each([131_072, 200_000, 262_144, 1_000_000])(
    "preserves a model-specific %i token context window",
    (contextWindow) => {
      const budget = calculateContextBudget({ contextWindow });
      expect(budget.usableInputTokens + budget.outputReserve).toBe(contextWindow);
    }
  );

  it("caps adaptive reply headroom at the model output limit", () => {
    expect(
      calculateContextBudget({ contextWindow: 131_072, maxOutputTokens: 2048 })
    ).toMatchObject({ outputReserve: 2048, usableInputTokens: 129_024 });
  });

  it("applies the compaction threshold after output reservation", () => {
    expect(
      calculateContextBudget({ contextWindow: 200_000, autoCompactThreshold: 0.8 })
    ).toMatchObject({ outputReserve: 10_000, thresholdTokens: 152_000 });
  });
});

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
