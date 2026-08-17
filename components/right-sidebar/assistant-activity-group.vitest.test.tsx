import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AssistantActivityGroup } from "./assistant-activity-group";

/** Renders an expanded group holding `count` activity items. */
function renderRun(count: number, maxVisibleItems?: number) {
  return render(
    <AssistantActivityGroup
      toolCount={count}
      isWaitingForFinalResponse
      autoCollapse={false}
      forceExpanded
      maxVisibleItems={maxVisibleItems}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} data-testid="activity-item">{`step ${index}`}</div>
      ))}
    </AssistantActivityGroup>
  );
}

describe("AssistantActivityGroup item capping", () => {
  it("mounts every item for a short run", () => {
    renderRun(5);

    expect(screen.getAllByTestId("activity-item")).toHaveLength(5);
    expect(screen.queryByText(/earlier step/)).not.toBeInTheDocument();
  });

  it("caps a long run to the newest items", () => {
    // A 39-step run like session 1786825713795 mounted every card at once.
    renderRun(39);

    expect(screen.getAllByTestId("activity-item")).toHaveLength(20);
    expect(screen.getByText("Show 19 earlier steps")).toBeInTheDocument();
    // The newest step stays visible; the oldest is the one hidden.
    expect(screen.getByText("step 38")).toBeInTheDocument();
    expect(screen.queryByText("step 0")).not.toBeInTheDocument();
  });

  it("reveals the earlier steps on request", () => {
    renderRun(39);

    fireEvent.click(screen.getByText("Show 19 earlier steps"));

    expect(screen.getAllByTestId("activity-item")).toHaveLength(39);
    expect(screen.getByText("step 0")).toBeInTheDocument();
    expect(screen.queryByText(/earlier step/)).not.toBeInTheDocument();
  });

  it("uses the singular label when exactly one step is hidden", () => {
    renderRun(4, 3);

    expect(screen.getByText("Show 1 earlier step")).toBeInTheDocument();
  });
});
