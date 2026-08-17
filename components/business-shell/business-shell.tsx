"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Copy,
  FileCode,
  FileText,
  Folder,
  FolderSearch,
  MoreHorizontal,
  Pencil,
  Pin,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Editor } from "@/components/editor";
import {
  BusinessWorkspaceSearchDialog,
  isWorkspaceSearchShortcut,
} from "@/components/business-shell/business-workspace-search-dialog";
import { CmdOrCtrl } from "@/components/common/keyboard-icons";
import { LeftSidebar } from "@/components/left-sidebar/left-sidebar";
import { RecentFilesCombobox } from "@/components/recent-files-combobox";
import { RightSidebar } from "@/components/right-sidebar/right-sidebar";
import { SettingsMenu } from "@/components/settings-menu";
import { ToolbarButton } from "@/components/common/toolbar-button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AssistantProvider } from "@/lib/agent";
import { useNotebookViewMode } from "@/contexts/notebook-view-mode-context";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useIsDesktopApp, usePlatformOs } from "@/hooks/use-platform";
import { NOTEBOOK_PUBLISH_EVENT_NAME } from "@/lib/cloud/publishing";
import {
  getWorkspacePathActionAvailability,
  revealWorkspacePath,
} from "@/lib/desktop/workspace-actions.client";
import { togglePinnedFilePath } from "@/lib/settings/pinned-files";
import {
  MAX_PINNED_FILE_PATHS,
  MAX_PINNED_WORKSPACE_DIRECTORY_PATHS,
} from "@/lib/settings/schema";
import {
  RUN_ALL_CELLS_EVENT_NAME,
  type RunAllCellsEventDetail,
} from "@/lib/notebook/notebook-execution-events";
import {
  NOTEBOOK_EXPORT_EVENT_NAME,
  NOTEBOOK_EXPORT_OPTIONS,
  type NotebookExportEventDetail,
  type NotebookExportFormat,
} from "@/lib/notebook/notebook-export";
import { cn } from "@/lib/utils";
import { copyWorkspacePath } from "@/lib/workspace/copy-path.client";
import { dispatchWorkspaceFilesChanged } from "@/lib/workspace/workspace-events";
import type { KernelInfo, KernelStatus, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type {
  OpenDocumentSaveResult,
  OpenDocumentSnapshotProvider,
} from "@/lib/agent/open-document-snapshots";
import { useBusinessReportRefreshErrors } from "@/components/business-shell/use-business-report-refresh-errors";

interface BusinessShellFile {
  name: string;
  path: string;
  openAsText?: boolean;
}

const BUSINESS_EXPORT_FORMATS = new Set<NotebookExportFormat>(["html", "pdf"]);

const EMPTY_NOTEBOOK: NotebookType = {
  cells: [],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
};

/** Dispatches a notebook export request to the mounted notebook editor. */
function dispatchNotebookExport(format: NotebookExportFormat): void {
  window.dispatchEvent(
    new CustomEvent<NotebookExportEventDetail>(NOTEBOOK_EXPORT_EVENT_NAME, {
      detail: { format },
    })
  );
}

/** Dispatches a notebook publish request to the mounted notebook editor. */
function dispatchNotebookPublish(): void {
  window.dispatchEvent(new CustomEvent(NOTEBOOK_PUBLISH_EVENT_NAME));
}

/** Dispatches a business report refresh (run all cells) to the mounted notebook editor. */
function dispatchNotebookRefresh(): void {
  window.dispatchEvent(
    new CustomEvent<RunAllCellsEventDetail>(RUN_ALL_CELLS_EVENT_NAME, {
      detail: { stopOnError: true, triggerSource: "refresh-report" },
    }),
  );
}

/** Builds a child path under the current workspace root. */
function joinWorkspacePath(workspaceDirectory: string, name: string): string {
  return workspaceDirectory ? `${workspaceDirectory}/${name}` : name;
}

/** Returns true when a Jupyter-relative path already exists. */
async function workspacePathExists(
  kernelService: KernelService,
  path: string
): Promise<boolean> {
  try {
    await kernelService.getContentsManager().get(path, { content: false });
    return true;
  } catch {
    return false;
  }
}

/** Returns a default analysis name for a new notebook. */
function defaultAnalysisName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `analysis-${date}`;
}

