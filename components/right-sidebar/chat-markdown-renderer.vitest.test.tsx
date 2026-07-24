import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatMarkdownRenderer } from "@/components/right-sidebar/chat-markdown-renderer";

afterEach(() => {
  cleanup();
});

describe("ChatMarkdownRenderer currency", () => {
  it("renders numeric dollar amounts as prose instead of math", () => {
    const { container } = render(
      <ChatMarkdownRenderer
        source="Revenue was $119.8B of revenue and $40.8B."
        fontSize={14}
      />,
    );

    expect(
      screen.getByText("Revenue was $119.8B of revenue and $40.8B."),
    ).toBeVisible();
    expect(container.querySelector(".katex")).not.toBeInTheDocument();
  });
});
