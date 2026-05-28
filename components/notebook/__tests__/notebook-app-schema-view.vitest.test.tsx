import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutputType, CellType, type NotebookType } from "@/lib/types";
import { NotebookAppSchemaView } from "@/components/notebook/notebook-app-schema-view";
import type { NotebookAppViewSchema } from "@/lib/notebook/app-view";

vi.mock("@/components/notebook/markdown-renderer", () => ({
  MarkdownRenderer: ({ source }: { source: string }) => (
    <div data-testid="markdown">{source}</div>
  ),
}));

vi.mock("@/components/notebook/output-renderer", () => ({
  OutputRenderer: ({
    cellIndex,
    outputIndex,
  }: {
    cellIndex: number;
    outputIndex: number;
  }) => (
    <div data-testid="output">
      output {cellIndex}:{outputIndex}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

function makeNotebook(): NotebookType {
  return {
    cells: [
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Intro"],
        metadata: { orion: { id: "intro" } },
      },
      {
        cell_type: CellType.CODE,
        source: ["1 + 1"],
        metadata: { orion: { id: "result" } },
        execution_count: 1,
        outputs: [
          {
            output_type: OutputType.DISPLAY_DATA,
            data: { "text/plain": ["2"] },
            metadata: {},
          },
        ],
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function renderSchema(
  schema: NotebookAppViewSchema,
  notebook: NotebookType = makeNotebook(),
): void {
  render(<NotebookAppSchemaView notebook={notebook} schema={schema} />);
}

describe("NotebookAppSchemaView", () => {
  it("renders built-in display primitives from notebook references", () => {
    renderSchema({
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: {
        type: "Page",
        props: {},
        children: [
          {
            type: "MarkdownCell",
            props: { cellId: "intro" },
            children: [],
          },
          {
            type: "Output",
            props: { cellId: "result", outputIndex: 0 },
            children: [],
          },
        ],
      },
    });

    expect(screen.getByTestId("markdown")).toHaveTextContent("# Intro");
    expect(screen.getByTestId("output")).toHaveTextContent("output 1:0");
  });

  it("renders layout and UI primitives", () => {
    renderSchema({
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: {
        type: "Page",
        props: {},
        children: [
          {
            type: "Card",
            props: { title: "Controls", description: "Local only" },
            children: [
              { type: "Badge", props: { text: "Draft" }, children: [] },
              { type: "Button", props: { label: "Preview" }, children: [] },
            ],
          },
        ],
      },
    });

    expect(screen.getByText("Controls")).toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("renders primitive class hooks without metadata CSS injection", () => {
    renderSchema({
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: {
        type: "Page",
        props: { className: "dashboard-page" },
        children: [
          {
            type: "Card",
            props: { title: "Controls", className: "metric-card" },
            children: [],
          },
        ],
      },
    });

    expect(document.querySelector(".orion-app-view")).toBeInTheDocument();
    expect(document.querySelector(".dashboard-page")).toBeInTheDocument();
    expect(document.querySelector(".metric-card")).toBeInTheDocument();
    expect(document.querySelector("style[data-orion-app-view-css]")).toBeNull();
  });

  it("keeps basic control state local to the renderer", () => {
    renderSchema({
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: {
        type: "Page",
        props: {},
        children: [
          {
            type: "Input",
            props: {
              label: "Region",
              stateKey: "region",
              defaultValue: "west",
            },
            children: [],
          },
          {
            type: "Checkbox",
            props: {
              label: "Include archived",
              stateKey: "archived",
              defaultValue: false,
            },
            children: [],
          },
        ],
      },
    });

    const input = screen.getByLabelText("Region");
    expect(input).toHaveValue("west");
    fireEvent.change(input, { target: { value: "east" } });
    expect(input).toHaveValue("east");

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
