import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import { BUSINESS_PROMPT_CATEGORIES } from "@/components/right-sidebar/business-prompt-library";
import { ChatBody } from "@/components/right-sidebar/chat-body";
import { INSERT_CHAT_MESSAGE_EVENT } from "@/lib/chat/chat-composer-events";
import { SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME } from "@/lib/notebook/notebook-execution-events";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 180,
      })),
    getTotalSize: () => count * 180,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

vi.mock("@/hooks/use-orion-settings", () => ({
  useOrionSettings: () => ({
    effectiveSettings: {
      chat: { fontSize: 14 },
    },
  }),
}));

const projectCategory = BUSINESS_PROMPT_CATEGORIES[0]!;
const firstProjectPrompt = projectCategory.prompts[0]!;
const initialClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (initialClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", initialClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

beforeAll(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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

/** Renders a chat body with historical message rows visible in the test virtualizer. */
function renderMessageChatBody(
  messages: UIMessage[],
  props: Partial<React.ComponentProps<typeof ChatBody>> = {},
) {
  return render(
    <ChatBody
      messages={messages}
      error={undefined}
      isLoading={false}
      onUserMessageClick={() => undefined}
      editingState={null}
      {...props}
    />,
  );
}

describe("ChatBody empty prompt library", () => {
  it("renders an actionable goal contract proposal in the main chat", () => {
    const onApproveGoalContract = vi.fn();
    const onRequestGoalContractRevision = vi.fn();
    renderMessageChatBody(
      [
        {
          id: "assistant-goal-contract",
          role: "assistant",
          parts: [
            {
              type: "tool-propose_goal_contract",
              toolCallId: "proposal-1",
              state: "input-available",
              input: {
                objective: "Find a statistically strong sales relationship.",
                deliverables: [
                  { path: "analysis.ipynb", description: "Reproducible analysis" },
                ],
                acceptanceCriteria: [
                  { id: "validated", description: "Reports effect size and uncertainty." },
                ],
                constraints: ["Do not claim causation."],
              },
            } as UIMessage["parts"][number],
          ],
        },
      ],
      {
        groupConsecutiveAssistantActivity: true,
        onApproveGoalContract,
        onRequestGoalContractRevision,
      }
    );

    expect(screen.getByText("Proposed goal contract")).toBeInTheDocument();
    expect(screen.queryByText("analysis.ipynb")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText("analysis.ipynb")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("analysis.ipynb")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No, do it differently" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onRequestGoalContractRevision).toHaveBeenCalledWith("proposal-1");
    expect(onApproveGoalContract).toHaveBeenCalledWith("proposal-1");
  });

  it("shows a compact writing state without validating partial contract input", () => {
    renderMessageChatBody(
      [
        {
          id: "assistant-streaming-goal-contract",
          role: "assistant",
          parts: [
            {
              type: "tool-propose_goal_contract",
              toolCallId: "proposal-streaming",
              state: "input-streaming",
              input: { objective: "Partially streamed" },
            } as UIMessage["parts"][number],
          ],
        },
      ],
      { groupConsecutiveAssistantActivity: true },
    );

    expect(screen.getByText("Writing goal contract…")).toBeInTheDocument();
    expect(screen.queryByText("Invalid goal contract")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("renders the runtime warning when a tool is blocked by a disconnected server", () => {
    renderEmptyChatBody({ showKernelPrompt: true });

    expect(screen.getByText("Runtime not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect runtime" })).toBeInTheDocument();
  });

  it("provides five questionnaire prompts in each business category", () => {
    expect(BUSINESS_PROMPT_CATEGORIES).toHaveLength(4);

    for (const category of BUSINESS_PROMPT_CATEGORIES) {
      expect(category.prompts).toHaveLength(5);
      for (const prompt of category.prompts) {
        expect(prompt.prompt).toContain("Start by asking");
      }
    }
  });

  it("renders the prompt categories for an empty chat", () => {
    renderEmptyChatBody({ emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES });

    expect(screen.getByText("What should Orion work on?")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Toggle prompt category:/ }),
    ).toHaveLength(4);
  });

  it("expands a category in place with compact prompt titles", () => {
    renderEmptyChatBody({ emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES });

    const categoryButton = screen.getByRole("button", {
      name: `Toggle prompt category: ${projectCategory.title}`,
    });
    expect(categoryButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(categoryButton);

    expect(categoryButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getAllByRole("button", { name: /Use prompt suggestion:/ }),
    ).toHaveLength(5);
    expect(screen.getByText(firstProjectPrompt.title)).toBeInTheDocument();
    expect(screen.queryByText(firstProjectPrompt.prompt)).not.toBeInTheDocument();

    fireEvent.click(categoryButton);

    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", {
        name: `Use prompt suggestion: ${firstProjectPrompt.title}`,
      }),
    ).not.toBeInTheDocument();
  });

  it("inserts a selected nested prompt into the chat composer", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderEmptyChatBody({ emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES });

    fireEvent.click(
      screen.getByRole("button", {
        name: `Toggle prompt category: ${projectCategory.title}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Use prompt suggestion: ${firstProjectPrompt.title}`,
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: INSERT_CHAT_MESSAGE_EVENT,
        detail: { message: firstProjectPrompt.prompt },
      }),
    );
  });

  it("resets an open category when the prompt library is reset", () => {
    const { rerender } = renderEmptyChatBody({
      viewKey: "chat-one",
      emptyPromptLibraryKey: "library-one",
      emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: `Toggle prompt category: ${projectCategory.title}`,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: `Use prompt suggestion: ${firstProjectPrompt.title}`,
      }),
    ).toBeInTheDocument();

    rerender(
      <ChatBody
        viewKey="chat-one"
        messages={[]}
        error={undefined}
        isLoading={false}
        onUserMessageClick={() => undefined}
        editingState={null}
        emptyPromptCategories={BUSINESS_PROMPT_CATEGORIES}
        emptyPromptLibraryKey="library-two"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: `Toggle prompt category: ${projectCategory.title}`,
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("does not render the library without the business empty-state prop", () => {
    renderEmptyChatBody();

    expect(screen.queryByText("What should Orion work on?")).not.toBeInTheDocument();
  });

  it("does not render the library while another row is visible", () => {
    renderEmptyChatBody({
      emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES,
      isLoading: true,
    });

    expect(screen.queryByText("What should Orion work on?")).not.toBeInTheDocument();
  });
});

describe("ChatBody assistant message actions", () => {
  it("renders one left-aligned action row after a multi-part assistant response", () => {
    const onForkFromAssistantMessage = vi.fn();
    const message: UIMessage = {
      id: "assistant-multipart",
      role: "assistant",
      parts: [
        { type: "text", text: "First Markdown block." },
        { type: "text", text: "\n\nSecond Markdown block." },
      ],
    };

    renderMessageChatBody([message], { onForkFromAssistantMessage });

    expect(screen.getAllByRole("button", { name: "Fork from here" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy message" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Fork from here" }));
    expect(onForkFromAssistantMessage).toHaveBeenCalledWith(message, 0);
  });

  it("suppresses historical forks while an automatic continuation is active", () => {
    const onForkFromAssistantMessage = vi.fn();
    const messages: UIMessage[] = [
      {
        id: "assistant-historical",
        role: "assistant",
        parts: [{ type: "text", text: "Initial response." }],
      },
      {
        id: "assistant-continuing",
        role: "assistant",
        parts: [{ type: "reasoning", text: "Continuing work." }],
      },
    ];

    renderMessageChatBody(messages, {
      isAgentTurnActive: true,
      onForkFromAssistantMessage,
    });

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
    expect(onForkFromAssistantMessage).not.toHaveBeenCalled();
  });

  it("suppresses historical forks while a stopped stream is still settling", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-historical",
        role: "assistant",
        parts: [{ type: "text", text: "Initial response." }],
      },
      {
        id: "assistant-stopping",
        role: "assistant",
        parts: [{ type: "text", text: "Partial response." }],
      },
    ];

    renderMessageChatBody(messages, {
      isLoading: true,
      isAgentTurnActive: false,
      onForkFromAssistantMessage: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("copies raw assistant Markdown while excluding activity-only parts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const message: UIMessage = {
      id: "assistant-copy",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Hidden reasoning" },
        { type: "text", text: "## Public result\n" },
        {
          type: "tool-read_file",
          toolCallId: "read-copy",
          state: "output-available",
          input: { path: "/workspace/example.md" },
          output: "Read example.",
        } as UIMessage["parts"][number],
        { type: "text", text: "\n**Complete**" },
      ],
    };

    renderMessageChatBody([message]);

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("## Public result\n\n**Complete**");
    });
  });

  it("does not offer fork controls for user messages", () => {
    const message: UIMessage = {
      id: "user-message",
      role: "user",
      parts: [{ type: "text", text: "Please revise this." }],
    };

    renderMessageChatBody([message], { onForkFromAssistantMessage: vi.fn() });

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("scrolls to a notebook cell when its sent-message reference chip is clicked", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const message: UIMessage = {
      id: "user-message-cell-reference",
      role: "user",
      parts: [{ type: "text", text: "Please inspect this cell." }],
      metadata: {
        references: [
          {
            id: "cell:example",
            type: "cell",
            label: "Cell #4",
            locator: {
              type: "cell",
              notebookPath: "analysis.ipynb",
              cellIndices: [3],
            },
            status: "resolved",
            preview: "Cell source",
            resolvedAt: "2026-08-14T00:00:00.000Z",
          },
        ],
      },
    };

    renderMessageChatBody([message]);
    dispatchSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Go to Cell #4" }));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
        detail: { cellIndex: 3 },
      }),
    );
    dispatchSpy.mockRestore();
  });

  it("keeps long unbroken user-message text within the chat panel", () => {
    const url = "https://jobs2.smartsearchonline.com/Stefanini/jobs/process_jobsearch.asp?jobTitle=&cityZip=&country=USA";
    const message: UIMessage = {
      id: "user-message-long-url",
      role: "user",
      parts: [{ type: "text", text: url }],
    };

    renderMessageChatBody([message]);

    const messageText = screen.getByText(url);
    expect(messageText).toHaveClass("[overflow-wrap:anywhere]");
    expect(messageText.parentElement).toHaveClass("max-w-full", "min-w-0");
  });

  it("expands an overflowing user message without entering edit mode", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(128);
    const onUserMessageClick = vi.fn();
    const message: UIMessage = {
      id: "user-message-overflow",
      role: "user",
      parts: [{ type: "text", text: "A long message that needs to be expanded." }],
    };

    renderMessageChatBody([message], { onUserMessageClick });

    const showMoreButton = await screen.findByRole("button", { name: /show more/i });
    expect(showMoreButton).toHaveAttribute("aria-expanded", "false");
    expect(showMoreButton).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
    );
    expect(showMoreButton).not.toHaveClass("bg-primary-foreground/10");

    fireEvent.click(screen.getByText("A long message that needs to be expanded."));

    expect(onUserMessageClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /show less/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /show less/i }));

    expect(screen.getByRole("button", { name: /show more/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("places the edit action beside the checkpoint restore action", () => {
    const message: UIMessage = {
      id: "user-message-checkpoint",
      role: "user",
      parts: [{ type: "text", text: "Restore and edit this." }],
    };
    const onUserMessageClick = vi.fn();

    renderMessageChatBody([message], {
      onUserMessageClick,
      checkpointRequestByMessageId: new Map([[message.id, "checkpoint-1"]]),
      checkpointStatuses: new Map([["checkpoint-1", "completed"]]),
      onRestoreCheckpoint: vi.fn(),
    });

    const editButton = screen.getByRole("button", { name: "Edit message" });
    expect(
      [...(editButton.parentElement?.querySelectorAll("button") ?? [])].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["Undo Changes", "Edit message", "Copy message"]);

    fireEvent.click(editButton);

    expect(onUserMessageClick).toHaveBeenCalledWith(message, 0);
  });

  it("keeps copy available but suppresses forks while editing a user message", () => {
    const message: UIMessage = {
      id: "assistant-after-edit",
      role: "assistant",
      parts: [{ type: "text", text: "Completed response." }],
    };

    renderMessageChatBody([message], {
      editingState: {
        messageId: "user-being-edited",
        messageIndex: 0,
        originalContent: "Draft update",
      },
      onForkFromAssistantMessage: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("hides controls while an assistant response is still active or has no prose", () => {
    const proseMessage: UIMessage = {
      id: "assistant-streaming",
      role: "assistant",
      parts: [{ type: "text", text: "Still responding" }],
    };
    const toolOnlyMessage: UIMessage = {
      id: "assistant-tool-only",
      role: "assistant",
      parts: [
        {
          type: "tool-read_file",
          toolCallId: "read-only",
          state: "output-available",
          input: { path: "/workspace/example.md" },
          output: "Read example.",
        } as UIMessage["parts"][number],
      ],
    };

    const { rerender } = renderMessageChatBody([proseMessage], {
      isLoading: true,
      isAgentTurnActive: true,
      onForkFromAssistantMessage: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy message" })).not.toBeInTheDocument();

    rerender(
      <ChatBody
        messages={[toolOnlyMessage]}
        error={undefined}
        isLoading={false}
        onUserMessageClick={() => undefined}
        editingState={null}
        onForkFromAssistantMessage={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Fork from here" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy message" })).not.toBeInTheDocument();
  });
});

describe("ChatBody compaction divider", () => {
  it("renders a divider after the summarized message boundary", () => {
    renderMessageChatBody(
      [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hi" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "More" }],
        },
      ],
      {
        compactionSummary: {
          text: "User greeted the assistant.",
          coversThrough: "assistant-1",
          createdAt: new Date("2026-01-01T12:00:00.000Z"),
          model: "test-model",
          tokensSaved: 1200,
        },
      }
    );

    expect(
      screen.getByRole("button", { name: "View compaction summary" })
    ).toHaveTextContent("Conversation compacted");
  });

  it("opens the compaction summary in a dialog", async () => {
    renderMessageChatBody(
      [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hi" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "More" }],
        },
      ],
      {
        compactionSummary: {
          text: "User greeted the assistant.",
          coversThrough: "assistant-1",
          createdAt: new Date("2026-01-01T12:00:00.000Z"),
          model: "test-model",
          tokensSaved: 1200,
        },
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "View compaction summary" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText("Compaction summary")).toBeInTheDocument();
    expect(screen.getByText("User greeted the assistant.")).toBeInTheDocument();
  });
});
