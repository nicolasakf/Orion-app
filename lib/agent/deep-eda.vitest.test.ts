import { describe, expect, it } from "vitest";

import {
  applyDeepEdaStateUpdate,
  createInitialDeepEdaState,
  getDeepEdaPhase,
  prepareExecutionToolResultForModel,
  validateDeepEdaCompletion,
  type ExecutionToolResult,
} from "./deep-eda";

describe("deep EDA controller state", () => {
  it("merges incremental ledger updates without replacing untouched evidence", () => {
    const initial = createInitialDeepEdaState();
    const updated = applyDeepEdaStateUpdate(initial, {
      coverageUpdates: [
        {
          area: "schema_integrity",
          status: "complete",
          evidenceRefs: ["cell:1/output:0"],
          rationale: "Schema inspected.",
        },
      ],
      findingsToAdd: [
        {
          claim: "Identifiers are unique.",
          evidenceRefs: ["cell:1/output:0"],
          confidence: "high",
        },
      ],
      openQuestionsUpsert: [
        {
          id: "missingness",
          question: "Is missingness systematic?",
          priority: "high",
          nextAction: "Plot missingness by segment.",
        },
      ],
      resolvedQuestionIds: [],
    });

    expect(updated.coverage.find((item) => item.area === "schema_integrity")?.status).toBe("complete");
    expect(updated.coverage.find((item) => item.area === "missingness_quality")?.status).toBe("pending");
    expect(updated.findings).toHaveLength(1);
    expect(updated.openQuestions).toHaveLength(1);

    const resolved = applyDeepEdaStateUpdate(updated, {
      coverageUpdates: [],
      findingsToAdd: [],
      openQuestionsUpsert: [],
      resolvedQuestionIds: ["missingness"],
    });
    expect(resolved.openQuestions).toEqual([]);
  });

  it("prioritizes visual gates when deriving the controller phase", () => {
    expect(
      getDeepEdaPhase({
        active: true,
        state: createInitialDeepEdaState(),
        pendingVisualIds: ["plot-1"],
        revisionRequiredIds: ["plot-0"],
      })
    ).toBe("awaiting_visual_inspection");
  });
});

describe("deep EDA completion gate", () => {
  it("rejects incomplete coverage, pending visuals, and absent synthesis", () => {
    const missing = validateDeepEdaCompletion({
      state: createInitialDeepEdaState(),
      pendingVisualIds: ["plot-1"],
      inspectedVisualCount: 0,
      synthesisCellIndices: [],
    });

    expect(missing).toContain("Uninspected raster outputs remain: plot-1.");
    expect(missing).toContain("A durable notebook synthesis cell is required.");
    expect(missing).toContain(
      "At least one agent-generated PNG/JPEG plot must be inspected before deep EDA can complete."
    );
    expect(missing.some((item) => item.includes("schema_integrity"))).toBe(true);
  });

  it("accepts fully evidenced coverage with no high-priority questions", () => {
    const state = createInitialDeepEdaState();
    state.coverage = state.coverage.map((item) => ({
      ...item,
      status: "complete",
      evidenceRefs: [`cell:${item.area}`],
      rationale: "Investigated in the notebook.",
    }));
    state.findings = [
      { claim: "The dataset has a stable central pattern.", evidenceRefs: ["cell:12/output:0"], confidence: "medium" },
    ];
    state.openQuestions = [
      { id: "later", question: "Could external data help?", priority: "low", nextAction: "Optional follow-up" },
    ];

    expect(
      validateDeepEdaCompletion({
        state,
        pendingVisualIds: [],
        inspectedVisualCount: 1,
        synthesisCellIndices: [14],
      })
    ).toEqual([]);
  });
});

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
