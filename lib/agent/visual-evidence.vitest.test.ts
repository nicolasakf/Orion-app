import { describe, expect, it } from "vitest";

import {
  isExecutionToolResult,
  prepareExecutionToolResultForModel,
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
