import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TokenEstimate } from "@/lib/agent/token-budget";

import { ContextUsagePill } from "./context-usage-pill";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const estimate: TokenEstimate = {
  totalTokens: 10_000,
  cap: 190_000,
  percentUsed: 10_000 / 190_000,
  contextWindow: 200_000,
  outputReserve: 10_000,
  thresholdTokens: 174_800,
  breakdown: { system: 1000, messages: 7000, tools: 1500, images: 0, framing: 500 },
};

describe("ContextUsagePill", () => {
  it("keeps simplified context details concise", async () => {
    vi.useFakeTimers();
    render(
      <ContextUsagePill
        estimate={estimate}
        hasMessages
        simple
      />
    );

    const trigger = screen.getByRole("button", { name: /Context usage/ });
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText("10k / 190k tokens")).toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
    expect(screen.queryByText(/Window:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimate:/)).not.toBeInTheDocument();
  });
});
