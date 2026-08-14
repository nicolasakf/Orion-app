import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CellContextMenu } from "@/components/notebook/cell-context-menu";
import { CellType } from "@/lib/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCellContextMenu(
  overrides: Partial<React.ComponentProps<typeof CellContextMenu>> = {},
) {
  const noop = vi.fn();

  return render(
    <CellContextMenu
      cellIndex={0}
      cellType={CellType.MARKDOWN}
      isInputCollapsed={false}
      isOutputCollapsed={false}
      isInputHidden={false}
      isOutputHidden={false}
      isWholeCellHidden={false}
      isInAppView={false}
      onToggleInputCollapse={noop}
      onToggleOutputCollapse={noop}
      onToggleInputHidden={noop}
      onToggleOutputHidden={noop}
      onMuteCell={noop}
      onHideCell={noop}
      onEditMetadata={noop}
      onClearOutputs={noop}
      onToggleAppView={noop}
      {...overrides}
    >
      <div>markdown cell</div>
    </CellContextMenu>,
  );
}

describe("CellContextMenu", () => {
  it("mentions a markdown cell from the context menu", async () => {
    const onMentionCell = vi.fn();

    renderCellContextMenu({ onMentionCell });

    fireEvent.contextMenu(screen.getByText("markdown cell"));
    fireEvent.click(await screen.findByText("Mention cell in chat"));

    expect(onMentionCell).toHaveBeenCalledTimes(1);
  });

  it("keeps focus in the composer after mentioning a markdown cell", async () => {
    const onMentionCell = vi.fn(() => {
      window.setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>("#composer")?.focus();
      }, 0);
    });

    render(
      <>
        <textarea id="composer" aria-label="Chat composer" />
        <CellContextMenu
          cellIndex={0}
          cellType={CellType.MARKDOWN}
          isInputCollapsed={false}
          isOutputCollapsed={false}
          isInputHidden={false}
          isOutputHidden={false}
          isWholeCellHidden={false}
          isInAppView={false}
          onToggleInputCollapse={vi.fn()}
          onToggleOutputCollapse={vi.fn()}
          onToggleInputHidden={vi.fn()}
          onToggleOutputHidden={vi.fn()}
          onMuteCell={vi.fn()}
          onHideCell={vi.fn()}
          onEditMetadata={vi.fn()}
          onClearOutputs={vi.fn()}
          onToggleAppView={vi.fn()}
          onMentionCell={onMentionCell}
        >
          <div>markdown cell</div>
        </CellContextMenu>
      </>,
    );

    const composer = screen.getByRole("textbox", { name: "Chat composer" });
    fireEvent.contextMenu(screen.getByText("markdown cell"));
    fireEvent.click(await screen.findByText("Mention cell in chat"));

    await waitFor(() => expect(composer).toHaveFocus());
    expect(onMentionCell).toHaveBeenCalledTimes(1);
  });

  it("omits mention from code cell context menus", async () => {
    renderCellContextMenu({
      cellType: CellType.CODE,
      onMentionCell: vi.fn(),
    });

    fireEvent.contextMenu(screen.getByText("markdown cell"));

    expect(await screen.findByText("Mute Cell")).toBeInTheDocument();
    expect(screen.queryByText("Mention cell in chat")).not.toBeInTheDocument();
  });

  it("omits mention when no mention handler is provided", async () => {
    renderCellContextMenu();

    fireEvent.contextMenu(screen.getByText("markdown cell"));

    expect(await screen.findByText("Hide Cell")).toBeInTheDocument();
    expect(screen.queryByText("Mention cell in chat")).not.toBeInTheDocument();
  });
});
