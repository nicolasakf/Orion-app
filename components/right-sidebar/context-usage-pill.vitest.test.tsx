import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextUsageView } from "@/lib/agent/context-usage";

import { ContextUsagePill } from "./context-usage-pill";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Renders the pill and opens its hover card, which mounts the popover content. */
async function renderOpen(element: React.ReactElement) {
  const result = render(element);
  const trigger = screen.queryByRole("button", { name: /Context usage/ });
  if (trigger) {
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
  }
  return result;
}

const WINDOW = {
  providerId: "anthropic",
  modelId: "claude-opus-5",
  contextWindow: 200_000,
  maxOutputTokens: 16_384,
  contextWindowSource: "models_dev",
  contextWindowFetchedAt: null,
  contextWindowIsFallback: false,
};

const BUDGET = {
  outputReserve: 10_000,
  usableInputTokens: 190_000,
  thresholdTokens: 174_800,
  autoCompactThreshold: 0.92,
};

function makeView(overrides?: Partial<ContextUsageView>): ContextUsageView {
  const rows: ContextUsageView["rows"] = [
    { key: "system", tokens: 4_120 },
    { key: "messages", tokens: 9_310 },
    { key: "tools", tokens: 3_045 },
    { key: "calibration", tokens: 1_525 },
  ];
  return {
    totalTokens: rows.reduce((sum, row) => sum + row.tokens, 0),
    rows,
    percentUsed: 18_000 / 190_000,
    status: "ok",
    source: "estimate",
    confidence: "low",
    hasLocalDelta: false,
    isStale: false,
    calibrationSampleCount: 0,
    window: WINDOW,
    budget: BUDGET,
    ...overrides,
  };
}

/** Sums the numeric cells rendered in the breakdown, honouring the minus sign. */
function renderedRowSum(labels: string[]): number {
  return labels.reduce((sum, label) => {
    const row = screen.getByText(label).closest("div");
    const value = row?.querySelector(".font-mono")?.textContent ?? "0";
    const numeric = Number(value.replace(/,/g, "").replace("−", "-"));
    return sum + numeric;
  }, 0);
}

describe("ContextUsagePill", () => {
  /**
   * The defect that prompted the refactor: the popover took its total from the
   * calibrated estimate but its rows from the raw breakdown, and rounded each row
   * independently to thousands — so the itemised numbers never added up.
   */
  it("renders rows that visibly sum to the displayed total", async () => {
    const usage = makeView();
    await renderOpen(<ContextUsagePill usage={usage} phase="measured" hasMessages />);

    const sum = renderedRowSum([
      "System prompt",
      "Messages",
      "Tool definitions",
      "Provider accounting",
    ]);

    expect(sum).toBe(usage.totalTokens);
    expect(screen.getByText("Total").closest("div")?.textContent).toContain("18,000");
  });

  it("presents the reply reserve as part of the window, not as usage", async () => {
    await renderOpen(<ContextUsagePill usage={makeView()} phase="measured" hasMessages />);

    // It is subtracted from the denominator; listing it as a consumer of the
    // prompt was double-counting it.
    expect(screen.queryByText("Reply reserve")).not.toBeInTheDocument();
    expect(screen.getByText(/reserved for the reply/)).toBeInTheDocument();
  });

  it("shows no percentage when the model context window is unknown", async () => {
    await renderOpen(
      <ContextUsagePill
        usage={makeView({
          percentUsed: null,
          window: { ...WINDOW, contextWindowIsFallback: true, contextWindowSource: "fallback" },
        })}
        phase="measured"
        hasMessages
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/context window unknown/)).toBeInTheDocument();
  });

  it("renders a negative provider correction with a minus sign", async () => {
    const rows: ContextUsageView["rows"] = [
      { key: "messages", tokens: 20_000 },
      { key: "calibration", tokens: -3_500 },
    ];
    await renderOpen(
      <ContextUsagePill
        usage={makeView({ rows, totalTokens: 16_500 })}
        phase="measured"
        hasMessages
      />
    );

    expect(screen.getByText("−3,500")).toBeInTheDocument();
    expect(renderedRowSum(["Messages", "Provider accounting"])).toBe(16_500);
  });

  it("labels an exact provider measurement as measured", async () => {
    await renderOpen(
      <ContextUsagePill
        usage={makeView({ source: "provider", confidence: "exact" })}
        phase="measured"
        hasMessages
      />
    );

    expect(screen.getByText(/Measured by the provider/)).toBeInTheDocument();
  });

  it("marks locally priced rows as estimated", async () => {
    const rows: ContextUsageView["rows"] = [
      { key: "messages", tokens: 20_000 },
      { key: "draft", tokens: 120 },
    ];
    await renderOpen(
      <ContextUsagePill
        usage={makeView({ rows, totalTokens: 20_120, hasLocalDelta: true })}
        phase="measured"
        hasMessages
      />
    );

    expect(screen.getByText("Your draft").textContent).toContain("(estimated)");
    expect(screen.getByText(/plus unsent additions/)).toBeInTheDocument();
  });

  it("keeps the last number and says so when a refresh fails", async () => {
    await renderOpen(<ContextUsagePill usage={makeView()} phase="unavailable" hasMessages />);

    expect(screen.getByText(/Last known measurement/)).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("explains itself while the first measurement is still in flight", async () => {
    await renderOpen(<ContextUsagePill usage={null} phase="measuring" hasMessages />);

    expect(screen.getByText(/Measuring the prepared prompt/)).toBeInTheDocument();
  });

  it("offers compaction on a large conversation even without a known window", async () => {
    const onCompact = () => undefined;
    await renderOpen(
      <ContextUsagePill
        usage={makeView({
          percentUsed: null,
          status: "compact",
          window: { ...WINDOW, contextWindowIsFallback: true },
        })}
        phase="measured"
        hasMessages
        onCompact={onCompact}
      />
    );

    // With no percentage there is no threshold to colour on, so the affordance
    // follows the measured status instead of disappearing for local models.
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Click to compact");
  });

  it("hides technical categories in simplified mode", async () => {
    await renderOpen(<ContextUsagePill usage={makeView()} phase="measured" hasMessages simple />);

    expect(screen.getByText(/tokens used/)).toBeInTheDocument();
    expect(screen.queryByText("System prompt")).not.toBeInTheDocument();
  });

  it("renders nothing for a chat with no messages", async () => {
    const { container } = render(
      <ContextUsagePill usage={makeView()} phase="idle" hasMessages={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
