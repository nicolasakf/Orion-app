import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import {
  GoalEvaluatorRecoverableError,
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
function toolCallStreamResponse(
  toolName = "read_file",
  input: Record<string, unknown> = { path: "report.md" },
): Response {
  const chunks = [
    { type: "start" },
    {
      type: "tool-input-available",
      toolCallId: `call-${Math.random().toString(36).slice(2)}`,
      toolName,
      input,
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

/** Streams one assistant turn whose whole content is `text`. */
function textStreamResponse(text: string): Response {
  const chunks = [
    { type: "start" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
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

/** Streams the same error chunk produced by a failed `/api/chat` model stream. */
function errorStreamResponse(message: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ type: "error", errorText: message })}\n\n`,
        ),
      );
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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      toolCallStreamResponse()
    );
    vi.stubGlobal("fetch", fetchMock);
    const transcripts: UIMessage[][] = [];

    await expect(
      runGoalEvaluation({
        contract,
        manifest,
        modelId: "gpt-test",
        providerId: "openai",
        chatId: "chat-1",
        modelRequestId: "request-1",
        maxSteps: 3,
        priorVerdict: {
          status: "revise",
          criteria: contract.acceptanceCriteria.map((criterion) => ({
            criterionId: criterion.id,
            status: "fail" as const,
            evidence: [],
            explanation: "Not yet satisfied.",
          })),
          summary: "More work is needed.",
          repairInstruction: "Fix both checks.",
          confidence: 0.8,
        },
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
    const firstRequestInit = fetchMock.mock.calls[0]?.[1];
    const firstRequest = JSON.parse(firstRequestInit?.body as string) as {
      goalEvaluation: { priorVerdict?: GoalVerdict };
    };
    expect(firstRequest.goalEvaluation.priorVerdict?.repairInstruction).toBe(
      "Fix both checks.",
    );
  });

  it("executes review-only Bash calls advertised to the evaluator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => toolCallStreamResponse("bash", { command: "pytest -q" })),
    );
    const executeToolCall = vi.fn(async () => "tests passed");

    await expect(runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-bash-review",
      modelRequestId: "request-bash-review",
      maxSteps: 3,
      executeToolCall,
    })).rejects.toBeInstanceOf(GoalEvaluatorStepLimitError);

    expect(executeToolCall).toHaveBeenCalledWith(
      "bash",
      { command: "pytest -q" },
      undefined,
    );
  });

  it("blocks artifact-editing tools even when a reviewer requests one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        toolCallStreamResponse("edit_file", {
          path: "report.md",
          oldText: "before",
          newText: "after",
        }),
      ),
    );
    const executeToolCall = vi.fn(async () => "should not run");

    await expect(runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-edit-review",
      modelRequestId: "request-edit-review",
      maxSteps: 3,
      executeToolCall,
    })).rejects.toBeInstanceOf(GoalEvaluatorStepLimitError);

    expect(executeToolCall).not.toHaveBeenCalled();
  });


  it("forces a verdict once the investigation budget is spent", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(init?.body as string);
      const spent = JSON.parse(init?.body as string).goalEvaluation
        .investigationBudgetSpent === true;
      return spent
        ? textStreamResponse(JSON.stringify(passVerdict))
        : toolCallStreamResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const verdict = await runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-budget",
      modelRequestId: "request-budget",
      maxSteps: 3,
      executeToolCall: async () => "file contents",
    });

    expect(verdict.status).toBe("pass");
    const requests = bodies.map((body) => JSON.parse(body).goalEvaluation);
    expect(requests).toHaveLength(4);
    expect(requests.slice(0, 3).every((request) => !request.investigationBudgetSpent)).toBe(true);
    expect(requests.at(-1).investigationBudgetSpent).toBe(true);
    expect(requests.at(-1).investigationBudget).toBe(3);
  });

  it("asks the reviewer to re-emit a verdict that failed to validate", async () => {
    const responses = [
      textStreamResponse("Here is my review, all good."),
      textStreamResponse(JSON.stringify(passVerdict)),
    ];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => responses.shift()!,
    );
    vi.stubGlobal("fetch", fetchMock);

    const verdict = await runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-retry",
      modelRequestId: "request-retry",
      maxSteps: 5,
      executeToolCall: async () => "unused",
    });

    expect(verdict.status).toBe("pass");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryMessages = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ).messages as { role: string; parts: { text?: string }[] }[];
    expect(retryMessages.at(-1)?.role).toBe("user");
    expect(retryMessages.at(-1)?.parts[0]?.text).toContain("not a usable verdict");
  });

  it("gives up on a reviewer that never emits a parseable verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textStreamResponse("Still thinking.")));

    await expect(runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-never",
      modelRequestId: "request-never",
      maxSteps: 5,
      executeToolCall: async () => "unused",
    })).rejects.toBeInstanceOf(GoalEvaluatorRecoverableError);
  });

  it("does not charge the investigation budget for waiting on a command", async () => {
    // Waiting is not investigation: 3 investigation steps must survive a long
    // run of await_command round-trips before the verdict is forced.
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const spent = JSON.parse(init?.body as string).goalEvaluation
        .investigationBudgetSpent === true;
      return spent
        ? textStreamResponse(JSON.stringify(passVerdict))
        : toolCallStreamResponse("await_command", { terminalName: "1" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const verdict = await runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-wait",
      modelRequestId: "request-wait",
      maxSteps: 3,
      executeToolCall: async () => "status: stalled",
    });

    expect(verdict.status).toBe("pass");
    // 15 free waits, then 3 charged steps, then the forced finalize turn.
    expect(fetchMock).toHaveBeenCalledTimes(19);
  });

  it("treats a step-limit overrun as recoverable but not a malformed verdict", () => {
    expect(isRecoverableGoalEvaluationError(new GoalEvaluatorStepLimitError(12))).toBe(true);
    expect(isRecoverableGoalEvaluationError(new Error("Malformed verdict."))).toBe(false);
  });

  it("propagates streamed reviewer errors as recoverable instead of reporting no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorStreamResponse("Reviewer provider connection failed.")),
    );

    const evaluation = runGoalEvaluation({
      contract,
      manifest,
      modelId: "gpt-test",
      providerId: "openai",
      chatId: "chat-1",
      modelRequestId: "request-stream-error",
      executeToolCall: async () => "unused",
    });

    await expect(evaluation).rejects.toMatchObject({
      name: "GoalEvaluatorRecoverableError",
      message: "Goal evaluator request failed: Reviewer provider connection failed.",
    });
    await evaluation.catch((error: unknown) => {
      expect(error).toBeInstanceOf(GoalEvaluatorRecoverableError);
      expect(isRecoverableGoalEvaluationError(error)).toBe(true);
    });
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
    expect(output).toContain("characters omitted from persisted preview");
    expect(output.startsWith("x")).toBe(true);
    expect(output.endsWith("x")).toBe(true);
    expect(JSON.stringify(trimmed).length).toBeLessThan(50_000);
  });
});
