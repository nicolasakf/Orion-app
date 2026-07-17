import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ChatCostSummary } from "@/lib/chat/chat-storage";

import { CostSummaryCard } from "./cost-summary-card";

afterEach(cleanup);

describe("CostSummaryCard", () => {
  it("collapses mixed provenance into one concise pending status", () => {
    const summary: ChatCostSummary = {
      version: 2,
      totalCostUsd: 1.23,
      bestAvailableTotalUsd: 1.23,
      exactTotalUsd: 0.5,
      estimatedTotalUsd: 0.5,
      legacyEstimatedTotalUsd: 0.23,
      requestCount: 4,
      unknownCostRequestCount: 1,
      exactRequestCount: 1,
      estimatedRequestCount: 1,
      pendingRequestCount: 1,
      unavailableRequestCount: 0,
      legacyRequestCount: 1,
      models: [{
        modelId: "openai/gpt-5",
        providerId: "vercel",
        totalCostUsd: 1.23,
        bestAvailableTotalUsd: 1.23,
        exactTotalUsd: 0.5,
        estimatedTotalUsd: 0.5,
        legacyEstimatedTotalUsd: 0.23,
        requestCount: 4,
        unknownCostRequestCount: 1,
        exactRequestCount: 1,
        estimatedRequestCount: 1,
        pendingRequestCount: 1,
        unavailableRequestCount: 0,
        legacyRequestCount: 1,
      }],
    };

    render(<CostSummaryCard summary={summary} modelLabels={{}} />);

    expect(screen.getByText("Vercel AI Gateway")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.queryByText(/exact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();
  });
});
