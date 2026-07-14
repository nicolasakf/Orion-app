import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockCrepeOptions {
  defaultValue: string;
  features: Record<string, boolean>;
  root: HTMLElement;
}

const crepeMocks = vi.hoisted(() => {
  class MockCrepe {
    static Feature = {
      AI: "ai",
      ImageBlock: "image-block",
      TopBar: "top-bar",
    };

    readonly create = vi.fn(async () => {
      if (state.createError) throw state.createError;

      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
      this.options.root.replaceChildren(editable);
    });
    readonly destroy = vi.fn(async () => undefined);
    readonly getMarkdown = vi.fn(() => state.markdown);
    readonly setReadonly = vi.fn();

    constructor(readonly options: MockCrepeOptions) {
      state.instances.push(this);
    }
  }

  const state = {
    createError: null as Error | null,
    instances: [] as MockCrepe[],
    markdown: "# Saved from Crepe",
  };

  return { MockCrepe, state };
});

vi.mock("@milkdown/crepe", () => ({ Crepe: crepeMocks.MockCrepe }));

import {
  BusinessRichMarkdownEditor,
  getBusinessMarkdownCompatibility,
} from "@/components/notebook/business-rich-markdown-editor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  crepeMocks.state.createError = null;
  crepeMocks.state.instances.length = 0;
  crepeMocks.state.markdown = "# Saved from Crepe";
});

describe("getBusinessMarkdownCompatibility", () => {
  it("allows normal GFM and dollar-delimited LaTeX in the rich editor", () => {
    const source = [
      "# Quarterly report",
      "",
      "**Revenue** grew by [12%](https://example.com).",
      "",
      "- [x] Reviewed",
      "  - Follow up with the team",
      "",
      "> The outlook remains positive.",
      "",
      "| Metric | Value |",
      "| --- | ---: |",
      "| Revenue | $1.2M |",
      "",
      "`const status = 'ready';`",
      "",
      "Inline math: $x^2 + y^2$.",
      "",
      "$$",
      "E = mc^2",
      "$$",
    ].join("\n");

    expect(getBusinessMarkdownCompatibility(source)).toEqual({
      mode: "rich",
      reason: null,
    });
  });

  it("allows a leading horizontal rule that is not front matter", () => {
    expect(getBusinessMarkdownCompatibility("---\n\n# Results")).toEqual({
      mode: "rich",
      reason: null,
    });
  });

  it.each([
    {
      name: "raw HTML",
      reason: "This block includes HTML or MDX-style content.",
      source: '<section className="summary">Revenue</section>',
    },
    {
      name: "an MDX-like tag",
      reason: "This block includes HTML or MDX-style content.",
      source: '<RevenueChart period="Q2" />',
    },
    {
      name: "an MDX expression",
      reason: "This block includes HTML or MDX-style content.",
      source: "{reportSummary}",
    },
    {
      name: "front matter",
      reason: "This block includes document front matter.",
      source: "---\ntitle: Quarterly report\n---\n\n# Results",
    },
    {
      name: "a Markdown directive",
      reason: "This block includes a Markdown directive.",
      source: ":::note\nKeep this source intact.\n:::",
    },
    {
      name: "an image",
      reason: "Image editing is not available in Business View yet.",
      source: "![Revenue chart](https://example.com/revenue.png)",
    },
    {
      name: "MathJax slash delimiters",
      reason: "This block uses an advanced MathJax delimiter.",
      source: "Inline \\(x^2\\) and display \\[E = mc^2\\].",
    },
  ])("requires explicit source editing for $name", ({ reason, source }) => {
    expect(getBusinessMarkdownCompatibility(source)).toEqual({
      mode: "source-gate",
      reason,
    });
  });
});

