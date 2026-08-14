import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenDocumentSnapshotProvider } from "@/lib/agent/open-document-snapshots";

vi.mock(
  "@/components/business-shell/business-workspace-search-dialog",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/business-shell/business-workspace-search-dialog")
      >();

    return {
      ...actual,
      BusinessWorkspaceSearchDialog: ({
        open,
        onOpenChange,
      }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
      }) =>
        open ? (
          <div role="dialog" aria-label="Business workspace search">
            <button type="button" onClick={() => onOpenChange(false)}>
              Close search
            </button>
          </div>
        ) : null,
    };
  },
);

vi.mock("@/components/editor", () => ({ Editor: () => <div /> }));
vi.mock("@/components/left-sidebar/left-sidebar", () => ({
  LeftSidebar: () => <div />,
}));
vi.mock("@/components/recent-files-combobox", () => ({
  RecentFilesCombobox: () => <div />,
}));
vi.mock("@/components/right-sidebar/right-sidebar", () => ({
  RightSidebar: () => <div />,
}));
vi.mock("@/components/settings-menu", () => ({ SettingsMenu: () => <div /> }));
vi.mock("@/components/ui/resizable", () => ({
  ResizableHandle: ({
    onDragging,
  }: {
    onDragging?: (isDragging: boolean) => void;
  }) => (
    <button
      type="button"
      aria-label="Resize business panels"
      onPointerDown={() => onDragging?.(true)}
      onPointerUp={() => onDragging?.(false)}
    />
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/agent", () => ({
  AssistantProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/contexts/notebook-view-mode-context", () => ({
  useNotebookViewMode: () => ({ setNotebookViewMode: vi.fn() }),
}));
vi.mock("@/hooks/use-orion-settings", () => ({
  useOrionSettings: () => ({
    effectiveSettings: {
      workspace: { pinnedDirectoryPaths: [], pinnedFilePaths: [] },
    },
    setUserSettings: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-platform", () => ({
  useIsDesktopApp: () => false,
  usePlatformOs: () => "macos",
}));
vi.mock(
  "@/components/business-shell/use-business-report-refresh-errors",
  () => ({
    useBusinessReportRefreshErrors: () => undefined,
  }),
);

import { BusinessShell } from "./business-shell";

const openDocumentSnapshots: OpenDocumentSnapshotProvider = {
  getTextSnapshot: () => null,
  getNotebookSnapshot: () => null,
  saveOpenDocumentIfDirty: async () => ({ status: "not-open" }),
};

/** Renders the business shell with inert collaborators for toolbar interaction tests. */
function renderBusinessShell(onPanelResizeDragging = vi.fn()) {
  const noop = vi.fn();

  return render(
    <BusinessShell
      currentFile={{ name: "", path: "" }}
      recentFiles={[]}
      recentProjectPaths={[]}
      kernelService={null}
      currentKernel={null}
      kernelStatus="disconnected"
      notebook={null}
      workspaceDirectory={null}
      jupyterRootDirectory={null}
      hasWorkspaceOpen={false}
      hasServerConnection={false}
      canPromptForRuntime={false}
      isFocusMode={false}
      isRunning={false}
      executionCountRef={{ current: 0 }}
      openDocumentSnapshots={openDocumentSnapshots}
      currentFileOutsideWorkspace={false}
      panelSizes={[55, 45]}
      onPanelLayout={noop}
      onPanelResizeDragging={onPanelResizeDragging}
      recentFilesOpen={false}
      onRecentFilesOpenChange={noop}
      onOpenKernelDropdown={noop}
      onStopKernel={noop}
      onToggleFocusMode={noop}
      onOpenFile={noop}
      onNavigateToLine={noop}
      onCloseFile={noop}
      canNavigateBack={false}
      canNavigateForward={false}
      onNavigateBack={noop}
      onNavigateForward={noop}
      shouldFocusEditorAfterSelect={() => false}
      requestEditorFocus={noop}
      onWorkspaceChange={noop}
      onWorkspacePathRenamed={noop}
      onWorkspacePathDeleted={noop}
      onKernelStatusChange={noop}
      onCurrentKernelChange={noop}
      onIsRunningChange={noop}
      onNotebookChange={noop}
      onUnsavedChangesChange={noop}
      onTextSnapshotGetterChange={noop}
      onNotebookSnapshotGetterChange={noop}
      onTextSaveHandlerChange={noop}
      onNotebookSaveHandlerChange={noop}
      onFileLoadError={noop}
      onFileOpenCancel={noop}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("BusinessShell workspace search", () => {
  it("opens the centered search from the toolbar button", () => {
    renderBusinessShell();

    fireEvent.click(
      screen.getByRole("button", { name: "Search workspace files" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Business workspace search" }),
    ).toBeInTheDocument();
  });

  it("opens search with Command+K and Ctrl+K", () => {
    renderBusinessShell();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: "Business workspace search" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      screen.getByRole("dialog", { name: "Business workspace search" }),
    ).toBeInTheDocument();
  });

  it("forwards resize handle drag start and release", () => {
    const onPanelResizeDragging = vi.fn();
    renderBusinessShell(onPanelResizeDragging);

    const resizeHandle = screen.getByRole("button", {
      name: "Resize business panels",
    });
    fireEvent.pointerDown(resizeHandle);
    fireEvent.pointerUp(resizeHandle);

    expect(onPanelResizeDragging.mock.calls).toEqual([[true], [false]]);
  });
});
