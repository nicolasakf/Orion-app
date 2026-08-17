import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { PLOT_BASE64_CHARS, RASTER_SHAPES } from "./__fixtures__/context-payloads";
import {
  BASE64_CHARS_PER_TOKEN,
  calculateContextBudget,
  estimateAppendedTokens,
  estimateDraftTokens,
} from "./token-budget";

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

describe("estimateDraftTokens", () => {
  it("prices composer text at the prose ratio", () => {
    const estimate = estimateDraftTokens({ text: "a".repeat(370) });

    expect(estimate.textTokens).toBe(100);
    expect(estimate.tokens).toBe(100);
  });

  it("prices pending image attachments at the flat rate", () => {
    const estimate = estimateDraftTokens({ text: "", imageAttachmentCount: 2 });

    expect(estimate.attachmentTokens).toBe(3000);
    expect(estimate.tokens).toBe(3000);
  });

  it("prices the reference block the server will inline", () => {
    const estimate = estimateDraftTokens({ text: "", referenceBlockChars: 740 });

    expect(estimate.referenceTokens).toBe(200);
  });

  it("costs nothing for an empty composer", () => {
    expect(estimateDraftTokens({ text: "" }).tokens).toBe(0);
  });
});

describe("estimateAppendedTokens", () => {
  it("counts image file parts in the image budget", () => {
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

    expect(estimateAppendedTokens(messages).imageTokens).toBe(1500);
  });

  it.each(RASTER_SHAPES)(
    "prices inline $name payloads at the base64 rate",
    (shape) => {
      const estimate = estimateAppendedTokens([shape.buildUiMessage(PLOT_BASE64_CHARS)]);

      // Pricing these at the prose ratio is what let a 219 KB plot slip past the
      // pre-send budget check.
      expect(estimate.imageTokens).toBe(Math.ceil(PLOT_BASE64_CHARS / BASE64_CHARS_PER_TOKEN));
      // The same bytes must not also be counted as tool prose.
      expect(estimate.toolTokens).toBeLessThan(1000);
    }
  );

  it("costs nothing for an empty tail", () => {
    expect(estimateAppendedTokens([]).tokens).toBe(0);
  });
});