describe("BusinessRichMarkdownEditor", () => {
  it("saves Crepe Markdown only after the user explicitly confirms", async () => {
    const onCancel = vi.fn();
    const onFinishEditing = vi.fn();
    const onSave = vi
      .fn<(nextSource: string) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <BusinessRichMarkdownEditor
        cellIndex={2}
        source="# Draft"
        onCancel={onCancel}
        onFinishEditing={onFinishEditing}
        onSave={onSave}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );

    const [crepe] = crepeMocks.state.instances;
    expect(crepe).toBeDefined();
    expect(crepe?.options).toMatchObject({
      defaultValue: "# Draft",
      features: {
        ai: false,
        "image-block": false,
        "top-bar": true,
      },
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("# Saved from Crepe"),
    );
    expect(crepe?.getMarkdown).toHaveBeenCalledTimes(1);
    expect(onFinishEditing).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels a rich edit without reading or saving its Markdown", async () => {
    const onCancel = vi.fn();
    const onFinishEditing = vi.fn();
    const onSave = vi
      .fn<(nextSource: string) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <BusinessRichMarkdownEditor
        cellIndex={0}
        source="# Draft"
        onCancel={onCancel}
        onFinishEditing={onFinishEditing}
        onSave={onSave}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    const [crepe] = crepeMocks.state.instances;

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onFinishEditing).not.toHaveBeenCalled();
    expect(crepe?.getMarkdown).not.toHaveBeenCalled();
  });

  it("saves a rich edit with Cmd/Ctrl+Enter", async () => {
    const onSave = vi
      .fn<(nextSource: string) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <BusinessRichMarkdownEditor
        cellIndex={0}
        source="# Draft"
        onCancel={vi.fn()}
        onFinishEditing={vi.fn()}
        onSave={onSave}
      />,
    );

    const editor = await screen.findByLabelText("Edit markdown cell 1");
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("# Saved from Crepe"),
    );
  });

  it("retains the rich draft when persistence fails", async () => {
    const onSave = vi
      .fn<(nextSource: string) => Promise<void>>()
      .mockRejectedValue(new Error("Notebook could not be saved."));

    render(
      <BusinessRichMarkdownEditor
        cellIndex={0}
        source="# Draft"
        onCancel={vi.fn()}
        onFinishEditing={vi.fn()}
        onSave={onSave}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notebook could not be saved.",
    );
    expect(screen.getByLabelText("Edit markdown cell 1")).toBeInTheDocument();

    const [crepe] = crepeMocks.state.instances;
    expect(crepe?.setReadonly).toHaveBeenLastCalledWith(false);
  });

  it("keeps unsupported Markdown in the source gate until the user opts in", async () => {
    const onCancel = vi.fn();
    const onFinishEditing = vi.fn();
    const onSave = vi
      .fn<(nextSource: string) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <BusinessRichMarkdownEditor
        cellIndex={4}
        source="![Report chart](https://example.com/chart.png)"
        onCancel={onCancel}
        onFinishEditing={onFinishEditing}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByText(/image editing is not available in business view yet/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /edit markdown cell/i }),
    ).not.toBeInTheDocument();
    expect(crepeMocks.state.instances).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit source" }));
    const textarea = screen.getByRole("textbox", {
      name: "Edit markdown cell 5",
    });
    fireEvent.change(textarea, { target: { value: "# Updated report" } });

    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("# Updated report"),
    );
    expect(onFinishEditing).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("falls back to explicit source editing when Crepe cannot initialize", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    crepeMocks.state.createError = new Error("Crepe failed to load");

    render(
      <BusinessRichMarkdownEditor
        cellIndex={0}
        source="# Draft"
        onCancel={vi.fn()}
        onFinishEditing={vi.fn()}
        onSave={vi
          .fn<(nextSource: string) => Promise<void>>()
          .mockResolvedValue(undefined)}
      />,
    );

    expect(
      await screen.findByText(
        /the visual editor could not start for this content/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit source" })).toBeEnabled();
    expect(consoleError).toHaveBeenCalledWith(
      "Could not start the Business Markdown editor:",
      expect.any(Error),
    );
  });
});
