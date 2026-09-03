import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { parseChatMessageGoalMessage } from "@/lib/chat/chat-references";

import { createGoalSession } from "./controller";
import { buildGoalSupervisorMessages } from "./supervisor-transcript";

describe("goal supervisor transcript", () => {
  it("shows the contract, review evidence, and next worker instruction", () => {
    const session = createGoalSession({
      id: "goal-1",
      chatId: "chat-1",
      contract: {
        objective: "Create a report",
        deliverables: [{ path: "report.md", description: "Final report" }],
        acceptanceCriteria: [{ id: "complete", description: "Contains findings" }],
        constraints: [],
      },
      evaluatorModel: "openai/gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 10,
      baselineEntries: [],
      workerRequestId: "worker-1",
    });
    session.evaluations.push({
      id: "review-1",
      contractVersion: 1,
      reviewNumber: 1,
      modelRequestId: "review-request-1",
      manifest: {
        entries: [],
        createdPaths: ["report.md"],
        modifiedPaths: [],
        deletedPaths: [],
        deliverablePaths: ["report.md"],
        fingerprint: "v1",
        truncated: false,
        capturedAt: "2026-08-21T12:00:00.000Z",
      },
      workerNotes: [],
      verdict: {
        status: "revise",
        criteria: [{
          criterionId: "complete",
          status: "fail",
          evidence: [{ path: "report.md", observation: "Findings are missing." }],
          explanation: "The report is incomplete.",
        }],
        summary: "The report needs findings.",
        repairInstruction: "Add quantified findings.",
        confidence: 0.9,
      },
      createdAt: "2026-08-21T12:00:00.000Z",
    });

    const messages = buildGoalSupervisorMessages(session);
    const text = messages.flatMap((message) => message.parts)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(text).toContain("Initial instruction sent to worker");
    expect(text).toContain("Findings are missing.");
    expect(text).toContain("Add quantified findings.");
  });

  it("reports the working worker so the panel is never blank before review 1", () => {
    const session = createGoalSession({
      id: "goal-1",
      chatId: "chat-1",
      contract: {
        objective: "Create a report",
        deliverables: [{ path: "report.md", description: "Final report" }],
        acceptanceCriteria: [{ id: "complete", description: "Contains findings" }],
        constraints: [],
      },
      evaluatorModel: "openai/gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 10,
      baselineEntries: [],
      workerRequestId: "worker-1",
    });

    const messages = buildGoalSupervisorMessages(session);
    const text = messages.flatMap((message) => message.parts)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    expect(messages).toHaveLength(2);
    expect(text).toContain("Worker in progress");
    expect(text).toContain("review 1 of 10");
  });

  it("omits the working entry once supervision is no longer active", () => {
    const session = createGoalSession({
      id: "goal-1",
      chatId: "chat-1",
      contract: {
        objective: "Create a report",
        deliverables: [{ path: "report.md", description: "Final report" }],
        acceptanceCriteria: [{ id: "complete", description: "Contains findings" }],
        constraints: [],
      },
      evaluatorModel: "openai/gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 10,
      baselineEntries: [],
      workerRequestId: "worker-1",
    });

    expect(
      buildGoalSupervisorMessages({ ...session, status: "completed", phase: "paused" }),
    ).toHaveLength(1);
  });
});

describe("evaluator transcript in the supervisor view", () => {
  const runningSession = () => {
    const base = createGoalSession({
      id: "goal-1",
      chatId: "chat-1",
      contract: {
        objective: "Create a report",
        deliverables: [{ path: "report.md", description: "Final report" }],
        acceptanceCriteria: [{ id: "complete", description: "Contains findings" }],
        constraints: [],
      },
      evaluatorModel: "openai/gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 10,
      baselineEntries: [],
      workerRequestId: "worker-1",
    });
    base.phase = "evaluating";
    base.evaluations.push({
      id: "review-1",
      contractVersion: 1,
      reviewNumber: 1,
      modelRequestId: "review-request-1",
      manifest: {
        entries: [],
        createdPaths: [],
        modifiedPaths: [],
        deletedPaths: [],
        deliverablePaths: [],
        fingerprint: "v1",
        truncated: false,
        capturedAt: "2026-08-22T12:00:00.000Z",
      },
      workerNotes: [],
      verdict: null,
      createdAt: "2026-08-22T12:00:00.000Z",
    });
    return base;
  };

  const toolCallMessage = {
    id: "assistant-1",
    role: "assistant" as const,
    parts: [{
      type: "tool-read_notebook",
      toolCallId: "call-1",
      state: "output-available",
      input: { path: "report.md" },
      output: "cells",
    }],
  } as unknown as UIMessage;

  it("shows the live reviewer transcript while the evaluation runs", () => {
    const messages = buildGoalSupervisorMessages(runningSession(), [toolCallMessage]);
    const toolParts = messages.flatMap((message) =>
      message.parts.filter((part) => part.type.startsWith("tool-"))
    );

    expect(toolParts).toHaveLength(1);
  });

  it("drops the reviewer's raw verdict JSON, which the review summary repeats", () => {
    const verdictMessage = {
      id: "assistant-2",
      role: "assistant" as const,
      parts: [{ type: "text", text: '{"status":"pass"}' }],
    } as unknown as UIMessage;

    const messages = buildGoalSupervisorMessages(runningSession(), [
      toolCallMessage,
      verdictMessage,
    ]);
    const text = messages.flatMap((message) => message.parts)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    expect(text).not.toContain('{"status":"pass"}');
  });

  it("falls back to the stored transcript once the review has finished", () => {
    const session = runningSession();
    session.phase = "working";
    session.evaluations[0]!.transcript = [toolCallMessage];
    session.evaluations[0]!.verdict = {
      status: "revise",
      criteria: [{
        criterionId: "complete",
        status: "fail",
        evidence: [],
        explanation: "Not yet.",
      }],
      summary: "Needs work.",
      repairInstruction: "Add findings.",
      confidence: 0.8,
    };

    const messages = buildGoalSupervisorMessages(session);
    const toolParts = messages.flatMap((message) =>
      message.parts.filter((part) => part.type.startsWith("tool-"))
    );

    expect(toolParts).toHaveLength(1);
  });

  it("places snapshotted worker notes before the review and labels them unambiguously", () => {
    const session = runningSession();
    session.evaluations[0]!.workerNotes = [{
      id: "note-1",
      toolCallId: "tool-1",
      workerRequestId: "worker-1",
      message: "The exclusions are documented in the appendix.",
      relatedPaths: ["report.md"],
      createdAt: "2026-08-22T11:59:00.000Z",
    }];

    const messages = buildGoalSupervisorMessages(session, [toolCallMessage]);
    const noteIndex = messages.findIndex((message) =>
      parseChatMessageGoalMessage(message.metadata)?.source === "worker"
    );
    const toolIndex = messages.findIndex((message) =>
      message.parts.some((part) => part.type.startsWith("tool-"))
    );

    expect(noteIndex).toBeGreaterThan(0);
    expect(noteIndex).toBeLessThan(toolIndex);
    expect(messages[noteIndex]?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("Worker message") }),
    );
  });
});
