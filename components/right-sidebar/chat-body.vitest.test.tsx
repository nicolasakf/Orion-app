import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import { BUSINESS_PROMPT_CATEGORIES } from "@/components/right-sidebar/business-prompt-library";
import { ChatBody } from "@/components/right-sidebar/chat-body";
import { INSERT_CHAT_MESSAGE_EVENT } from "@/lib/chat/chat-composer-events";

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
