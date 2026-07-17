import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KernelService } from "@/lib/kernel/kernel-service";

const workspaceSearchDialogMocks = vi.hoisted(() => ({
  focus: vi.fn(),
}));

vi.mock("@/components/left-sidebar/workspace-search", async () => {
  const ReactModule = await import("react");

  return {
    WorkspaceSearch: ReactModule.forwardRef(function WorkspaceSearchMock(
      props: {
        caseSensitive: boolean;
        inputClassName: string;
        kernelService: KernelService | null;
        keyboardNavigation: boolean;
        inputTrailingAction: React.ReactNode;
        onFileSelect: (file: { name: string; path: string }) => void;
        onNavigateToLine: (
          file: { name: string; path: string },
          line: number,
        ) => void;
        workspaceDirectory: string | null;
      },
      ref: React.ForwardedRef<{ focus: () => void }>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({
        focus: workspaceSearchDialogMocks.focus,
      }));

      return (
        <div
          data-testid="workspace-search"
          data-case-sensitive={String(props.caseSensitive)}
          data-keyboard-navigation={String(props.keyboardNavigation)}
          data-workspace-directory={props.workspaceDirectory ?? "none"}
          data-has-kernel={String(props.kernelService !== null)}
          data-input-class-name={props.inputClassName}
        >
          <input aria-label="Search files and content" />
          {props.inputTrailingAction}
          <button
            type="button"
            onClick={() =>
              props.onFileSelect({
                name: "report.txt",
                path: "project/report.txt",
              })
            }
          >
            Select file
          </button>
          <button
            type="button"
            onClick={() =>
              props.onNavigateToLine(
                { name: "notes.txt", path: "project/notes.txt" },
                7,
              )
            }
          >
            Select content
          </button>
        </div>
      );
    }),
  };
});

import {
  BusinessWorkspaceSearchDialog,
  isWorkspaceSearchShortcut,
} from "./business-workspace-search-dialog";

beforeEach(() => {
  workspaceSearchDialogMocks.focus.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("BusinessWorkspaceSearchDialog", () => {
  it("focuses shared search, enables keyboard navigation, and toggles case sensitivity", () => {
    render(
      <BusinessWorkspaceSearchDialog
        open
        onOpenChange={vi.fn()}
        workspaceDirectory={null}
        kernelService={null}
        onFileSelect={vi.fn()}
        onNavigateToLine={vi.fn()}
      />,
    );

    const search = screen.getByTestId("workspace-search");
    expect(workspaceSearchDialogMocks.focus).toHaveBeenCalled();
    expect(search).toHaveAttribute("data-keyboard-navigation", "true");
    expect(search).toHaveAttribute("data-workspace-directory", "none");
    expect(search).toHaveAttribute("data-has-kernel", "false");
    expect(search).toHaveAttribute("data-case-sensitive", "false");
    expect(search).toHaveAttribute(
      "data-input-class-name",
      "h-11 pl-9 pr-3 text-base",
    );
    expect(
      screen.queryByText("Find files by name, path, or matching content."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle case-sensitive search" }),
    );
    expect(search).toHaveAttribute("data-case-sensitive", "true");
  });

  it("closes before routing file and content selections", () => {
    const onOpenChange = vi.fn();
    const onFileSelect = vi.fn();
    const onNavigateToLine = vi.fn();
    render(
      <BusinessWorkspaceSearchDialog
        open
        onOpenChange={onOpenChange}
        workspaceDirectory="project"
        kernelService={{} as KernelService}
        onFileSelect={onFileSelect}
        onNavigateToLine={onNavigateToLine}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select file" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onFileSelect).toHaveBeenCalledWith({
      name: "report.txt",
      path: "project/report.txt",
    });

    fireEvent.click(screen.getByRole("button", { name: "Select content" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onNavigateToLine).toHaveBeenCalledWith(
      { name: "notes.txt", path: "project/notes.txt" },
      7,
    );

    onOpenChange.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("isWorkspaceSearchShortcut", () => {
  const baseEvent = {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
  };

  it("accepts Command+K and Ctrl+K without extra modifiers", () => {
    expect(isWorkspaceSearchShortcut({ ...baseEvent, metaKey: true })).toBe(
      true,
    );
    expect(
      isWorkspaceSearchShortcut({ ...baseEvent, ctrlKey: true, key: "K" }),
    ).toBe(true);
  });

  it("rejects composition, mixed primary modifiers, and extra modifiers", () => {
    expect(
      isWorkspaceSearchShortcut({
        ...baseEvent,
        isComposing: true,
        metaKey: true,
      }),
    ).toBe(false);
    expect(
      isWorkspaceSearchShortcut({ ...baseEvent, ctrlKey: true, metaKey: true }),
    ).toBe(false);
    expect(
      isWorkspaceSearchShortcut({ ...baseEvent, altKey: true, metaKey: true }),
    ).toBe(false);
  });
});
