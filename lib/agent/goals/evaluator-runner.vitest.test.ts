import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import {
  GoalEvaluatorStepLimitError,
  isRecoverableGoalEvaluationError,
  parseGoalEvaluatorVerdict,
  runGoalEvaluation,
  trimGoalEvaluatorTranscript,
  validateGoalEvaluatorVerdict,
} from "./evaluator-runner";
import type { GoalArtifactManifest, GoalContract, GoalVerdict } from "./types";

const contract: GoalContract = {
  objective: "Create a report",
  deliverables: [{ path: "report.md", description: "Final report" }],
  acceptanceCriteria: [
    { id: "one", description: "First check" },
    { id: "two", description: "Second check" },
  ],
  constraints: [],
};

const passVerdict: GoalVerdict = {
  status: "pass",
  criteria: contract.acceptanceCriteria.map((criterion) => ({
    criterionId: criterion.id,
    status: "pass" as const,
    evidence: [{ path: "report.md", observation: "Present" }],
    explanation: "Satisfied",
  })),
  summary: "Complete",
  confidence: 0.9,
};

describe("goal evaluator verdict parsing", () => {
  it("accepts a fenced revise verdict", () => {
    const verdict = parseGoalEvaluatorVerdict(`\`\`\`json
{"status":"revise","criteria":[{"criterionId":"one","status":"fail","evidence":[],"explanation":"Missing"}],"summary":"Incomplete","repairInstruction":"Add it.","confidence":0.8}
\`\`\``);
    expect(verdict.status).toBe("revise");
    expect(verdict.repairInstruction).toBe("Add it.");
  });

  it("rejects revise without a repair instruction", () => {
    expect(() => parseGoalEvaluatorVerdict(
      '{"status":"revise","criteria":[{"criterionId":"one","status":"fail","evidence":[],"explanation":"Missing"}],"summary":"Incomplete","confidence":0.8}'
    )).toThrow();
  });

  it("requires exactly one result for every contract criterion", () => {
    expect(validateGoalEvaluatorVerdict(contract, passVerdict)).toBe(passVerdict);
    expect(() => validateGoalEvaluatorVerdict(contract, {
      ...passVerdict,
      criteria: passVerdict.criteria.slice(0, 1),
    })).toThrow(/every criterion/);
  });

  it("rejects pass verdicts with an unmet criterion", () => {
    expect(() => validateGoalEvaluatorVerdict(contract, {
      ...passVerdict,
      criteria: [
        { ...passVerdict.criteria[0]!, status: "fail" },
        passVerdict.criteria[1]!,
      ],
    })).toThrow(/unmet criteria/);
  });
});

const manifest: GoalArtifactManifest = {
  entries: [],
  createdPaths: [],
  modifiedPaths: [],
  deletedPaths: [],
  deliverablePaths: [],
  fingerprint: "v1",
  truncated: false,
  capturedAt: "2026-08-22T12:00:00.000Z",
};

/** Streams one assistant turn that only ever calls a tool, so the loop never ends. */
function toolCallStreamResponse(): Response {
  const chunks = [
    { type: "start" },
    {
      type: "tool-input-available",
      toolCallId: `call-${Math.random().toString(36).slice(2)}`,
      toolName: "read_file",
      input: { path: "report.md" },
    },
    { type: "finish" },
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("goal evaluator run loop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams its transcript and stops with a typed error at the step limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => toolCallStreamResponse()));
    const transcripts: UIMessage[][] = [];

    await expect(
      runGoalEvaluation({
        contract,
        manifest,
        modelId: "gpt-test",
        providerId: "openai",
        chatId: "chat-1",
        modelRequestId: "request-1",
        executeToolCall: async () => "file contents",
        onMessagesChange: (messages) => transcripts.push(messages),
      })
    ).rejects.toBeInstanceOf(GoalEvaluatorStepLimitError);

    expect(transcripts.length).toBeGreaterThan(1);
    const finalTranscript = transcripts.at(-1)!;
    expect(
      finalTranscript.some((message) =>
        message.parts.some((part) => part.type.startsWith("tool-"))
      )
    ).toBe(true);
  });

  it("treats a step-limit overrun as recoverable but not a malformed verdict", () => {
    expect(isRecoverableGoalEvaluationError(new GoalEvaluatorStepLimitError(12))).toBe(true);
    expect(isRecoverableGoalEvaluationError(new Error("Malformed verdict."))).toBe(false);
  });
});

describe("stored evaluator transcripts", () => {
  it("caps oversized tool outputs so one review cannot bloat the session", () => {
    const messages = [{
      id: "assistant-1",
      role: "assistant",
      parts: [{
        type: "tool-read_notebook",
        toolCallId: "call-1",
        state: "output-available",
        input: { path: "big.ipynb" },
        output: "x".repeat(50_000),
      }],
    }] as unknown as UIMessage[];

    const trimmed = trimGoalEvaluatorTranscript(messages);
    const output = (trimmed[0]?.parts[0] as { output?: string }).output ?? "";

    expect(output.length).toBeLessThan(50_000);
    expect(JSON.stringify(trimmed).length).toBeLessThan(50_000);
  });
});
