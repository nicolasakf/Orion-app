/**
 * Shared payload fixtures for context-accounting tests.
 *
 * Every consumer of a raster payload — the client delta estimator, the server
 * prepared-prompt measurement, and the wire optimizer — must agree on what a
 * given payload costs. `RASTER_SHAPES` is the table that pins that agreement:
 * each entry renders the *same* bytes in the three forms those consumers see, so
 * a drift test can assert they price it identically.
 *
 * Kept under `__fixtures__` so it is outside the vitest `include` globs and never
 * collected as a suite of its own.
 */

import type { ModelMessage } from "@ai-sdk/provider-utils";
import { tool } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";

/** Size of the plot that slipped past the pre-send budget check in production. */
export const PLOT_BASE64_CHARS = 219_000;

/** Deterministic stand-in for base64 bytes; only its length matters to pricing. */
export function makeBase64(chars: number): string {
  return "A".repeat(chars);
}

export interface RasterShapeFixture {
  /** Shape name as documented in `raster-payloads.ts`. */
  name: string;
  /** Raw tool-result output carrying `chars` of base64. */
  buildOutput: (chars: number) => unknown;
  /** The same payload as a client-side UIMessage tool part. */
  buildUiMessage: (chars: number) => UIMessage;
  /** The same payload as a server-side prepared tool result. */
  buildModelMessage: (chars: number) => ModelMessage;
}

/** Wraps a tool output in the UIMessage part shape the client estimator walks. */
function asUiMessage(output: unknown): UIMessage {
  return {
    id: "assistant-raster",
    role: "assistant",
    parts: [
      {
        type: "tool-execute_cell",
        toolCallId: "call-raster",
        state: "output-available",
        input: { code: "plot()" },
        output,
      },
    ],
  } as unknown as UIMessage;
}

/** Wraps a tool output in the ModelMessage shape the server measurement walks. */
function asModelMessage(output: unknown): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-raster",
        toolName: "execute_cell",
        output: { type: "json", value: output },
      },
    ],
  } as unknown as ModelMessage;
}

/**
 * The three raster payload shapes that reach the wire, each carrying identical
 * bytes. Adding a shape to `raster-payloads.ts` without adding it here should
 * fail the drift test.
 */
export const RASTER_SHAPES: readonly RasterShapeFixture[] = [
  {
    name: "visuals[]",
    buildOutput: (chars) => ({
      text: "Executed in 0.4s",
      visuals: [{ mimeType: "image/png", data: makeBase64(chars) }],
    }),
    buildUiMessage: (chars) => asUiMessage(RASTER_SHAPES[0].buildOutput(chars)),
    buildModelMessage: (chars) => asModelMessage(RASTER_SHAPES[0].buildOutput(chars)),
  },
  {
    name: "images[]",
    buildOutput: (chars) => ({
      text: "Cell output",
      images: [{ mimeType: "image/png", data: makeBase64(chars) }],
    }),
    buildUiMessage: (chars) => asUiMessage(RASTER_SHAPES[1].buildOutput(chars)),
    buildModelMessage: (chars) => asModelMessage(RASTER_SHAPES[1].buildOutput(chars)),
  },
  {
    name: "value[].image-data",
    buildOutput: (chars) => ({
      value: [
        { type: "text", text: "Rendered figure" },
        { type: "image-data", mimeType: "image/png", data: makeBase64(chars) },
      ],
    }),
    buildUiMessage: (chars) => asUiMessage(RASTER_SHAPES[2].buildOutput(chars)),
    buildModelMessage: (chars) => asModelMessage(RASTER_SHAPES[2].buildOutput(chars)),
  },
];

/** A small tool set with real zod schemas, so the `tools` bucket is non-trivial. */
export function makeToolSet() {
  return {
    read_file: tool({
      description: "Reads a workspace file and returns its contents",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path"),
        lineStart: z.number().int().optional(),
        lineEnd: z.number().int().optional(),
      }),
    }),
    execute_cell: tool({
      description: "Executes a notebook cell and returns its output and visuals",
      inputSchema: z.object({
        cellId: z.string(),
        code: z.string(),
        timeoutSeconds: z.number().int().optional(),
      }),
    }),
  };
}

/**
 * Builds a plain alternating user/assistant transcript.
 *
 * @param turns - Number of user/assistant pairs.
 * @param charsPerMessage - Text length of each message.
 */
export function makeUiTranscript(turns: number, charsPerMessage = 200): UIMessage[] {
  const messages: UIMessage[] = [];
  for (let index = 0; index < turns; index += 1) {
    messages.push({
      id: `u${index}`,
      role: "user",
      parts: [{ type: "text", text: "u".repeat(charsPerMessage) }],
    } as unknown as UIMessage);
    messages.push({
      id: `a${index}`,
      role: "assistant",
      parts: [{ type: "text", text: "a".repeat(charsPerMessage) }],
    } as unknown as UIMessage);
  }
  return messages;
}

/**
 * Builds the shape a real agent tool loop actually produces: one user message
 * and **one** assistant message whose parts grow by a `step-start` / tool pair
 * per model call.
 *
 * Session 1786825713795 persisted exactly this — 1 user row and 1 assistant row
 * with 102 parts and 37 `step-start` markers — which is why message-level
 * retention silently trimmed nothing there. Any retention change must be tested
 * against this shape, not against `makeUiTranscript`.
 *
 * @param steps - Number of model calls in the loop.
 * @param rasterChars - Base64 length attached to each step's tool result.
 */
export function makeAgentLoopTranscript(steps: number, rasterChars = 4_000): UIMessage[] {
  const parts: Array<Record<string, unknown>> = [];

  for (let step = 0; step < steps; step += 1) {
    parts.push({ type: "step-start" });
    parts.push({
      type: "tool-execute_cell",
      toolCallId: `exec-${step}`,
      state: "output-available",
      input: { cellIndices: [step] },
      output: {
        text: `[Cell ${step}] ran`,
        visuals: [
          {
            visualId: `plot-${step}`,
            mimeType: "image/png",
            data: makeBase64(rasterChars),
            source: "execute_cell",
            cellIndex: step,
            outputIndex: 0,
            byteLength: rasterChars,
          },
        ],
      },
    });
  }

  return [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "pokemon cards from this dataset" }],
    },
    { id: "a1", role: "assistant", parts },
  ] as unknown as UIMessage[];
}

/** Builds a prepared prompt with a system message and alternating turns. */
export function makeModelMessages(options: {
  turns: number;
  systemChars?: number;
  charsPerMessage?: number;
}): ModelMessage[] {
  const messages: ModelMessage[] = [
    { role: "system", content: "s".repeat(options.systemChars ?? 4000) },
  ];
  for (let index = 0; index < options.turns; index += 1) {
    messages.push({ role: "user", content: "u".repeat(options.charsPerMessage ?? 200) });
    messages.push({ role: "assistant", content: "a".repeat(options.charsPerMessage ?? 200) });
  }
  return messages;
}
