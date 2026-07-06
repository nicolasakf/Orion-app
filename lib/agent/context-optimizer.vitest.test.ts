import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { optimizeMessagesForWire } from "./context-optimizer";

describe("same-turn raster optimization", () => {
  it("removes raw raster bytes after a subsequent assistant step", () => {
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
        ],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "The plot shows a right-skewed distribution." }],
      },
    ] as unknown as UIMessage[];

    const optimized = optimizeMessagesForWire(messages);
    const executionPart = optimized[1].parts[0] as unknown as {
      output: { visuals: Array<Record<string, unknown>> };
    };
    expect(executionPart.output.visuals[0].data).toBeUndefined();
    expect(executionPart.output.visuals[0].visualInspectionUnavailableReason).toContain("removed");
  });

  it("stubs old research tool steps inside a single user turn when research is active", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Analyze the dataset" }],
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `a${index + 1}`,
        role: "assistant",
        parts: [
          {
            type: "tool-execute_code",
            toolCallId: `execute-${index + 1}`,
            state: "output-available",
            input: { code: `print(${index})`, timeoutSeconds: 60 },
            output: `Large execution payload ${index}`,
          },
        ],
      })),
    ] as unknown as UIMessage[];

    const optimized = optimizeMessagesForWire(messages, {
      retentionTurns: 6,
      retentionSteps: 2,
      researchActive: true,
    });
    const firstExecution = optimized[1].parts[0] as unknown as {
      input: unknown;
      output: unknown;
    };
    const latestExecution = optimized.at(-1)!.parts[0] as unknown as {
      input: unknown;
      output: unknown;
    };

    expect(firstExecution.output).toEqual(expect.stringContaining("stubbed for context"));
    expect(latestExecution.input).toEqual(expect.objectContaining({ code: expect.any(String) }));
    expect(latestExecution.output).toBe("Large execution payload 4");
  });
});
