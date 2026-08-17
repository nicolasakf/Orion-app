import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { makeAgentLoopTranscript } from "./__fixtures__/context-payloads";
import {
  buildWirePayload,
  optimizeMessagesForWire,
  stripAllRasterData,
} from "./context-optimizer";

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

  it("removes read_cell_output image payloads after a subsequent assistant step", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Show me the chart" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_cell_output",
            toolCallId: "read-1",
            state: "output-available",
            input: { reads: [{ cellIndex: 9, outputIndex: 0 }] },
            output: {
              text: "Cell 9, output 0 (display_data):",
              images: [{ mimeType: "image/png", data: "x".repeat(219_000) }],
            },
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "The callouts overlap on the left." }],
      },
    ] as unknown as UIMessage[];

    const optimized = optimizeMessagesForWire(messages);
    const readPart = optimized[1].parts[0] as unknown as {
      output: { text: string; images: unknown[] };
    };
    expect(readPart.output.images).toEqual([]);
    expect(readPart.output.text).toContain("image preview(s) removed");
  });

  it("stubs old tool steps inside a single user turn without research mode", () => {
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

describe("compaction replay", () => {
  /** A one-user-turn agent loop, the shape that overflows mid-turn. */
  const singleTurnMessages = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "Remove the second chart" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-execute_cell",
          toolCallId: "exec-1",
          state: "output-available",
          input: { cellIndices: [9], timeoutSeconds: 60 },
          output: "done",
        },
      ],
    },
  ] as unknown as UIMessage[];

  it("re-issues the live user turn when the summary absorbed it", () => {
    const wire = buildWirePayload(singleTurnMessages, {
      text: "Reworked cell 9.",
      coversThrough: "a1",
      createdAt: new Date(0),
      resumeFromMessageId: "u1",
    });

    expect(wire.map((message) => message.id)).toEqual([
      "compaction-u-0",
      "compaction-a-0",
      "u1",
    ]);
  });

  it("leaves the payload with no real user turn when no resume id is recorded", () => {
    const wire = buildWirePayload(singleTurnMessages, {
      text: "Reworked cell 9.",
      coversThrough: "a1",
      createdAt: new Date(0),
    });

    expect(wire.map((message) => message.id)).toEqual(["compaction-u-0", "compaction-a-0"]);
  });

  it("does not duplicate a resume message that survives after the boundary", () => {
    const twoTurnMessages = [
      ...singleTurnMessages,
      { id: "u2", role: "user", parts: [{ type: "text", text: "Now shrink the callouts" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "Done." }] },
    ] as unknown as UIMessage[];

    const wire = buildWirePayload(twoTurnMessages, {
      text: "Earlier work.",
      coversThrough: "a1",
      createdAt: new Date(0),
      resumeFromMessageId: "u2",
    });

    expect(wire.filter((message) => message.id === "u2")).toHaveLength(1);
    expect(wire.map((message) => message.id)).toEqual([
      "compaction-u-0",
      "compaction-a-0",
      "u2",
      "a2",
    ]);
  });
});

describe("single-message agent loop retention", () => {
  /** Extracts the tool parts of the one assistant message an agent loop produces. */
  function toolParts(messages: UIMessage[]) {
    return messages[1].parts.filter((part) =>
      part.type.startsWith("tool-")
    ) as unknown as Array<{
      output: string | { visuals?: Array<Record<string, unknown>> };
    }>;
  }

  it("stubs tool output beyond the step retention window inside one assistant message", () => {
    const optimized = optimizeMessagesForWire(makeAgentLoopTranscript(20), {
      retentionSteps: 6,
    });
    const outputs = toolParts(optimized).map((part) => part.output);

    // Everything older than the last 6 steps collapses to a stub string.
    expect(outputs.slice(0, 14).every((output) => typeof output === "string")).toBe(true);
    expect(outputs[0]).toContain("stubbed for context");
    // The retained tail keeps its structured output.
    expect(outputs.slice(14).every((output) => typeof output === "object")).toBe(true);
  });

  it("strips raster bytes from every step the model has already moved past", () => {
    const optimized = optimizeMessagesForWire(makeAgentLoopTranscript(20), {
      retentionSteps: 6,
    });
    const retained = toolParts(optimized)
      .map((part) => part.output)
      .filter((output): output is { visuals?: Array<Record<string, unknown>> } =>
        typeof output === "object"
      );

    // Only the final step is still awaiting review; the rest lose their bytes.
    const withBytes = retained.filter((output) =>
      output.visuals?.some((visual) => typeof visual.data === "string")
    );
    expect(withBytes).toHaveLength(1);
  });

  it("keeps a short loop verbatim", () => {
    const optimized = optimizeMessagesForWire(makeAgentLoopTranscript(3), {
      retentionSteps: 6,
    });

    expect(toolParts(optimized).every((part) => typeof part.output === "object")).toBe(true);
  });

  it("shrinks the wire payload for a loop the size of session 1786825713795", () => {
    const messages = makeAgentLoopTranscript(37, 120_000);
    const size = (value: UIMessage[]) => JSON.stringify(value).length;

    const optimized = optimizeMessagesForWire(messages, { retentionSteps: 6 });

    // The unoptimized loop is what produced a 550k-token prompt in production.
    expect(size(optimized)).toBeLessThan(size(messages) / 10);
  });
});

describe("persistence raster stripping", () => {
  it("drops bytes from every step, including the one still awaiting review", () => {
    const messages = makeAgentLoopTranscript(4);

    const persisted = stripAllRasterData(messages);
    const visuals = persisted[1].parts
      .filter((part) => part.type.startsWith("tool-"))
      .map((part) => (part as unknown as { output: { visuals: Array<{ data?: string }> } }).output);

    expect(visuals).toHaveLength(4);
    expect(visuals.every((output) => output.visuals.every((v) => v.data === undefined))).toBe(true);
    // The wire optimizer, by contrast, must keep the newest preview reviewable.
    const onWire = optimizeMessagesForWire(messages, { retentionSteps: 6 });
    const wireVisuals = onWire[1].parts
      .filter((part) => part.type.startsWith("tool-"))
      .map((part) => (part as unknown as { output: { visuals: Array<{ data?: string }> } }).output);
    expect(wireVisuals.at(-1)?.visuals[0].data).toBeDefined();
  });

  it("shrinks what a session the size of 1786825713795 writes to storage", () => {
    const messages = makeAgentLoopTranscript(37, 120_000);

    const persisted = stripAllRasterData(messages);

    expect(JSON.stringify(persisted).length).toBeLessThan(
      JSON.stringify(messages).length / 100
    );
  });
});
