// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  CONTEXT_USAGE_VERSION,
  ContextMeasurementSchema,
  buildEstimateContextMeasurement,
  buildProviderContextMeasurement,
  classifyContextStatus,
  exceedsContextBudget,
  resolveContextUsage,
  shouldCompactBeforeSend,
  type AppendedTokenEstimate,
  type ContextBudgetInfo,
  type ContextWindowInfo,
  type DraftTokenEstimate,
  type PreparedPromptBuckets,
} from "./context-usage";

const WINDOW: ContextWindowInfo = {
  providerId: "anthropic",
  modelId: "claude-opus-5",
  contextWindow: 200_000,
  maxOutputTokens: 16_384,
  contextWindowSource: "models_dev",
  contextWindowFetchedAt: "2026-08-01T00:00:00.000Z",
  contextWindowIsFallback: false,
};

const BUDGET: ContextBudgetInfo = {
  outputReserve: 10_000,
  usableInputTokens: 190_000,
  thresholdTokens: 174_800,
  autoCompactThreshold: 0.92,
};

/** A prepared-prompt measurement whose buckets sum to `rawInputTokens`. */
function prepared(overrides?: Partial<PreparedPromptBuckets>): PreparedPromptBuckets {
  const breakdown = { system: 4000, messages: 9000, tools: 3000, images: 1500, framing: 500 };
  const rawInputTokens = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    rawInputTokens,
    estimatedInputTokens: Math.ceil(rawInputTokens * 1.15),
    confidence: "low",
    calibrationSampleCount: 0,
    breakdown,
    ...overrides,
  };
}

const DRAFT: DraftTokenEstimate = {
  tokens: 120,
  textTokens: 100,
  referenceTokens: 0,
  attachmentTokens: 20,
};

const APPENDED: AppendedTokenEstimate = {
  tokens: 640,
  textTokens: 400,
  toolTokens: 240,
  imageTokens: 0,
};

