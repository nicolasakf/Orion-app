import { describe, expect, it } from "vitest";

import {
  addNotebookAppViewReference,
  isNotebookAppViewReferenceInNotebook,
  isNotebookCellInAppView,
  isNotebookOutputInAppView,
  removeNotebookAppViewReference,
} from "@/lib/notebook/app-view";
import { CellType, OutputType, type NotebookType } from "@/lib/types";

function makeNotebook(metadata: NotebookType["metadata"] = {}): NotebookType {
  return {
    cells: [
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Intro"],
        metadata: { orion: { id: "intro" } },
      },
      {
        cell_type: CellType.CODE,
        source: ["print('chart')"],
        metadata: {
          orion: {
            id: "chart",
            app: {
              title: "Chart cell",
              outputs: { "1": { enabled: true, title: "Existing output" } },
            },
          },
        },
        execution_count: 1,
        outputs: [
          {
            output_type: OutputType.DISPLAY_DATA,
            data: { "text/plain": ["first"] },
          },
          {
            output_type: OutputType.DISPLAY_DATA,
            data: { "text/plain": ["second"] },
          },
        ],
      },
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Legacy schema only"],
        metadata: { orion: { id: "legacy" } },
      },
    ],
    metadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

describe("cell-level App View inclusion metadata", () => {
  it("reads selected markdown cells and code outputs", () => {
    const notebook = makeNotebook();

    expect(isNotebookCellInAppView(notebook.cells[0]!)).toBe(false);
    expect(isNotebookOutputInAppView(notebook.cells[1]!, 0)).toBe(false);
    expect(isNotebookOutputInAppView(notebook.cells[1]!, 1)).toBe(true);
  });

  it("ignores notebook-level appView schema metadata for inclusion checks", () => {
    const notebook = makeNotebook({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              children: [
                { type: "MarkdownCell", props: { cellId: "legacy" } },
              ],
            },
          },
        },
      },
    });

    expect(
      isNotebookAppViewReferenceInNotebook(notebook, {
        kind: "markdown",
        cellIndex: 2,
      }),
    ).toBe(false);
  });

  it("adds markdown and output references without touching notebook metadata", () => {
    const withMarkdown = addNotebookAppViewReference(makeNotebook(), {
      kind: "markdown",
      cellIndex: 0,
    });
    const withOutput = addNotebookAppViewReference(withMarkdown, {
      kind: "output",
      cellIndex: 1,
      outputIndex: 0,
    });

    expect(withOutput.metadata).toEqual({});
    expect(withOutput.cells[0]!.metadata?.orion?.app?.enabled).toBe(true);
    expect(
      withOutput.cells[1]!.metadata?.orion?.app?.outputs?.["0"]?.enabled,
    ).toBe(true);
    expect(
      withOutput.cells[1]!.metadata?.orion?.app?.outputs?.["1"]?.enabled,
    ).toBe(true);
  });

  it("is idempotent when adding an existing output reference", () => {
    const reference = {
      kind: "output" as const,
      cellIndex: 1,
      outputIndex: 1,
    };
    const once = addNotebookAppViewReference(makeNotebook(), reference);
    const twice = addNotebookAppViewReference(once, reference);

    expect(twice.cells[1]!.metadata?.orion?.app?.outputs).toEqual({
      "1": { enabled: true, title: "Existing output" },
    });
  });

  it("removes only the selected output inclusion and cleans empty outputs", () => {
    const notebook = addNotebookAppViewReference(makeNotebook(), {
      kind: "output",
      cellIndex: 1,
      outputIndex: 0,
    });
    const withoutFirst = removeNotebookAppViewReference(notebook, {
      kind: "output",
      cellIndex: 1,
      outputIndex: 0,
    });
    const withoutSecond = removeNotebookAppViewReference(withoutFirst, {
      kind: "output",
      cellIndex: 1,
      outputIndex: 1,
    });

    expect(withoutFirst.cells[1]!.metadata?.orion?.app).toEqual({
      title: "Chart cell",
      outputs: { "1": { enabled: true, title: "Existing output" } },
    });
    expect(withoutSecond.cells[1]!.metadata?.orion?.app).toEqual({
      title: "Chart cell",
    });
  });

  it("removes empty app metadata when no sibling fields remain", () => {
    const added = addNotebookAppViewReference(makeNotebook(), {
      kind: "markdown",
      cellIndex: 0,
    });
    const removed = removeNotebookAppViewReference(added, {
      kind: "markdown",
      cellIndex: 0,
    });

    expect(removed.cells[0]!.metadata?.orion?.app).toBeUndefined();
    expect(removed.cells[0]!.metadata?.orion?.id).toBe("intro");
  });
});
