import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookCell, type NotebookCellHandle } from "@/components/notebook/notebook-cell";
import { CellType, type NotebookCellType } from "@/lib/types";

/**
 * Stands in for Monaco, exposing the value it renders and a way to type into it
 * so the cell's own source-ownership rules are what the test exercises.
 */
vi.mock("@/components/monaco-editor", () => ({
  MonacoEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="monaco"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock("@/components/notebook/output-renderer", () => ({
  OutputRenderer: () => null,
}));

vi.mock("@/components/notebook/markdown-renderer", () => ({
  MarkdownRenderer: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Types into the stand-in editor the way React's synthetic onChange expects. */
function typeInto(element: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(element, text);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Builds a code cell carrying the stable Orion id the editor keys renders by. */
function makeCell(source: string): NotebookCellType {
  return {
    cell_type: CellType.CODE,
    source: [source],
    metadata: { orion: { id: "code-cell" } },
    execution_count: null,
    outputs: [],
  } as NotebookCellType;
}

describe("NotebookCell source ownership", () => {
  it("adopts a new source the agent wrote after the user typed in the cell", async () => {
    const cellRefs: NotebookCellHandle[] = [];
    const view = render(
      <NotebookCell
        cell={makeCell("1 + 1")}
        cellIndex={0}
        onRegisterRef={(_index, ref) => {
          if (ref) cellRefs.push(ref);
        }}
      />,
    );

    const monaco = view.getByTestId("monaco") as HTMLTextAreaElement;
    expect(monaco.value).toBe("1 + 1");

    // The user types, which is exactly what used to make the cell stop
    // listening to its parent for the rest of its life.
    await act(async () => {
      typeInto(monaco, "1 + 2");
    });
    expect((view.getByTestId("monaco") as HTMLTextAreaElement).value).toBe("1 + 2");

    // The agent rewrote the cell and the editor committed the disk version.
    await act(async () => {
      view.rerender(
        <NotebookCell
          cell={makeCell("print('agent')")}
          cellIndex={0}
          onRegisterRef={(_index, ref) => {
            if (ref) cellRefs.push(ref);
          }}
        />,
      );
    });

    await waitFor(() => {
      expect(
        (view.getByTestId("monaco") as HTMLTextAreaElement).value,
      ).toBe("print('agent')");
    });
    // The handle the editor reads for dirty checks agrees, so the stale text
    // cannot be promoted back over the agent's edit.
    expect(cellRefs[cellRefs.length - 1]?.getSource()).toBe("print('agent')");
  });

  it("keeps unsaved typing when the parent re-renders without changing the source", async () => {
    const onCellModified = vi.fn();
    const cell = makeCell("1 + 1");
    const view = render(
      <NotebookCell cell={cell} cellIndex={0} onCellModified={onCellModified} />,
    );

    const monaco = view.getByTestId("monaco") as HTMLTextAreaElement;
    await act(async () => {
      typeInto(monaco, "1 + 2");
    });
    expect((view.getByTestId("monaco") as HTMLTextAreaElement).value).toBe("1 + 2");

    // A queued/running status update replaces the cell object but not its source.
    await act(async () => {
      view.rerender(
        <NotebookCell
          cell={{ ...makeCell("1 + 1"), execution_count: 4 }}
          cellIndex={0}
          onCellModified={onCellModified}
        />,
      );
    });

    expect((view.getByTestId("monaco") as HTMLTextAreaElement).value).toBe("1 + 2");
  });
});
