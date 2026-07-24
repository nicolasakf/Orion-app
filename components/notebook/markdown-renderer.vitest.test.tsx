import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarkdownRenderer external links", () => {
  it("opens external markdown links outside Orion", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <MarkdownRenderer source="Read the [Plotly guide](https://plotly.com/python/)." />,
    );

    const link = screen.getByRole("link", { name: "Plotly guide" });
    expect(link).toHaveAttribute("href", "https://plotly.com/python/");
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(link);

    expect(openSpy).toHaveBeenCalledWith(
      "https://plotly.com/python/",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("MarkdownRenderer currency", () => {
  it("renders numeric dollar amounts as prose instead of math", () => {
    const { container } = render(
      <MarkdownRenderer source="Revenue was $119.8B of revenue and $40.8B." />,
    );

    expect(
      screen.getByText("Revenue was $119.8B of revenue and $40.8B."),
    ).toBeVisible();
    expect(container.querySelector(".katex")).not.toBeInTheDocument();
  });
});
