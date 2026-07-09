import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartNoAxesCombined, FileText, FolderSearch, Workflow } from "lucide-react";

import {
  ChatBody,
  type ChatPromptSuggestion,
} from "@/components/right-sidebar/chat-body";
import { INSERT_CHAT_MESSAGE_EVENT } from "@/lib/chat/chat-composer-events";

const suggestions: readonly ChatPromptSuggestion[] = [
  {
    title: "Understand this project",
    prompt:
      "Review this project and summarize the available information, where it came from, and how it could be used.",
    icon: FolderSearch,
  },
  {
    title: "Explore the data",
    prompt:
      "Review the data to identify important patterns, changes over time, and findings that merit closer attention.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Create a report",
    prompt:
      "Create a clear report that highlights the most important findings, key changes, and areas that need attention.",
    icon: FileText,
  },
  {
    title: "Automate a routine task",
    prompt:
      "Set up a repeatable task to complete this work automatically whenever it is needed.",
    icon: Workflow,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Renders ChatBody with the minimum props needed for empty-state assertions. */
function renderEmptyChatBody(
  props: Partial<React.ComponentProps<typeof ChatBody>> = {},
) {
  return render(
    <ChatBody
      messages={[]}
      error={undefined}
      isLoading={false}
      onUserMessageClick={() => undefined}
      editingState={null}
      {...props}
    />,
  );
}

describe("ChatBody empty prompt suggestions", () => {
  it("renders empty prompt suggestions when provided for an empty chat", () => {
    renderEmptyChatBody({ emptyPromptSuggestions: suggestions });

    expect(screen.getByText("What should Orion work on?")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Use prompt suggestion:/ }),
    ).toHaveLength(4);
  });

  it("inserts a selected suggestion into the chat composer", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderEmptyChatBody({ emptyPromptSuggestions: suggestions });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Use prompt suggestion: Understand this project",
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: INSERT_CHAT_MESSAGE_EVENT,
        detail: { message: suggestions[0].prompt },
      }),
    );
  });

  it("does not render suggestions without the business empty-state prop", () => {
    renderEmptyChatBody();

    expect(screen.queryByText("What should Orion work on?")).not.toBeInTheDocument();
  });

  it("does not render suggestions while another row is visible", () => {
    renderEmptyChatBody({
      emptyPromptSuggestions: suggestions,
      isLoading: true,
    });

    expect(screen.queryByText("What should Orion work on?")).not.toBeInTheDocument();
  });
});
