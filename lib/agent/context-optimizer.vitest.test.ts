import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { optimizeMessagesForWire } from "./context-optimizer";

describe("same-turn raster optimization", () => {
  it("removes raw raster bytes after an accepted structured inspection", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Plot the data" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-execute_code",
            toolCallId: "exec-1",
            state: "output-available",
            input: { code: "plot()", timeoutSeconds: 60 },
            output: {
              text: "[Image: PNG]",
              visuals: [
                {
                  visualId: "plot-1",
                  mimeType: "image/png",
                  data: "raw-base64",
                  source: "execute_code",
                  outputIndex: 0,
                  byteLength: 8,
                },
              ],
            },
          },
          {
            type: "tool-record_visual_inspection",
            toolCallId: "inspect-1",
            state: "output-available",
            input: {
              inspections: [
                {
                  visualId: "plot-1",
                  description: "Readable chart",
                  verdict: "valid",
                  issues: [],
                  disposition: "accept",
                  supportingChecks: [],
                  supersedesVisualId: "",
                },
              ],
            },
            output: { accepted: true, inspectedVisualIds: ["plot-1"] },
          },
        ],
      },
    ] as unknown as UIMessage[];

    const optimized = optimizeMessagesForWire(messages);
    const executionPart = optimized[1].parts[0] as unknown as {
      output: { visuals: Array<Record<string, unknown>> };
    };
    expect(executionPart.output.visuals[0].data).toBeUndefined();
    expect(executionPart.output.visuals[0].visualInspectionUnavailableReason).toContain("removed");
  });
});
