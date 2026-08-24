import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  applyGoalContractProposalResult,
  countGoalContractAuthorInvestigationSteps,
  deriveGoalContractDraftState,
  isUndecidedGoalContractProposalPart,
} from "./contract-author";
import { createGoalSession } from "./controller";

const contract = {
  objective: "Find a statistically strong sales-performance relationship.",
  deliverables: [
    { path: "analysis.ipynb", description: "Reproducible analysis" },
  ],
  acceptanceCriteria: [
    {
      id: "validated",
      description: "Reports effect size and held-out uncertainty.",
    },
  ],
  constraints: ["Do not present correlation as causation."],
};

/** Creates the persisted user command that starts one contract-authoring sequence. */
function goalMessage(): UIMessage {
  return {
    id: "goal-user",
    role: "user",
    parts: [{ type: "text", text: contract.objective }],
    metadata: {
      goalContractDraft: true,
      slashCommands: [{ label: "/goal", name: "goal", category: "builtin" }],
    },
  };
}

/** Creates a proposal tool part in a requested UI state. */
function proposalMessage(output?: unknown): UIMessage {
  return {
    id: "proposal-assistant",
    role: "assistant",
    parts: [
      {
        type: "tool-propose_goal_contract",
        toolCallId: "proposal-1",
        state: output === undefined ? "input-available" : "output-available",
        input: contract,
        ...(output === undefined ? {} : { output }),
      } as UIMessage["parts"][number],
    ],
  };
}

describe("goal contract draft state", () => {
  it("recognizes a Goal-selector turn without a slash-command chip", () => {
    const selectorMessage: UIMessage = {
      id: "goal-selector-user",
      role: "user",
      parts: [{ type: "text", text: contract.objective }],
      metadata: { goalContractDraft: true },
    };

    expect(deriveGoalContractDraftState([selectorMessage])).toMatchObject({
      active: true,
      phase: "authoring",
    });
  });

  it("stays active through authoring and user-requested revisions", () => {
    expect(deriveGoalContractDraftState([goalMessage()])).toMatchObject({
      active: true,
      phase: "authoring",
    });
    expect(
      deriveGoalContractDraftState([
        goalMessage(),
        proposalMessage({ status: "revision_requested" }),
      ]),
    ).toMatchObject({
      active: true,
      phase: "awaiting_feedback",
      latestProposalToolCallId: "proposal-1",
    });

    expect(
      deriveGoalContractDraftState([
        goalMessage(),
        proposalMessage({ status: "revision_requested" }),
        {
          id: "feedback",
          role: "user",
          parts: [{ type: "text", text: "Make it stricter." }],
        },
      ]),
    ).toMatchObject({ active: true, phase: "authoring" });
  });

  it("waits for approval on a pending structured proposal", () => {
    expect(
      deriveGoalContractDraftState([goalMessage(), proposalMessage()]),
    ).toMatchObject({
      active: true,
      phase: "awaiting_approval",
      latestContract: contract,
    });
  });

  it("keeps a streaming proposal in authoring until its input is complete", () => {
    const streaming = proposalMessage();
    const part = streaming.parts[0];
    if (part && "state" in part) part.state = "input-streaming";

    expect(deriveGoalContractDraftState([goalMessage(), streaming])).toMatchObject({
      active: true,
      phase: "authoring",
    });
  });

  it("ends authoring after approval or a matching persisted session", () => {
    expect(
      deriveGoalContractDraftState([
        goalMessage(),
        proposalMessage({ status: "approved", goalSessionId: "goal-1" }),
      ]),
    ).toMatchObject({ active: false, phase: "inactive" });

    const session = createGoalSession({
      id: "goal-1",
      chatId: "chat-1",
      contract,
      evaluatorModel: "openai:gpt-test",
      evaluatorProvider: "openai",
      evaluatorModelId: "gpt-test",
      maxReviews: 3,
      baselineEntries: [],
      workerRequestId: "worker-1",
    });
    expect(
      deriveGoalContractDraftState([goalMessage(), proposalMessage()], session),
    ).toMatchObject({ active: false, phase: "inactive" });
  });
});

describe("goal contract proposal decisions", () => {
  it("completes only the selected proposal tool part", () => {
    const messages = [goalMessage(), proposalMessage()];
    const next = applyGoalContractProposalResult(messages, "proposal-1", {
      status: "revision_requested",
    });
    const part = next[1]?.parts[0];

    expect(next).not.toBe(messages);
    expect(part).toMatchObject({
      state: "output-available",
      output: { status: "revision_requested" },
    });
  });
});

describe("goal contract author investigation budget", () => {
  it("counts investigation tool calls without charging for the proposal", () => {
    const messages: UIMessage[] = [
      goalMessage(),
      {
        id: "author-assistant",
        role: "assistant",
        parts: [
          { type: "text", text: "Inspecting the workspace." },
          {
            type: "tool-bash",
            toolCallId: "call-1",
            state: "output-available",
            input: { command: "ls" },
            output: "CRM.xlsx",
          },
          {
            type: "tool-execute_code",
            toolCallId: "call-2",
            state: "output-available",
            input: { code: "df.head()" },
            output: "rows",
          },
        ],
      } as unknown as UIMessage,
    ];

    expect(countGoalContractAuthorInvestigationSteps(messages, 0)).toBe(2);
  });

  it("gives a revision round a fresh budget", () => {
    const messages: UIMessage[] = [
      goalMessage(),
      {
        id: "author-assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-bash",
            toolCallId: "call-1",
            state: "output-available",
            input: { command: "ls" },
            output: "CRM.xlsx",
          },
          proposalMessage({ status: "revision_requested" }).parts[0]!,
          {
            type: "tool-read_file",
            toolCallId: "call-2",
            state: "output-available",
            input: { path: "CRM.xlsx" },
            output: "columns",
          },
        ],
      } as unknown as UIMessage,
    ];

    expect(countGoalContractAuthorInvestigationSteps(messages, 0)).toBe(1);
  });

  it("treats a proposal without a decision as undecided", () => {
    const undecided = proposalMessage().parts[0]!;
    const approved = proposalMessage({
      status: "approved",
      goalSessionId: "goal-1",
    }).parts[0]!;

    expect(isUndecidedGoalContractProposalPart(undecided)).toBe(true);
    expect(isUndecidedGoalContractProposalPart(approved)).toBe(false);
  });
});
