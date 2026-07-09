import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUSINESS_PROMPT_CATEGORIES } from "@/components/right-sidebar/business-prompt-library";
import { ChatBody } from "@/components/right-sidebar/chat-body";
import { INSERT_CHAT_MESSAGE_EVENT } from "@/lib/chat/chat-composer-events";

const projectCategory = BUSINESS_PROMPT_CATEGORIES[0]!;
const firstProjectPrompt = projectCategory.prompts[0]!;

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

    expect(screen.getByText("What would you like to do?")).toBeInTheDocument();
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

    expect(screen.queryByText("What would you like to do?")).not.toBeInTheDocument();
  });

  it("does not render the library while another row is visible", () => {
    renderEmptyChatBody({
      emptyPromptCategories: BUSINESS_PROMPT_CATEGORIES,
      isLoading: true,
    });

    expect(screen.queryByText("What would you like to do?")).not.toBeInTheDocument();
  });
});
