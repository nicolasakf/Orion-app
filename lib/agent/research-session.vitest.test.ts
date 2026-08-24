import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  RESEARCH_SESSION_BUDGET_WARNING_STEP,
  RESEARCH_SESSION_MAX_STEPS,
  advanceResearchSessionForContinuation,
  createResearchSession,
  getResearchTurnActivity,
  summarizeResearchSessionForPrompt,
} from "./research-session";

describe("research turn activity", () => {
  it("detects successful evidence and inserted markdown documentation", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-execute_code",
          toolCallId: "exec-1",
          state: "output-available",
          input: { code: "df.describe()", timeoutSeconds: 60 },
          output: "summary stats",
        },
        {
          type: "tool-insert_cell",
          toolCallId: "insert-1",
          state: "output-available",
          input: {
            cells: [{ cellType: "markdown", cellSource: "Observation: skewed distribution." }],
            startIndex: -1,
          },
          output: "1 cell inserted successfully",
        },
      ],
    } as unknown as UIMessage;

    expect(getResearchTurnActivity(message)).toEqual({
      completedToolCount: 2,
      successfulSubstantiveToolCount: 2,
      evidenceProduced: true,
      markdownDocumented: true,
      proseOnly: false,
    });
  });

  it("counts a cell mutation that ran its own cells as evidence", () => {
    // insert_cell / overwrite_cell_source return kernel output when execute is
    // true, so an Explore turn that used the single-call path still produced
    // evidence even though execute_cell never appeared.
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-overwrite_cell_source",
          toolCallId: "edit-1",
          state: "output-available",
          input: {
            cells: [{ cellIndex: 3, newSource: "df.describe()", orionMetadataJson: "" }],
            execute: true,
          },
          output: "Cell 3 overwritten successfully!\n\n[Cell 3] summary stats",
        },
      ],
    } as unknown as UIMessage;

    expect(getResearchTurnActivity(message).evidenceProduced).toBe(true);
  });

  it("does not count a cell mutation that only wrote code", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-overwrite_cell_source",
          toolCallId: "edit-1",
          state: "output-available",
          input: {
            cells: [{ cellIndex: 3, newSource: "df.describe()", orionMetadataJson: "" }],
            execute: false,
          },
          output: "Cell 3 overwritten successfully!",
        },
      ],
    } as unknown as UIMessage;

    expect(getResearchTurnActivity(message).evidenceProduced).toBe(false);
  });

  it("treats prose-only assistant messages as prose-only turns", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "I should inspect the chart next." }],
    } as UIMessage;

    expect(getResearchTurnActivity(message).proseOnly).toBe(true);
  });
});

describe("research session continuation", () => {
  it("nudges documentation after evidence without markdown", () => {
    const session = createResearchSession({ objective: "Analyze data" });
    const decision = advanceResearchSessionForContinuation(session, {
      completedToolCount: 1,
      successfulSubstantiveToolCount: 1,
      evidenceProduced: true,
      markdownDocumented: false,
      proseOnly: false,
    });

    expect(decision.continue).toBe(true);
    expect(decision.nudge).toBe("document_evidence");
    expect(decision.session.undocumentedEvidenceSteps).toBe(1);
  });

  it("recovers once from repeated stalled turns before requesting final synthesis", () => {
    const session = createResearchSession({ objective: "Analyze data" });
    const stalled = {
      completedToolCount: 0,
      successfulSubstantiveToolCount: 0,
      evidenceProduced: false,
      markdownDocumented: false,
      proseOnly: false,
    };

    const first = advanceResearchSessionForContinuation(session, stalled);
    const second = advanceResearchSessionForContinuation(first.session, stalled);
    const third = advanceResearchSessionForContinuation(second.session, stalled);

    expect(second.nudge).toBe("recover_progress");
    expect(third.nudge).toBe("final_synthesis");

    const finished = advanceResearchSessionForContinuation(third.session, {
      completedToolCount: 1,
      successfulSubstantiveToolCount: 1,
      evidenceProduced: false,
      markdownDocumented: true,
      proseOnly: false,
    });
    expect(finished.continue).toBe(false);
    expect(finished.session.active).toBe(false);
  });

  it("spends the last step on synthesis instead of stopping cold", () => {
    const productive = {
      completedToolCount: 1,
      successfulSubstantiveToolCount: 1,
      evidenceProduced: false,
      markdownDocumented: true,
      proseOnly: false,
    };
    const session = {
      ...createResearchSession({ objective: "Analyze data" }),
      stepCount: RESEARCH_SESSION_MAX_STEPS - 1,
      synthesisNudgeIssued: true,
    };

    const atBudget = advanceResearchSessionForContinuation(session, productive);

    // A run that ends on the cap has all the evidence and none of the meaning.
    expect(atBudget.continue).toBe(true);
    expect(atBudget.nudge).toBe("final_synthesis");
    expect(atBudget.session.finalSynthesisRequested).toBe(true);

    // The synthesis step itself ends the session — it cannot run on.
    const afterSynthesis = advanceResearchSessionForContinuation(atBudget.session, productive);
    expect(afterSynthesis.continue).toBe(false);
    expect(afterSynthesis.terminal).toBe(true);
    expect(afterSynthesis.session.active).toBe(false);
  });

  it("terminates at the budget when synthesis was already requested", () => {
    const session = {
      ...createResearchSession({ objective: "Analyze data" }),
      stepCount: RESEARCH_SESSION_MAX_STEPS - 1,
      synthesisNudgeIssued: true,
      finalSynthesisRequested: true,
    };

    const decision = advanceResearchSessionForContinuation(session, {
      completedToolCount: 0,
      successfulSubstantiveToolCount: 0,
      evidenceProduced: false,
      markdownDocumented: false,
      proseOnly: false,
    });

    expect(decision.continue).toBe(false);
    expect(decision.reason).toBe("step_budget_exhausted");
  });

  it("nudges synthesis near the step budget", () => {
    const session = {
      ...createResearchSession({ objective: "Analyze data" }),
      stepCount: RESEARCH_SESSION_BUDGET_WARNING_STEP - 1,
    };
    const decision = advanceResearchSessionForContinuation(session, {
      completedToolCount: 1,
      successfulSubstantiveToolCount: 1,
      evidenceProduced: false,
      markdownDocumented: false,
      proseOnly: false,
    });

    expect(decision.nudge).toBe("synthesize_soon");
  });

  it("summarizes active session state for the prompt", () => {
    const session = {
      ...createResearchSession({ objective: "Analyze churn", profile: "eda", intensity: "deep" }),
      stepCount: 3,
      undocumentedEvidenceSteps: 1,
    };

    expect(
      summarizeResearchSessionForPrompt({ session, nudge: "document_evidence" })
    ).toContain("Analyze churn");
    expect(
      summarizeResearchSessionForPrompt({ session, nudge: "document_evidence" })
    ).toContain("markdown");
  });
});