/** Normalizes a user-provided analysis name to a notebook filename. */
function normalizeAnalysisFileName(rawName: string): string {
  const trimmed = rawName.trim();
  return trimmed.toLowerCase().endsWith(".ipynb") ? trimmed : `${trimmed}.ipynb`;
}

/** Creates a collision-free empty notebook in the current workspace. */
async function createNewAnalysisNotebook(
  kernelService: KernelService,
  workspaceDirectory: string,
  rawName: string
): Promise<BusinessShellFile> {
  const baseName = normalizeAnalysisFileName(rawName);
  const stem = baseName.slice(0, -".ipynb".length);
  let suffix = 0;
  let name = baseName;
  let path = joinWorkspacePath(workspaceDirectory, name);

  while (await workspacePathExists(kernelService, path)) {
    suffix += 1;
    name = `${stem}-${suffix}.ipynb`;
    path = joinWorkspacePath(workspaceDirectory, name);
  }

  await kernelService.getContentsManager().save(path, {
    type: "notebook",
    format: "json",
    content: EMPTY_NOTEBOOK,
  });

  return { name, path };
}

interface BusinessEditorNavigationButtonsProps {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
}

/** Back/forward controls for the business editor's opened-file history. */
function BusinessEditorNavigationButtons({
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: BusinessEditorNavigationButtonsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Go back to previous file"
        className="h-8 w-8 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={!canNavigateBack}
        onClick={onNavigateBack}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Go forward to next file"
        className="h-8 w-8 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={!canNavigateForward}
        onClick={onNavigateForward}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface BusinessShellProps {
  currentFile: BusinessShellFile;
  recentFiles: BusinessShellFile[];
  recentProjectPaths: string[];
  kernelService: KernelService | null;
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  notebook: NotebookType | null;
  workspaceDirectory: string | null;
  jupyterRootDirectory: string | null;
  hasWorkspaceOpen: boolean;
  hasServerConnection: boolean;
  canPromptForRuntime: boolean;
  isFocusMode: boolean;
  isRunning: boolean;
  executionCountRef: React.MutableRefObject<number>;
  openDocumentSnapshots: OpenDocumentSnapshotProvider;
  currentFileOutsideWorkspace: boolean;
  panelSizes: [number, number];
  onPanelLayout: (sizes: number[]) => void;
  onPanelResizeDragging: (isDragging: boolean) => void;
  recentFilesOpen: boolean;
  onRecentFilesOpenChange: (open: boolean) => void;
  onOpenKernelDropdown: () => void;
  onStopKernel: () => void | Promise<void>;
  onToggleFocusMode: () => void;
  onOpenFile: (file: BusinessShellFile) => void;
  onNavigateToLine: (file: BusinessShellFile, line: number) => void;
  onCloseFile: (event: React.MouseEvent) => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  shouldFocusEditorAfterSelect: (file: BusinessShellFile) => boolean;
  requestEditorFocus: () => void;
  onWorkspaceChange: (path: string | null) => void;
  onWorkspacePathRenamed: (payload: {
    oldPath: string;
    newPath: string;
    newName: string;
    itemType: "file" | "folder";
  }) => void;
  onWorkspacePathDeleted: (payload: {
    path: string;
    itemType: "file" | "folder";
  }) => void;
  onKernelStatusChange: React.Dispatch<React.SetStateAction<KernelStatus>>;
  onCurrentKernelChange: React.Dispatch<React.SetStateAction<KernelInfo | null>>;
  onIsRunningChange: React.Dispatch<React.SetStateAction<boolean>>;
  onNotebookChange: React.Dispatch<React.SetStateAction<NotebookType | null>>;
  onUnsavedChangesChange: React.Dispatch<React.SetStateAction<boolean>>;
  /** Reports an unresolved disk/editor divergence so autosave can pause. */
  onDocumentConflictChange: (hasConflict: boolean) => void;
  onTextSnapshotGetterChange: (
    getter: OpenDocumentSnapshotProvider["getTextSnapshot"] | null
  ) => void;
  onNotebookSnapshotGetterChange: (
    getter: OpenDocumentSnapshotProvider["getNotebookSnapshot"] | null
  ) => void;
  onTextSaveHandlerChange: (
    handler: ((path: string) => Promise<OpenDocumentSaveResult>) | null
  ) => void;
  onNotebookSaveHandlerChange: (
    handler: ((path: string) => Promise<OpenDocumentSaveResult>) | null
  ) => void;
  onFileLoadError: (path: string, error?: unknown) => boolean | void;
  onFileOpenCancel: (path: string) => void;
}

/** Chat-first shell for business users, reusing Orion's agent and notebook engine. */
export function BusinessShell({
  currentFile,
  recentFiles,
  recentProjectPaths,
  kernelService,
  currentKernel,
  kernelStatus,
  notebook,
  workspaceDirectory,
  jupyterRootDirectory,
  hasWorkspaceOpen,
  hasServerConnection,
  canPromptForRuntime,
  isFocusMode,
  isRunning,
  executionCountRef,
  openDocumentSnapshots,
  currentFileOutsideWorkspace,
  panelSizes,
  onPanelLayout,
  onPanelResizeDragging,
  recentFilesOpen,
  onRecentFilesOpenChange,
  onOpenKernelDropdown,
  onStopKernel,
  onToggleFocusMode,
  onOpenFile,
  onNavigateToLine,
  onCloseFile,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
  shouldFocusEditorAfterSelect,
  requestEditorFocus,
  onWorkspaceChange,
  onWorkspacePathRenamed,
  onWorkspacePathDeleted,
  onKernelStatusChange,
  onCurrentKernelChange,
  onIsRunningChange,
  onNotebookChange,
  onUnsavedChangesChange,
  onDocumentConflictChange,
  onTextSnapshotGetterChange,
  onNotebookSnapshotGetterChange,
  onTextSaveHandlerChange,
  onNotebookSaveHandlerChange,
  onFileLoadError,
  onFileOpenCancel,
}: BusinessShellProps) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const { setNotebookViewMode } = useNotebookViewMode();
  useBusinessReportRefreshErrors(currentFile.path);
  const [newAnalysisDialogOpen, setNewAnalysisDialogOpen] = React.useState(false);
  const [
    presentationHideAllCellInputs,
    setPresentationHideAllCellInputs,
  ] = React.useState(false);
  const [fileTreePopoverOpen, setFileTreePopoverOpen] = React.useState(false);
  const [workspaceSearchDialogOpen, setWorkspaceSearchDialogOpen] =
    React.useState(false);
  const [fileTreeExpandedFolderPaths, setFileTreeExpandedFolderPaths] =
    React.useState<string[]>([]);
  const [businessEditMode, setBusinessEditMode] = React.useState(false);
  const [analysisName, setAnalysisName] = React.useState(defaultAnalysisName);
  const [isCreatingAnalysis, setIsCreatingAnalysis] = React.useState(false);
  const [canRevealWorkspacePath, setCanRevealWorkspacePath] = React.useState(false);
  const analysisNameInputRef = React.useRef<HTMLInputElement>(null);
  const isDesktopApp = useIsDesktopApp();
  const platformOs = usePlatformOs();
  const shouldClearMacWindowControls = isDesktopApp && platformOs === "macos";
  const revealTargetPath = currentFile.path || workspaceDirectory;
  const revealTargetKind = currentFile.path ? "file" : "project";
  const revealTargetLabel =
    platformOs === "macos"
      ? `Show ${revealTargetKind} in Finder`
      : platformOs === "windows"
        ? `Show ${revealTargetKind} in Explorer`
        : `Show ${revealTargetKind} in file manager`;
  const currentProjectPath =
    !currentFile.path && workspaceDirectory ? workspaceDirectory : null;
  const pinnedProjectPaths = effectiveSettings.workspace.pinnedDirectoryPaths;
  const currentFilePath = currentFile.path || null;
  const pinnedFilePaths = effectiveSettings.workspace.pinnedFilePaths;
  const isCurrentFilePinned =
    currentFilePath !== null && pinnedFilePaths.includes(currentFilePath);
  const pinnedFileLimitReached = pinnedFilePaths.length >= MAX_PINNED_FILE_PATHS;
  const disablePinFile = !isCurrentFilePinned && pinnedFileLimitReached;
  const isCurrentProjectPinned =
    currentProjectPath !== null && pinnedProjectPaths.includes(currentProjectPath);
  const pinnedProjectLimitReached =
    pinnedProjectPaths.filter((path) => path !== "").length >=
    MAX_PINNED_WORKSPACE_DIRECTORY_PATHS;
  const disablePinProject =
    !isCurrentProjectPinned && pinnedProjectLimitReached;

  React.useEffect(() => {
    let cancelled = false;

    if (!kernelService || revealTargetPath === null) {
      setCanRevealWorkspacePath(false);
      return () => {
        cancelled = true;
      };
    }

    void getWorkspacePathActionAvailability({
      path: revealTargetPath,
      kernelService,
    }).then((availability) => {
      if (!cancelled) {
        setCanRevealWorkspacePath(availability.available);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [kernelService, revealTargetPath]);

  React.useEffect(() => {
    if (currentFile.path.toLowerCase().endsWith(".ipynb")) {
      setNotebookViewMode("app");
    }
  }, [currentFile.path, setNotebookViewMode]);

  React.useEffect(() => {
    setBusinessEditMode(false);
  }, [currentFile.path]);

  // Folder paths are relative to a workspace, so do not carry them into a new one.
  React.useEffect(() => {
    setFileTreeExpandedFolderPaths([]);
  }, [workspaceDirectory]);

  /** Opens the centered workspace search and dismisses the transient file tree. */
  const openWorkspaceSearchDialog = React.useCallback(() => {
    setFileTreePopoverOpen(false);
    setWorkspaceSearchDialogOpen(true);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isWorkspaceSearchShortcut(event)) return;

      event.preventDefault();
      openWorkspaceSearchDialog();
    };

    // Capture phase keeps the shortcut available while Monaco or another editor has focus.
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [openWorkspaceSearchDialog]);

  const isNotebookOpen =
    currentFile.openAsText !== true && currentFile.path.toLowerCase().endsWith(".ipynb");
  const canRefreshReport =
    isNotebookOpen &&
    Boolean(currentKernel) &&
    kernelStatus !== "disconnected" &&
    kernelStatus !== "connecting" &&
    !isRunning;
  const canControlKernel =
    Boolean(currentKernel) &&
    kernelStatus !== "disconnected" &&
    kernelStatus !== "connecting";
  const showStopReportRefresh = isNotebookOpen && isRunning;
  const businessExportOptions = React.useMemo(
    () =>
      NOTEBOOK_EXPORT_OPTIONS.filter((option) =>
        BUSINESS_EXPORT_FORMATS.has(option.format)
      ),
    []
  );
  React.useEffect(() => {
    if (!newAnalysisDialogOpen) return;

    const timer = window.setTimeout(() => {
      analysisNameInputRef.current?.focus();
      analysisNameInputRef.current?.select();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [newAnalysisDialogOpen]);

  const openNewAnalysisDialog = React.useCallback(() => {
    if (!kernelService) {
      toast.error("Connect Orion's runtime before creating an analysis.");
      return;
    }

    setAnalysisName(defaultAnalysisName());
    setNewAnalysisDialogOpen(true);
  }, [kernelService]);

  const handleCreateNewAnalysis = React.useCallback(async () => {
    const trimmedName = analysisName.trim();

    if (!trimmedName) return;

    if (trimmedName.includes("/")) {
      toast.error("Analysis name cannot contain '/'.");
      return;
    }

    if (!kernelService) {
      toast.error("Connect Orion's runtime before creating an analysis.");
      return;
    }

    setIsCreatingAnalysis(true);
    try {
      const workspaceRoot = workspaceDirectory ?? "";
      const created = await createNewAnalysisNotebook(
        kernelService,
        workspaceRoot,
        trimmedName
      );
      dispatchWorkspaceFilesChanged(workspaceRoot);
      onOpenFile(created);
      setNewAnalysisDialogOpen(false);
    } catch (error) {
      console.error("Failed to create analysis notebook:", error);
      toast.error("Failed to create a new notebook. See console for details.");
    } finally {
      setIsCreatingAnalysis(false);
    }
  }, [analysisName, kernelService, onOpenFile, workspaceDirectory]);

  /** Opens a file from the popup tree and closes the popup. */
  const handleFileTreeSelect = React.useCallback(
    (file: BusinessShellFile) => {
      setFileTreePopoverOpen(false);
      onOpenFile(file);
    },
    [onOpenFile],
  );

  /** Stores the Browse Files tree expansion state outside the transient popover. */
  const handleFileTreeFolderExpandedChange = React.useCallback(
    (path: string, isExpanded: boolean) => {
      setFileTreeExpandedFolderPaths((currentPaths) => {
        const isAlreadyExpanded = currentPaths.includes(path);
        if (isExpanded === isAlreadyExpanded) return currentPaths;

        return isExpanded
          ? [...currentPaths, path]
          : currentPaths.filter((currentPath) => currentPath !== path);
      });
    },
    []
  );

  /** Copies the active workspace target as an absolute path when the root is known. */
  const handleCopyRevealTarget = React.useCallback(() => {
    if (revealTargetPath === null) return;

    void copyWorkspacePath(revealTargetPath, jupyterRootDirectory)
      .then((copiedPath) =>
        toast.success(
          copiedPath.isAbsolute
            ? "Absolute path copied."
            : "Jupyter-relative path copied (server root unavailable).",
        )
      )
      .catch((error) => {
        console.error("Failed to copy workspace path:", error);
        toast.error("Could not copy the workspace path.");
      });
  }, [jupyterRootDirectory, revealTargetPath]);

  /** Opens the active file, or the current project folder, through the local Electron host. */
  const handleRevealTarget = React.useCallback(() => {
    if (!kernelService || revealTargetPath === null) {
      toast.error("Connect Orion's runtime before revealing a file or project.");
      return;
    }

    void revealWorkspacePath({ path: revealTargetPath, kernelService }).then((result) => {
      if (result.ok) return;
      toast.error(result.message, {
        action: {
          label: "Copy path",
          onClick: handleCopyRevealTarget,
        },
      });
    });
  }, [handleCopyRevealTarget, kernelService, revealTargetPath]);

  /** Toggles the active file in the pinned-file shortcuts. */
  const handleToggleFilePin = React.useCallback(async () => {
    if (currentFilePath === null) return;

    await setUserSettings((current) => ({
      ...current,
      workspace: {
        ...current.workspace,
        pinnedFilePaths: togglePinnedFilePath(
          current.workspace.pinnedFilePaths,
          currentFilePath
        ),
      },
    }));
  }, [currentFilePath, setUserSettings]);

  /** Toggles the current workspace folder in the pinned-project shortcuts. */
  const handleToggleProjectPin = React.useCallback(async () => {
    if (currentProjectPath === null) return;

    await setUserSettings((current) => {
      const pinnedDirectoryPaths = current.workspace.pinnedDirectoryPaths;
      const isPinned = pinnedDirectoryPaths.includes(currentProjectPath);
      const visiblePinCount = pinnedDirectoryPaths.filter((path) => path !== "").length;

      if (!isPinned && visiblePinCount >= MAX_PINNED_WORKSPACE_DIRECTORY_PATHS) {
        return current;
      }

      return {
        ...current,
        workspace: {
          ...current.workspace,
          pinnedDirectoryPaths: isPinned
            ? pinnedDirectoryPaths.filter((path) => path !== currentProjectPath)
            : [...pinnedDirectoryPaths, currentProjectPath],
        },
      };
    });
  }, [currentProjectPath, setUserSettings]);

  return (
    <>
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full"
        onLayout={onPanelLayout}
      >
        <ResizablePanel defaultSize={panelSizes[0]} minSize={45}>
          <div className="flex h-full min-w-0 flex-col bg-sidebar">
            <div
              className={cn(
                "relative bg-sidebar pt-2",
                shouldClearMacWindowControls ? "pb-3 pl-20 pr-3" : "px-1 pb-3 pr-3"
              )}
            >
              {shouldClearMacWindowControls ? (
                <div className="absolute left-2 top-8">
                  <BusinessEditorNavigationButtons
                    canNavigateBack={canNavigateBack}
                    canNavigateForward={canNavigateForward}
                    onNavigateBack={onNavigateBack}
                    onNavigateForward={onNavigateForward}
                  />
                </div>
              ) : null}

              <div className="flex min-w-0 items-center gap-1">
                {!shouldClearMacWindowControls ? (
                  <BusinessEditorNavigationButtons
                    canNavigateBack={canNavigateBack}
                    canNavigateForward={canNavigateForward}
                    onNavigateBack={onNavigateBack}
                    onNavigateForward={onNavigateForward}
                  />
                ) : null}

                <div className="corner-squircle ml-1 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2 shadow-md">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <RecentFilesCombobox
                      currentFile={currentFile}
                      recentFiles={recentFiles}
                      currentFileOutsideWorkspace={currentFileOutsideWorkspace}
                      open={recentFilesOpen}
                      onOpenChange={onRecentFilesOpenChange}
                      onFileSelect={onOpenFile}
                      onCloseFile={onCloseFile}
                      shouldFocusEditorAfterSelect={shouldFocusEditorAfterSelect}
                      requestEditorFocus={requestEditorFocus}
                    />
                    <Popover
                      open={fileTreePopoverOpen}
                      onOpenChange={setFileTreePopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <ToolbarButton
                          type="button"
                          toolTipLabel="Browse files"
                          aria-label="Browse workspace files"
                          className="shrink-0"
                        >
                          <Folder className="h-4 w-4" />
                        </ToolbarButton>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        sideOffset={8}
                        className="h-[min(72vh,640px)] w-fit max-w-[min(92vw,520px)] max-h-[calc(100vh-6rem)] overflow-hidden p-0"
                      >
                        <LeftSidebar
                          currentFile={currentFile}
                          onFileSelect={handleFileTreeSelect}
                          kernelService={kernelService}
                          workspaceDirectory={workspaceDirectory}
                          jupyterRootDirectory={jupyterRootDirectory}
                          onWorkspaceChange={onWorkspaceChange}
                          onWorkspacePathRenamed={onWorkspacePathRenamed}
                          onWorkspacePathDeleted={onWorkspacePathDeleted}
                          onOpenKernelDropdown={onOpenKernelDropdown}
                          bareFilesOnly
                          expandedFolderPaths={fileTreeExpandedFolderPaths}
                          onFolderExpandedChange={handleFileTreeFolderExpandedChange}
                          className="h-full bg-popover"
                        />
                      </PopoverContent>
                    </Popover>
                    <ToolbarButton
                      type="button"
                      toolTipLabel="Search workspace"
                      toolTipShortcut={[[CmdOrCtrl, "K"]]}
                      aria-label="Search workspace files"
                      className="shrink-0"
                      onClick={openWorkspaceSearchDialog}
                    >
                      <Search className="h-4 w-4" />
                    </ToolbarButton>
                    <div
                      aria-hidden="true"
                      className="electron-window-drag h-10 min-w-8 flex-1"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isNotebookOpen ? (
                      <>
                        {showStopReportRefresh ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 w-[88px] gap-1.5"
                            onClick={() => void onStopKernel()}
                            disabled={!canControlKernel}
                            aria-label="Stop refresh"
                            title="Interrupt kernel"
                          >
                            <Square className="h-4 w-4" />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-[88px] gap-1.5"
                            onClick={dispatchNotebookRefresh}
                            disabled={!canRefreshReport}
                            aria-label="Refresh report"
                            title="Update report with latest data and settings"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant={businessEditMode ? "secondary" : "ghost"}
                          size="sm"
                          className={cn(
                            "h-8 gap-1.5",
                            businessEditMode &&
                              "bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-300",
                          )}
                          onClick={() =>
                            setBusinessEditMode((current) => !current)
                          }
                          aria-pressed={businessEditMode}
                          aria-label={
                            businessEditMode
                              ? "Finish editing report"
                              : "Edit report"
                          }
                          title={
                            businessEditMode
                              ? "Finish editing report"
                              : "Edit report content"
                          }
                        >
                          <Pencil className="h-4 w-4" />
                          {businessEditMode ? "Done" : "Edit"}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={dispatchNotebookPublish}
                        >
                          <Share2 className="h-4 w-4" />
                          Share
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5"
                            >
                              <Download className="h-4 w-4" />
                              Export
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="grid w-[28rem] grid-cols-2 gap-2 p-2"
                          >
                            {businessExportOptions.map((option) => (
                              <DropdownMenuItem
                                key={option.format}
                                className="min-h-36 flex-col items-start gap-3 border p-3 focus:bg-accent"
                                onSelect={() => dispatchNotebookExport(option.format)}
                              >
                                <div className="flex items-center gap-2">
                                  {option.format === "html" ? (
                                    <FileCode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                  ) : (
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  )}
                                  <div>
                                    <p className="font-medium">{option.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {option.format === "html"
                                        ? "Interactive web page"
                                        : "Fixed-layout document"}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-sm leading-snug text-muted-foreground">
                                  {option.format === "html"
                                    ? "Open in a browser to explore live charts and controls. Best for interactive sharing."
                                    : "A static snapshot that is best for printing, emailing, and preserving the layout."}
                                </p>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : null}

                    {hasWorkspaceOpen ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="More business actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={openNewAnalysisDialog}
                            disabled={isCreatingAnalysis || !kernelService}
                          >
                            <Plus className="h-4 w-4" />
                            {isCreatingAnalysis ? "Creating..." : "New notebook"}
                          </DropdownMenuItem>
                          {canRevealWorkspacePath ? (
                            <DropdownMenuItem
                              onClick={handleRevealTarget}
                              disabled={!kernelService || revealTargetPath === null}
                            >
                              <FolderSearch className="h-4 w-4" />
                              {revealTargetLabel}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onClick={handleCopyRevealTarget}
                            disabled={revealTargetPath === null}
                          >
                            <Copy className="h-4 w-4" />
                            Copy path
                          </DropdownMenuItem>
                          {currentFilePath !== null ? (
                            <DropdownMenuItem
                              onClick={() => void handleToggleFilePin()}
                              disabled={disablePinFile}
                            >
                              <Pin
                                className={cn(
                                  "h-4 w-4",
                                  isCurrentFilePinned && "fill-current"
                                )}
                              />
                              {isCurrentFilePinned
                                ? "Unpin file"
                                : disablePinFile
                                  ? "File pin limit reached"
                                  : "Pin file"}
                            </DropdownMenuItem>
                          ) : currentProjectPath !== null ? (
                            <DropdownMenuItem
                              onClick={() => void handleToggleProjectPin()}
                              disabled={disablePinProject}
                            >
                              <Pin
                                className={cn(
                                  "h-4 w-4",
                                  isCurrentProjectPinned && "fill-current"
                                )}
                              />
                              {isCurrentProjectPinned
                                ? "Unpin project"
                                : disablePinProject
                                  ? "Project pin limit reached"
                                  : "Pin project"}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => onWorkspaceChange(null)}>
                            <X className="h-4 w-4" />
                            Close project
                          </DropdownMenuItem>
                          {!currentKernel ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={onOpenKernelDropdown}>
                                <PlugZap className="h-4 w-4" />
                                Connect runtime
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}

                    <SettingsMenu
                      isFocusMode={isFocusMode}
                      onToggleFocusMode={onToggleFocusMode}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden no-overscroll-x no-overscroll-y">
              <Editor
                filepath={currentFile.path}
                openNotebookAsText={currentFile.openAsText === true}
                businessMode
                businessEditMode={businessEditMode}
                onNewAnalysis={openNewAnalysisDialog}
                hasWorkspace={hasWorkspaceOpen}
                hasServerConnection={hasServerConnection}
                canPromptForRuntime={canPromptForRuntime}
                onConnectServer={onOpenKernelDropdown}
                workspaceDirectory={workspaceDirectory}
                recentFiles={recentFiles}
                recentProjectPaths={recentProjectPaths}
                onOpenFile={onOpenFile}
                onWorkspaceChange={onWorkspaceChange}
                kernelService={kernelService}
                currentKernel={currentKernel}
                kernelStatus={kernelStatus}
                isRunning={isRunning}
                executionCountRef={executionCountRef}
                onKernelStatusChange={onKernelStatusChange}
                onCurrentKernelChange={onCurrentKernelChange}
                onIsRunningChange={onIsRunningChange}
                onNotebookChange={onNotebookChange}
                onUnsavedChangesChange={onUnsavedChangesChange}
                onDocumentConflictChange={onDocumentConflictChange}
                onTextSnapshotGetterChange={onTextSnapshotGetterChange}
                onNotebookSnapshotGetterChange={onNotebookSnapshotGetterChange}
                onTextSaveHandlerChange={onTextSaveHandlerChange}
                onNotebookSaveHandlerChange={onNotebookSaveHandlerChange}
                presentationHideAllCellInputs={presentationHideAllCellInputs}
                onSetPresentationHideAllCellInputs={setPresentationHideAllCellInputs}
                onFileLoadError={onFileLoadError}
                onFileOpenCancel={onFileOpenCancel}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle
          variant="sidebar"
          onDragging={onPanelResizeDragging}
        />

        <ResizablePanel defaultSize={panelSizes[1]} minSize={20}>
          <AssistantProvider
            kernelService={kernelService}
            notebook={notebook}
            workspaceDirectory={workspaceDirectory ?? undefined}
            rootDirectory={jupyterRootDirectory}
            openDocumentSnapshots={openDocumentSnapshots}
          >
            <RightSidebar
              activeNotebookPath={currentFile.path}
              activeNotebook={notebook}
              kernelService={kernelService}
              kernelStatus={kernelStatus}
              onOpenKernelDropdown={onOpenKernelDropdown}
              workspaceDirectory={workspaceDirectory ?? undefined}
              recentFiles={recentFiles}
              onOpenFile={onOpenFile}
            />
          </AssistantProvider>
        </ResizablePanel>
      </ResizablePanelGroup>

      <BusinessWorkspaceSearchDialog
        open={workspaceSearchDialogOpen}
        onOpenChange={setWorkspaceSearchDialogOpen}
        workspaceDirectory={workspaceDirectory}
        kernelService={kernelService}
        onFileSelect={onOpenFile}
        onNavigateToLine={onNavigateToLine}
      />

      <Dialog open={newAnalysisDialogOpen} onOpenChange={setNewAnalysisDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>
              {workspaceDirectory === "" || workspaceDirectory === null
                ? "Create a new notebook at the server root."
                : `Create a new notebook in "${workspaceDirectory}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="business-new-analysis-name">Analysis name</Label>
            <Input
              id="business-new-analysis-name"
              ref={analysisNameInputRef}
              value={analysisName}
              onChange={(event) => setAnalysisName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateNewAnalysis();
                }
              }}
              placeholder="analysis-2026-07-06"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewAnalysisDialogOpen(false)}
              disabled={isCreatingAnalysis}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateNewAnalysis()}
              disabled={isCreatingAnalysis || analysisName.trim().length === 0}
            >
              {isCreatingAnalysis ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
