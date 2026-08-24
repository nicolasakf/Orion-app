import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueuedMessagesBar } from "./queued-messages-bar";
import type { QueuedMessage } from "./types";

function createQueuedMessage(
  overrides: Partial<QueuedMessage> = {},
): QueuedMessage {
  return {
    id: "q1",
    text: "Follow up after this run",
    references: [],
    attachments: [],
    ...overrides,
  };
}

describe("QueuedMessagesBar", () => {
  it("renders a compact status row matching the goal bar hierarchy", () => {
    render(<QueuedMessagesBar messages={[createQueuedMessage()]} />);

    expect(screen.getByLabelText("Queued messages")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Follow up after this run")).toBeInTheDocument();
  });

  it("shows attachment meta beside the Queued label", () => {
    render(
      <QueuedMessagesBar
        messages={[
          createQueuedMessage({
            text: "",
            references: [
              {
                id: "file:notes",
                type: "file",
                label: "notes.md",
                locator: { type: "file", path: "notes.md" },
                status: "resolved",
                preview: "notes",
                resolvedAt: "2026-08-22T00:00:00.000Z",
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Attached external file(s).")).toBeInTheDocument();
    expect(screen.getByText("1 attachment")).toBeInTheDocument();
  });

  it("shows a message count and removes individual queued prompts", () => {
    const onRemove = vi.fn();
    render(
      <QueuedMessagesBar
        messages={[
          createQueuedMessage({ id: "q1", text: "First queued prompt" }),
          createQueuedMessage({ id: "q2", text: "Second queued prompt" }),
        ]}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("2 messages")).toBeInTheDocument();
    expect(screen.getByText("First queued prompt")).toBeInTheDocument();
    expect(screen.getByText("Second queued prompt")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove queued message",
    });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[1]!);
    expect(onRemove).toHaveBeenCalledWith("q2");
  });
});
