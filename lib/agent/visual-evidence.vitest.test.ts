import { describe, expect, it } from "vitest";

import {
  isExecutionToolResult,
  prepareExecutionToolResultForModel,
  prepareToolResultForModel,
  type ExecutionToolResult,
} from "./visual-evidence";

describe("execution raster preparation", () => {
  const result: ExecutionToolResult = {
    text: "[Image: PNG]",
    visuals: [
      {
        visualId: "plot-1",
        mimeType: "image/png",
        data: "abcd",
        source: "execute_code",
        outputIndex: 0,
        byteLength: 3,
      },
    ],
  };

  it("detects structured execution results", () => {
    expect(isExecutionToolResult(result)).toBe(true);
    expect(isExecutionToolResult({ text: "[Image]" })).toBe(false);
  });

  it("removes pixels and records a limitation for non-vision models", async () => {
    const prepared = await prepareExecutionToolResultForModel({
      result,
      supportsImageInput: false,
      imageMaxBase64Chars: 100,
    });

    expect(prepared.visuals[0].data).toBeUndefined();
    expect(prepared.visuals[0].visualInspectionUnavailableReason).toContain("does not support");
  });

  it("preserves an in-budget preview for vision models", async () => {
    const prepared = await prepareExecutionToolResultForModel({
      result,
      supportsImageInput: true,
      imageMaxBase64Chars: 100,
    });

    expect(prepared.visuals[0].data).toBe("abcd");
  });
});

describe("read_cell_output raster preparation", () => {
  /** The `{ text, images }` shape `read_cell_output` returns. */
  const readResult = {
    text: "Cell 23, output 0 (display_data):\n[Image: image/png]",
    images: [{ mimeType: "image/png", data: "A".repeat(128_000) }],
  };

  it("drops image payloads for a model without image input", async () => {
    const prepared = (await prepareToolResultForModel({
      result: readResult,
      supportsImageInput: false,
      imageMaxBase64Chars: 30_000,
    })) as { text: string; images: unknown[] };

    expect(prepared.images).toEqual([]);
    expect(prepared.text).toContain("does not support image input");
    // The textual description of the output survives.
    expect(prepared.text).toContain("Cell 23, output 0");
  });

  it("keeps image payloads for a model with image input", async () => {
    const prepared = (await prepareToolResultForModel({
      result: readResult,
      supportsImageInput: true,
      imageMaxBase64Chars: 30_000,
    })) as { images: Array<{ data: string }> };

    expect(prepared.images[0].data).toHaveLength(128_000);
  });

  it("still routes execution results through the execution path", async () => {
    const execution: ExecutionToolResult = {
      text: "[Cell 12] ran",
      visuals: [
        {
          visualId: "plot-1",
          mimeType: "image/png",
          data: "A".repeat(1_000),
          source: "execute_cell",
          outputIndex: 0,
          byteLength: 1_000,
        },
      ],
    };

    const prepared = (await prepareToolResultForModel({
      result: execution,
      supportsImageInput: false,
      imageMaxBase64Chars: 30_000,
    })) as ExecutionToolResult;

    // Execution results keep their visual metadata so the model still knows a
    // figure exists and why it cannot see it.
    expect(prepared.visuals[0].data).toBeUndefined();
    expect(prepared.visuals[0].visualInspectionUnavailableReason).toContain(
      "does not support image input"
    );
  });

  it("leaves results without raster payloads untouched", async () => {
    const plain = { text: "no images here" };

    await expect(
      prepareToolResultForModel({
        result: plain,
        supportsImageInput: false,
        imageMaxBase64Chars: 30_000,
      })
    ).resolves.toBe(plain);
  });
});