describe("resolveContextUsage", () => {
  /**
   * The invariant the old popover violated: it took its total from the calibrated
   * estimate but its rows from the raw breakdown, so the rows could never add up.
   */
  it("always produces rows that sum to the displayed total", () => {
    const anchors = [
      buildEstimateContextMeasurement({
        prepared: prepared(),
        window: WINDOW,
        budget: BUDGET,
        estimatorVersion: 2,
      }),
      // A calibrated ratio below 1 makes calibrationDelta negative.
      buildEstimateContextMeasurement({
        prepared: prepared({
          estimatedInputTokens: 12_000,
          confidence: "calibrated",
          calibrationSampleCount: 9,
        }),
        window: WINDOW,
        budget: BUDGET,
        estimatorVersion: 2,
      }),
      buildProviderContextMeasurement({
        prepared: prepared(),
        actualInputTokens: 21_400,
        window: WINDOW,
        budget: BUDGET,
        estimatorVersion: 2,
      }),
      // A provider count well below the estimate.
      buildProviderContextMeasurement({
        prepared: prepared(),
        actualInputTokens: 9_000,
        window: WINDOW,
        budget: BUDGET,
        estimatorVersion: 2,
      }),
    ];

    for (const anchor of anchors) {
      for (const appended of [undefined, APPENDED]) {
        for (const draft of [undefined, DRAFT]) {
          const view = resolveContextUsage({ anchor, appended, draft });
          const rowSum = view.rows.reduce((sum, row) => sum + row.tokens, 0);

          expect(rowSum).toBe(view.totalTokens);
        }
      }
    }
  });

  it("hides zero rows without subtracting them from the total", () => {
    const anchor = buildEstimateContextMeasurement({
      prepared: prepared({ breakdown: { system: 4000, messages: 9000, tools: 0, images: 0, framing: 500 } }),
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    const view = resolveContextUsage({ anchor });

    expect(view.rows.map((row) => row.key)).not.toContain("tools");
    expect(view.rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(view.totalTokens);
  });

  it("reports no percentage when the context window is a guess", () => {
    const anchor = buildEstimateContextMeasurement({
      prepared: prepared(),
      window: { ...WINDOW, contextWindowIsFallback: true, contextWindowSource: "fallback" },
      budget: BUDGET,
      estimatorVersion: 2,
    });

    const view = resolveContextUsage({ anchor });

    // Inventing a denominator produced the local-model percentages that made the
    // old pill untrustworthy; the honest answer is to show none.
    expect(view.percentUsed).toBeNull();
    expect(view.totalTokens).toBeGreaterThan(0);
  });

  it("computes a percentage against the usable budget when the window is known", () => {
    const anchor = buildEstimateContextMeasurement({
      prepared: prepared(),
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    const view = resolveContextUsage({ anchor });

    expect(view.percentUsed).toBeCloseTo(view.totalTokens / BUDGET.usableInputTokens, 10);
  });

  it("reports the anchor's confidence and flags local estimates separately", () => {
    const anchor = buildProviderContextMeasurement({
      prepared: prepared(),
      actualInputTokens: 21_400,
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    expect(resolveContextUsage({ anchor }).hasLocalDelta).toBe(false);
    // The anchor is still an exact provider count; what sits on top of it is a
    // separate fact, so the two are reported separately rather than conflated.
    expect(resolveContextUsage({ anchor, draft: DRAFT }).confidence).toBe("exact");
    expect(resolveContextUsage({ anchor, draft: DRAFT }).hasLocalDelta).toBe(true);
  });

  it("displays the authoritative total even when a stored delta disagrees", () => {
    const anchor = buildEstimateContextMeasurement({
      prepared: prepared(),
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });
    // A measurement whose fields have drifted apart must still render coherently.
    const inconsistent = { ...anchor, inputTokens: 42_000, calibrationDelta: 7 };

    const view = resolveContextUsage({ anchor: inconsistent });

    expect(view.totalTokens).toBe(42_000);
    expect(view.rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(42_000);
  });

  it("recomputes status from the combined total, not the anchor alone", () => {
    // Just under the compaction threshold on its own.
    const nearThreshold = {
      system: 4000,
      messages: 168_000,
      tools: 2000,
      images: 0,
      framing: 500,
    };
    const rawInputTokens = Object.values(nearThreshold).reduce((sum, value) => sum + value, 0);
    const anchor = buildEstimateContextMeasurement({
      prepared: prepared({
        breakdown: nearThreshold,
        rawInputTokens,
        estimatedInputTokens: rawInputTokens,
      }),
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    expect(anchor.status).toBe("ok");
    expect(resolveContextUsage({ anchor }).status).toBe("ok");

    // The draft is what tips it over the compaction threshold.
    const view = resolveContextUsage({ anchor, draft: { ...DRAFT, tokens: 2000 } });

    expect(view.status).toBe("compact");
  });
});

describe("budget decisions", () => {
  it("compacts early but only reports overflow late", () => {
    expect(shouldCompactBeforeSend({ status: "ok" })).toBe(false);
    expect(shouldCompactBeforeSend({ status: "compact" })).toBe(true);
    expect(shouldCompactBeforeSend({ status: "over" })).toBe(true);

    expect(exceedsContextBudget({ status: "ok" })).toBe(false);
    // The asymmetry is deliberate: compacting is cheap, a false overflow warning
    // is not. A "compact" request still fits.
    expect(exceedsContextBudget({ status: "compact" })).toBe(false);
    expect(exceedsContextBudget({ status: "over" })).toBe(true);
  });

  it("classifies against the threshold and the usable budget", () => {
    expect(classifyContextStatus(1000, BUDGET)).toBe("ok");
    expect(classifyContextStatus(BUDGET.thresholdTokens, BUDGET)).toBe("compact");
    expect(classifyContextStatus(BUDGET.usableInputTokens, BUDGET)).toBe("over");
  });
});

describe("measurement construction", () => {
  it("produces schema-valid measurements", () => {
    const estimate = buildEstimateContextMeasurement({
      prepared: prepared(),
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });
    const provider = buildProviderContextMeasurement({
      prepared: prepared(),
      actualInputTokens: 21_400,
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    expect(() => ContextMeasurementSchema.parse(estimate)).not.toThrow();
    expect(() => ContextMeasurementSchema.parse(provider)).not.toThrow();
    expect(estimate.version).toBe(CONTEXT_USAGE_VERSION);
  });

  it("carries the gap between estimate and reality in the calibration row", () => {
    const measurement = buildProviderContextMeasurement({
      prepared: prepared(),
      actualInputTokens: 9_000,
      window: WINDOW,
      budget: BUDGET,
      estimatorVersion: 2,
    });

    expect(measurement.calibrationDelta).toBe(9_000 - measurement.rawInputTokens);
    expect(measurement.calibrationDelta).toBeLessThan(0);
    expect(resolveContextUsage({ anchor: measurement }).totalTokens).toBe(9_000);
  });
});
