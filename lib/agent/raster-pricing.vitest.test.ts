// @vitest-environment node

/**
 * The drift test `raster-payloads.ts` promises in its own docstring but never had.
 *
 * Every consumer of a raster payload must price the same bytes the same way. Before
 * estimator version 2 the server recognised images by `type`/`mediaType`, while the
 * `visuals[]` and `images[]` shapes carry `mimeType` — so a 219 KB plot measured as
 * roughly zero tokens server-side and the pre-send budget check never saw it.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PLOT_BASE64_CHARS,
  RASTER_SHAPES,
  makeBase64,
} from "./__fixtures__/context-payloads";
import { measurePreparedPrompt } from "./context-measurement.server";
import { stripRasterPayloads, summarizeRasterPayloads } from "./raster-payloads";
import { BASE64_CHARS_PER_TOKEN, priceRasterPayloads } from "./token-budget";

const EXPECTED_TOKENS = Math.ceil(PLOT_BASE64_CHARS / BASE64_CHARS_PER_TOKEN);

describe.each(RASTER_SHAPES)("raster shape $name", (shape) => {
  it("reports the full base64 payload to the shared summarizer", () => {
    const summary = summarizeRasterPayloads(shape.buildOutput(PLOT_BASE64_CHARS));

    expect(summary.count).toBe(1);
    expect(summary.base64Chars).toBe(PLOT_BASE64_CHARS);
  });

  it("prices the payload at the base64 rate, not the prose rate", () => {
    const priced = priceRasterPayloads(shape.buildOutput(PLOT_BASE64_CHARS));

    expect(priced.tokens).toBe(EXPECTED_TOKENS);
  });

  it("charges the server measurement for the real byte cost", async () => {
    const measured = await measurePreparedPrompt({
      messages: [shape.buildModelMessage(PLOT_BASE64_CHARS)],
      tools: {},
    });

    // Before the fix this was ~0 for visuals[] and images[]: the bytes were
    // blanked by the length heuristic and then never charged for.
    expect(measured.breakdown.images).toBeGreaterThanOrEqual(EXPECTED_TOKENS);
  });

  it("keeps the blanked bytes out of the prose buckets", async () => {
    const large = await measurePreparedPrompt({
      messages: [shape.buildModelMessage(PLOT_BASE64_CHARS)],
      tools: {},
    });
    const small = await measurePreparedPrompt({
      messages: [shape.buildModelMessage(16)],
      tools: {},
    });

    // Only the image bucket may grow with payload size; text accounting must not
    // see the base64 at all, or the bytes are billed twice.
    expect(large.breakdown.messages).toBe(small.breakdown.messages);
    expect(large.breakdown.images).toBeGreaterThan(small.breakdown.images);
  });

  it("costs nothing once the optimizer has stripped it", async () => {
    const stripped = stripRasterPayloads(shape.buildOutput(PLOT_BASE64_CHARS));

    expect(stripped.changed).toBe(true);
    expect(priceRasterPayloads(stripped.output).tokens).toBe(0);

    // The server must agree: a stripped entry sends no bytes, so it must not be
    // charged a residual flat image cost for the metadata left behind.
    const measured = await measurePreparedPrompt({
      messages: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-raster",
              toolName: "execute_cell",
              output: { type: "json", value: stripped.output },
            },
          ],
        },
      ] as never,
      tools: {},
    });

    expect(measured.breakdown.images).toBe(0);
  });

  it("agrees between the client and server estimators", async () => {
    const clientTokens = priceRasterPayloads(shape.buildOutput(PLOT_BASE64_CHARS)).tokens;
    const server = await measurePreparedPrompt({
      messages: [shape.buildModelMessage(PLOT_BASE64_CHARS)],
      tools: {},
    });

    expect(server.breakdown.images).toBe(clientTokens);
  });
});

describe("inline binary outside the known raster shapes", () => {
  it("is charged rather than silently blanked", async () => {
    const inlineBytes = makeBase64(120_000);
    const measured = await measurePreparedPrompt({
      messages: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-unknown",
              toolName: "some_future_tool",
              // A shape `raster-payloads.ts` does not know about yet.
              output: { type: "json", value: { attachment: { data: inlineBytes } } },
            },
          ],
        },
      ] as never,
      tools: {},
    });

    expect(measured.breakdown.images).toBeGreaterThanOrEqual(
      Math.ceil(inlineBytes.length / BASE64_CHARS_PER_TOKEN)
    );
  });
});
