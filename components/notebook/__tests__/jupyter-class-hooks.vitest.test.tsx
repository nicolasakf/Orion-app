import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { HtmlOutputRenderer } from "@/components/notebook/renderers/html";
import { PlainTextOutputRenderer } from "@/components/notebook/renderers/plain";
import { OutputType } from "@/lib/types";

afterEach(() => {
  cleanup();
});

describe("Jupyter-compatible notebook class hooks", () => {
  it("marks markdown content with JupyterLab-compatible output classes", () => {
    render(<MarkdownRenderer source="## Heading" />);

    const heading = screen.getByRole("heading", { name: "Heading" });
    expect(heading.closest(".jp-MarkdownOutput")).toBeInTheDocument();
    expect(heading.closest(".jp-RenderedHTMLCommon")).toBeInTheDocument();
  });

  it("marks HTML outputs with the JupyterLab rendered HTML class", () => {
    render(
      <HtmlOutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: { "text/html": ["<p>Rendered HTML</p>"] },
          metadata: {},
        }}
        mimeType="text/html"
        value={["<p>Rendered HTML</p>"]}
        theme="light"
        trusted
        ansiConverter={{ toHtml: (value: string) => value } as never}
        sanitize={(html) => html}
        actions={{ cellIndex: 0, outputIndex: 0 }}
      />,
    );

    expect(screen.getByText("Rendered HTML").closest(".jp-RenderedHTMLCommon"))
      .toBeInTheDocument();
  });

  it("marks plain text outputs with the JupyterLab output area class", () => {
    render(
      <PlainTextOutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: { "text/plain": ["plain output"] },
          metadata: {},
        }}
        mimeType="text/plain"
        value={["plain output"]}
        theme="light"
        trusted
        ansiConverter={{ toHtml: (value: string) => value } as never}
        sanitize={(html) => html}
        actions={{ cellIndex: 0, outputIndex: 0 }}
      />,
    );

    expect(screen.getByText("plain output")).toHaveClass(
      "jp-OutputArea-output",
    );
  });
});
