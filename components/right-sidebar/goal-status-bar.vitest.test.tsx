import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createGoalSession } from "@/lib/agent/goals/controller";

import { GoalStatusBar } from "./goal-status-bar";

describe("GoalStatusBar", () => {
  const createSession = () => createGoalSession({
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

  it("opens the supervisor transcript and pauses without ending the goal", () => {
    const session = createSession();
    const onOpen = vi.fn();
    const onPause = vi.fn();
    const onEnd = vi.fn();

    render(
      <GoalStatusBar
        session={session}
        onOpen={onOpen}
        onResume={vi.fn()}
        onPause={onPause}
        onEnd={onEnd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open goal supervisor" }));
    expect(onOpen).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Pause goal supervision" }));
    expect(onPause).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("requires confirmation before permanently ending a goal", () => {
    const onEnd = vi.fn();
    render(
      <GoalStatusBar
        session={createSession()}
        onOpen={vi.fn()}
        onResume={vi.fn()}
        onPause={vi.fn()}
        onEnd={onEnd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "End goal" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("End this goal?")).toBeInTheDocument();
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End goal" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /^End goal/ })
    );
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("offers Resume and End while paused", () => {
    const onResume = vi.fn();
    render(
      <GoalStatusBar
        session={{ ...createSession(), status: "paused", phase: "paused" }}
        onOpen={vi.fn()}
        onResume={onResume}
        onPause={vi.fn()}
        onEnd={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Pause goal supervision" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume goal supervision" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "End goal" })).toBeInTheDocument();
  });

  it("explains semantic stalls separately from unchanged artifacts", () => {
    render(
      <GoalStatusBar
        session={{
          ...createSession(),
          status: "stalled",
          phase: "paused",
          stallReason: "unchanged_criteria",
        }}
        onOpen={vi.fn()}
        onResume={vi.fn()}
        onPause={vi.fn()}
        onEnd={vi.fn()}
      />
    );

    expect(screen.getByText(/no criterion-level progress/i)).toBeInTheDocument();
  });
});
