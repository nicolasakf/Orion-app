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

  it("scopes markdown style tags to rendered content only", () => {
    const { container } = render(
      <MarkdownRenderer
        source={`
<style>
  body, .jp-RenderedHTMLCommon, .jp-OutputArea-output,
  .cm-editor, .jp-InputArea-editor {
    font-family: Arial, sans-serif;
  }
</style>

# Styled heading
`}
      />,
    );

    const style = container.querySelector("style");
    expect(style).toHaveAttribute(
      "data-orion-style-scoped",
      "notebook-editor",
    );
    expect(style?.textContent).toContain(
      ".notebook-editor-content-area .jp-RenderedHTMLCommon",
    );
    expect(style?.textContent).toContain(
      ".orion-app-view .jp-OutputArea-output",
    );
    expect(style?.textContent).not.toContain("body,");
    expect(style?.textContent).not.toContain(".cm-editor");
    expect(style?.textContent).not.toContain(".jp-InputArea-editor");
    expect(container.querySelector(".wmde-markdown")).not.toHaveStyle({
      fontFamily: "var(--font-sans), sans-serif",
    });
  });

  it("does not rewrite style examples inside fenced code blocks", () => {
    const { container } = render(
      <MarkdownRenderer
        source={'```html\n<style>body { font-family: serif; }</style>\n```'}
      />,
    );

    expect(container.querySelector("style")).not.toBeInTheDocument();
    expect(container.querySelector("code")).toHaveTextContent(
      "<style>body { font-family: serif; }</style>",
    );
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

  it("scopes HTML output style tags to rendered content only", () => {
    const { container } = render(
      <HtmlOutputRenderer
        output={{
          output_type: OutputType.DISPLAY_DATA,
          data: {
            "text/html": [
              "<style>body, .cm-editor, .jp-InputArea-editor, div { font-family: 'Times New Roman'; }</style><p>Styled</p>",
            ],
          },
          metadata: {},
        }}
        mimeType="text/html"
        value={[
          "<style>body, .cm-editor, .jp-InputArea-editor, div { font-family: 'Times New Roman'; }</style><p>Styled</p>",
        ]}
        theme="light"
        trusted
        ansiConverter={{ toHtml: (value: string) => value } as never}
        sanitize={(html) => html}
        actions={{ cellIndex: 0, outputIndex: 0 }}
      />,
    );

    const style = container.querySelector("style");
    expect(style).toHaveAttribute(
      "data-orion-style-scoped",
      "notebook-editor",
    );
    expect(style?.textContent).toContain(
      ".notebook-editor-content-area .jp-RenderedHTMLCommon,",
    );
    expect(style?.textContent).toContain(
      ".notebook-editor-content-area .jp-RenderedHTMLCommon div",
    );
    expect(style?.textContent).toContain(
      ".notebook-editor-content-area .jp-OutputArea-output div",
    );
    expect(style?.textContent).not.toContain(".cm-editor");
    expect(style?.textContent).not.toContain(".jp-InputArea-editor");
    expect(style?.textContent).not.toContain("body,");
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
