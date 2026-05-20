"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { LeftSidebar } from "@/components/left-sidebar/left-sidebar";
import { RightSidebar } from "@/components/right-sidebar/right-sidebar";
import { SettingsMenu } from "@/components/settings-menu";
import { Separator } from "@/components/ui/separator";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { NotebookMinimapSection } from "@/components/notebook/notebook-minimap";
import { Editor } from "@/components/editor";
import {
  Save,
  Check,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Circle,
  ChevronDown,
  Scan,
  MessagesSquare,
  PanelLeft,
  X,
  AlertTriangle,
  History,
  Eye,
  EyeOff,
} from "lucide-react";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { NotebookViewToggle } from "@/components/notebook/notebook-view-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KernelStatus, KernelInfo } from "@/lib/types";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  KernelService,
  type RunningKernelSidebarInfo,
} from "@/lib/kernel/kernel-service";
import { KernelConnectionDialog } from "@/components/notebook/kernel-dialogs";
import {
  saveKernelConnection,
  getStoredKernelConnections,
} from "@/lib/kernel/kernel-storage";
import { AssistantProvider } from "@/lib/agent";
import type { NotebookType } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileIcon } from "@/components/common/file-icon";
import { KernelIcon } from "@/components/common/kernel-icon";
import { AltOrOption } from "@/components/common/keyboard-icons";
import { EditorReloadDialog } from "@/components/editor-reload-dialog";
import { useJupyterShellReady } from "@/hooks/use-jupyter-shell-ready";
import {
  OpenSettingsProvider,
  useOpenSettings,
} from "@/contexts/open-settings-context";
import { NotebookViewModeProvider } from "@/contexts/notebook-view-mode-context";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { useIsMobile } from "@/hooks/use-platform";
import {
  MobileLayoutProvider,
  useMobileLayout,
} from "@/contexts/mobile-layout-context";
import { MobileToolbar } from "@/components/mobile/mobile-toolbar";
import { SettingsDialog } from "@/components/settings-dialog/settings-dialog";
import { TerminalPool } from "@/lib/shell/terminal-pool";
import { openPathInSystemTerminal } from "@/lib/shell/system-commands/open-file";
import {
  DEFAULT_PANEL_LAYOUT_STATE,
  DEFAULT_PANEL_VISIBILITY_STATE,
  loadPanelLayoutState,
  loadPanelVisibilityState,
  savePanelLayoutState,
  savePanelVisibilityState,
  type PanelLayoutState,
  type PanelVisibilityState,
} from "@/lib/ui-session-state";

type ActiveFile = {
  name: string;
  path: string;
  /** Opens notebook JSON with the generic Monaco text editor. */
  openAsText?: boolean;
};

type UnsavedDialogIntent =
  | { type: "reload" }
  | { type: "switch-file"; file: ActiveFile }
  | { type: "close-file" };

const ACTIVE_FILE_SESSION_KEY = "activeFile";
const WORKSPACE_DIRECTORY_SESSION_KEY = "workspaceDirectory";
/** Persists open-file history across sessions and browser tabs. */
const RECENT_FILES_STORAGE_KEY = "recentFiles";

/**
 * Returns a stable display name from a full Jupyter-relative path.
 */
function deriveFileNameFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/**
 * Returns true when a file selection should own a notebook kernel session.
 */
function isNotebookFile(file: ActiveFile): boolean {
  if (file.openAsText) return false;
  const candidate = file.path || file.name;
  return candidate.toLowerCase().endsWith(".ipynb");
}

/**
 * Whether `filePath` is the workspace folder itself or contained in it (Jupyter-relative paths).
 * Server root workspace (`""`) contains every non-empty path under the Jupyter root.
 */
function isJupyterPathWithinWorkspace(
  filePath: string,
  workspacePath: string,
): boolean {
  const norm = (p: string) => p.replace(/^\/+/, "").replace(/\/+$/, "");
  const fp = norm(filePath);
  const ws = norm(workspacePath);
  if (!fp) return true;
  if (ws === "") return true;
  if (fp === ws) return true;
  return fp.startsWith(`${ws}/`);
}

/**
 * Parses a stored active-file payload from session storage.
 */
function parseStoredCurrentFile(raw: string | null): ActiveFile | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const maybePath = (parsed as { path?: unknown }).path;
    if (typeof maybePath !== "string" || maybePath.length === 0) return null;

    const maybeName = (parsed as { name?: unknown }).name;
    const name =
      typeof maybeName === "string" && maybeName.length > 0
        ? maybeName
        : deriveFileNameFromPath(maybePath);

    const maybeOpenAsText = (parsed as { openAsText?: unknown }).openAsText;

    return {
      name,
      path: maybePath,
      openAsText: maybeOpenAsText === true ? true : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Mobile layout props passed from the Page component.
 * Avoids duplicating state by reusing references to parent-level state.
 */
interface MobileLayoutProps {
  currentFile: ActiveFile;
  recentFiles: ActiveFile[];
  onFileSelect: (file: ActiveFile) => void;
  onNavigateToLine: (file: ActiveFile, line: number) => void;
  notebookMinimap: NotebookMinimapSection[];
  onMinimapNavigate: (cellIndex: number, outputIndex?: number) => void;
  runningKernels: RunningKernelSidebarInfo[];
  onSessionSelect: (session: RunningKernelSidebarInfo) => void;
  onSessionShutdown: (session: RunningKernelSidebarInfo) => void;
  onShutdownAllKernels: () => void | Promise<void>;
  onRefreshKernels: () => void | Promise<void>;
  kernelService: KernelService | null;
  workspaceDirectory: string | null;
  onWorkspaceChange: (dir: string | null) => void;
  onOpenKernelDropdown: () => void;
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  notebook: NotebookType | null;
  hasWorkspaceOpen: boolean;
  hasServerConnection: boolean;
  openConnectionDialog: () => void;
  isRunning: boolean;
  executionCountRef: React.MutableRefObject<number>;
  onKernelStatusChange: React.Dispatch<React.SetStateAction<KernelStatus>>;
  onCurrentKernelChange: React.Dispatch<
    React.SetStateAction<KernelInfo | null>
  >;
  onIsRunningChange: React.Dispatch<React.SetStateAction<boolean>>;
  onNotebookChange: React.Dispatch<React.SetStateAction<NotebookType | null>>;
  onUnsavedChangesChange: React.Dispatch<React.SetStateAction<boolean>>;
  /** When true, code cell editors are hidden in the UI only (not persisted). */
  notebookPresentationHideAllInputs: boolean;
  onFileLoadError: (path: string) => void;
  onWorkspacePathRenamed?: (payload: {
    oldPath: string;
    newPath: string;
    newName: string;
    itemType: "file" | "folder";
  }) => void;
  onWorkspacePathDeleted?: (payload: {
    path: string;
    itemType: "file" | "folder";
  }) => void;
  chatTitle?: string;
}

/**
 * Full-screen mobile layout. Shows one panel at a time based on
 * the active view from MobileLayoutContext.
 * The hamburger menu is present at the top of every view.
 */
function MobileLayout({
  currentFile,
  recentFiles,
  onFileSelect,
  onNavigateToLine,
  notebookMinimap,
  onMinimapNavigate,
  runningKernels,
  onSessionSelect,
  onSessionShutdown,
  onShutdownAllKernels,
  onRefreshKernels,
  kernelService,
  workspaceDirectory,
  onWorkspaceChange,
  onOpenKernelDropdown,
  currentKernel,
  kernelStatus,
  notebook,
  hasWorkspaceOpen,
  hasServerConnection,
  openConnectionDialog,
  isRunning,
  executionCountRef,
  onKernelStatusChange,
  onCurrentKernelChange,
  onIsRunningChange,
  onNotebookChange,
  onUnsavedChangesChange,
  notebookPresentationHideAllInputs,
  onFileLoadError,
  onWorkspacePathRenamed,
  onWorkspacePathDeleted,
}: MobileLayoutProps) {
  const { activeMobileView, setActiveMobileView } = useMobileLayout();
  const {
    open: isSettingsOpen,
    onOpenChange: setIsSettingsOpen,
    initialTab,
  } = useOpenSettings();

  /** Wraps file selection to also navigate to the editor view on mobile. */
  const handleMobileFileSelect = React.useCallback(
    (file: ActiveFile) => {
      onFileSelect(file);
      setActiveMobileView("editor");
    },
    [onFileSelect, setActiveMobileView],
  );

  /** Wraps navigate-to-line to also switch to the editor view on mobile. */
  const handleMobileNavigateToLine = React.useCallback(
    (file: ActiveFile, line: number) => {
      onNavigateToLine(file, line);
      setActiveMobileView("editor");
    },
    [onNavigateToLine, setActiveMobileView],
  );

  const viewTitle: Record<string, string> = {
    chat: "Chat",
    "left-sidebar": "Files",
    editor: currentFile.name || "Editor",
    terminal: "Terminal",
  };

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden">
      <MobileToolbar
        title={
          activeMobileView === "chat"
            ? undefined
            : viewTitle[activeMobileView]
        }
        onOpenKernelSelector={openConnectionDialog}
      />

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeMobileView === "chat" && (
          <AssistantProvider
            kernelService={kernelService}
            notebook={notebook}
            workspaceDirectory={workspaceDirectory ?? undefined}
            onAgentNotebookChange={() => {
              window.dispatchEvent(new CustomEvent("agentNotebookModified"));
            }}
          >
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden">
                <RightSidebar
                  activeNotebookPath={currentFile.path}
                  activeNotebook={notebook}
                  kernelService={kernelService}
                  kernelStatus={kernelStatus}
                  onOpenKernelDropdown={
                    !currentKernel ? openConnectionDialog : onOpenKernelDropdown
                  }
                  workspaceDirectory={workspaceDirectory ?? undefined}
                  recentFiles={recentFiles}
                  onOpenFile={handleMobileFileSelect}
                />
              </div>
            </div>
          </AssistantProvider>
        )}

        {activeMobileView === "left-sidebar" && (
          <LeftSidebar
            currentFile={currentFile}
            onFileSelect={handleMobileFileSelect}
            onNavigateToLine={handleMobileNavigateToLine}
            notebookMinimap={notebookMinimap}
            onMinimapNavigate={onMinimapNavigate}
            kernelSessions={runningKernels}
            onSessionSelect={onSessionSelect}
            onSessionShutdown={onSessionShutdown}
            onShutdownAllKernels={onShutdownAllKernels}
            onRefreshKernels={onRefreshKernels}
            kernelService={kernelService}
            workspaceDirectory={workspaceDirectory}
            onWorkspaceChange={onWorkspaceChange}
            onWorkspacePathRenamed={onWorkspacePathRenamed}
            onWorkspacePathDeleted={onWorkspacePathDeleted}
            onOpenKernelDropdown={
              !currentKernel ? openConnectionDialog : onOpenKernelDropdown
            }
            mobileFilesOnly
          />
        )}

        {activeMobileView === "editor" && (
          <div className="flex flex-col h-full overflow-hidden">
            <Editor
              filepath={currentFile.path}
              openNotebookAsText={currentFile.openAsText === true}
              hasWorkspace={hasWorkspaceOpen}
              hasServerConnection={hasServerConnection}
              onConnectServer={openConnectionDialog}
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
              presentationHideAllCellInputs={notebookPresentationHideAllInputs}
              onFileLoadError={onFileLoadError}
            />
          </div>
        )}

        {activeMobileView === "terminal" && (
          <TerminalPanel
            kernelService={kernelService}
            onOpenKernelDropdown={
              !currentKernel ? openConnectionDialog : onOpenKernelDropdown
            }
          />
        )}
      </div>

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        initialTab={initialTab}
      />
    </div>
  );
}

export default function Page() {
  const {
    effectiveSettings,
    isHydrated,
    setUserSettings,
    setWorkspaceSettingsSource,
  } = useOrionSettings();
  const isMobile = useIsMobile();
  const [currentFile, setCurrentFile] = useState<ActiveFile>({
    name: "",
    path: "",
  });
  /**
   * Tracks the previous file when attempting to open a new file, so we can
   * restore it if the new file fails to load.
   */
  const pendingFileSelectionRef = useRef<{
    failedPath: string;
    fallbackFile: ActiveFile;
  } | null>(null);
  const hasRestoredSessionRef = useRef(false);
  const kernelServiceRef = React.useRef<KernelService | null>(null);
  const externalOpenTerminalPoolRef = React.useRef<TerminalPool | null>(null);
  const [workspaceDirectory, setWorkspaceDirectory] = useState<string | null>(
    null,
  );
  const [notebook, setNotebook] = useState<NotebookType | null>(null);
  const [notebookMinimap, setNotebookMinimap] = useState<
    NotebookMinimapSection[]
  >([]);
  // Unsaved changes and reload dialog state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [unsavedDialogIntent, setUnsavedDialogIntent] =
    useState<UnsavedDialogIntent | null>(null);
  // Flag set before an intentional window.location.reload() to skip beforeunload warning
  const intentionalReloadRef = useRef(false);

  // Warn via native browser dialog when user reloads via any mechanism other
  // than our intercepted keyboard shortcuts (address bar, browser button, etc.)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (intentionalReloadRef.current || !hasUnsavedChanges) return;
      e.preventDefault();
      // Modern browsers show their own generic message; returnValue is required for legacy support
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Intercept Ctrl/Cmd+R and F5 to show our custom reload dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isReloadShortcut =
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key === "r") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "R");

      if (!isReloadShortcut) return;

      if (!hasUnsavedChanges) return; // No unsaved changes — allow normal reload

      e.preventDefault();
      e.stopPropagation();

      setUnsavedDialogIntent({ type: "reload" });
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [hasUnsavedChanges]);

  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [recentFiles, setRecentFiles] = useState<ActiveFile[]>([]);
  const [open, setOpen] = useState(false);
  const [isFileIconHovered, setIsFileIconHovered] = useState(false);
  const leftPanelRef = useRef<any>(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(
    DEFAULT_PANEL_VISIBILITY_STATE.leftCollapsed,
  );
  const rightPanelRef = useRef<any>(null);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(
    DEFAULT_PANEL_VISIBILITY_STATE.rightCollapsed,
  );
  const bottomPanelRef = useRef<any>(null);
  const [bottomSidebarCollapsed, setBottomSidebarCollapsed] = useState(
    DEFAULT_PANEL_VISIBILITY_STATE.bottomCollapsed,
  );
  const [hasLoadedPanelVisibilityState, setHasLoadedPanelVisibilityState] =
    useState(false);
  const [isFocusMode, setIsFocusMode] = useState(
    DEFAULT_PANEL_VISIBILITY_STATE.isFocusMode,
  );
  /** While Focus mode is on, sidebar chrome is hidden until that panel is hovered or focused. */
  const [focusLeftHovered, setFocusLeftHovered] = useState(false);
  const [focusLeftFocused, setFocusLeftFocused] = useState(false);
  const [focusRightHovered, setFocusRightHovered] = useState(false);
  const [focusRightFocused, setFocusRightFocused] = useState(false);
  const leftSidebarRevealRef = useRef<HTMLDivElement>(null);
  const rightSidebarRevealRef = useRef<HTMLDivElement>(null);
  const isLeftSidebarRevealed = focusLeftHovered || focusLeftFocused;
  const isRightSidebarRevealed = focusRightHovered || focusRightFocused;
  const isLeftSidebarContentHidden = isFocusMode && !isLeftSidebarRevealed;
  const isRightSidebarContentHidden = isFocusMode && !isRightSidebarRevealed;
  const [horizontalPanelSizes, setHorizontalPanelSizes] = useState<
    [number, number, number]
  >(DEFAULT_PANEL_LAYOUT_STATE.horizontal);
  const [verticalPanelSizes, setVerticalPanelSizes] = useState<
    [number, number]
  >(DEFAULT_PANEL_LAYOUT_STATE.vertical);
  const panelLayoutRef = useRef<PanelLayoutState>(DEFAULT_PANEL_LAYOUT_STATE);
  const persistPanelLayoutRef = useRef(false);

  useEffect(() => {
    const savedLayout = loadPanelLayoutState();
    panelLayoutRef.current = savedLayout;
    setHorizontalPanelSizes(savedLayout.horizontal);
    setVerticalPanelSizes(savedLayout.vertical);

    const savedVisibility = loadPanelVisibilityState();
    setLeftSidebarCollapsed(savedVisibility.leftCollapsed);
    setRightSidebarCollapsed(savedVisibility.rightCollapsed);
    setBottomSidebarCollapsed(savedVisibility.bottomCollapsed);
    setIsFocusMode(savedVisibility.isFocusMode);
    setHasLoadedPanelVisibilityState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedPanelVisibilityState) return;
    savePanelVisibilityState({
      leftCollapsed: leftSidebarCollapsed,
      rightCollapsed: rightSidebarCollapsed,
      bottomCollapsed: bottomSidebarCollapsed,
      isFocusMode,
    });
  }, [
    bottomSidebarCollapsed,
    hasLoadedPanelVisibilityState,
    isFocusMode,
    leftSidebarCollapsed,
    rightSidebarCollapsed,
  ]);

  useEffect(() => {
    if (!isHydrated || !hasLoadedPanelVisibilityState) return;

    persistPanelLayoutRef.current = false;

    if (leftPanelRef.current) {
      if (leftSidebarCollapsed) {
        leftPanelRef.current.collapse();
      } else {
        leftPanelRef.current.expand();
      }
    }

    if (rightPanelRef.current) {
      if (rightSidebarCollapsed) {
        rightPanelRef.current.collapse();
      } else {
        rightPanelRef.current.expand();
      }
    }

    if (bottomPanelRef.current) {
      if (bottomSidebarCollapsed) {
        bottomPanelRef.current.collapse();
      } else {
        bottomPanelRef.current.expand();
      }
    }

    const frameId = window.requestAnimationFrame(() => {
      persistPanelLayoutRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    bottomSidebarCollapsed,
    hasLoadedPanelVisibilityState,
    isHydrated,
    leftSidebarCollapsed,
    rightSidebarCollapsed,
  ]);

  /**
   * Parses stored recent-files JSON into `ActiveFile[]`.
   */
  const parseStoredRecentFiles = (stored: string | null): ActiveFile[] => {
    try {
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      return Array.isArray(parsed)
        ? parsed
          .map((file): ActiveFile | null => {
            if (!file || typeof file !== "object") return null;
            const path = (file as { path?: unknown }).path;
            if (typeof path !== "string" || path.length === 0) return null;
            const name = (file as { name?: unknown }).name;
            const openAsText = (file as { openAsText?: unknown }).openAsText;
            const activeFile: ActiveFile = {
              name:
                typeof name === "string" && name.length > 0
                  ? name
                  : deriveFileNameFromPath(path),
              path,
              openAsText: openAsText === true ? true : undefined,
            };
            return activeFile;
          })
          .filter((file): file is ActiveFile => file !== null)
        : [];
    } catch (error) {
      console.warn("Failed to parse recent files from storage:", error);
      return [];
    }
  };

  /**
   * Saves recent files to `localStorage` (migrated once from legacy `sessionStorage`).
   */
  const saveRecentFilesToStorage = useCallback((files: ActiveFile[]) => {
    try {
      localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(files));
    } catch (error) {
      console.warn("Failed to save recent files to local storage:", error);
    }
  }, []);

  /**
   * Loads recent files from `localStorage`, or migrates from pre-change `sessionStorage`.
   */
  const loadRecentFilesFromStorage = (): ActiveFile[] => {
    try {
      let raw = localStorage.getItem(RECENT_FILES_STORAGE_KEY);
      if (raw === null) {
        const legacy = sessionStorage.getItem(RECENT_FILES_STORAGE_KEY);
        if (legacy !== null) {
          try {
            localStorage.setItem(RECENT_FILES_STORAGE_KEY, legacy);
            sessionStorage.removeItem(RECENT_FILES_STORAGE_KEY);
          } catch (migrateError) {
            console.warn(
              "Failed to migrate recent files from session to local storage:",
              migrateError,
            );
          }
          raw = legacy;
        }
      }
      return parseStoredRecentFiles(raw);
    } catch (error) {
      console.warn("Failed to load recent files from local storage:", error);
      return [];
    }
  };

  /**
   * Adds a file to the recent files list
   */
  const addToRecentFiles = useCallback(
    (file: ActiveFile) => {
      if (!file.name || !file.path) return;

      setRecentFiles((prevFiles) => {
        // Remove existing entry if it exists
        const filtered = prevFiles.filter((f) => f.path !== file.path);
        // Add to beginning of list
        const newFiles = [file, ...filtered].slice(0, 10); // Keep only last 10 files

        // Save to local storage
        saveRecentFilesToStorage(newFiles);

        return newFiles;
      });
    },
    [saveRecentFilesToStorage],
  );

  // Load recent files on component mount
  useEffect(() => {
    const storedFiles = loadRecentFilesFromStorage();
    setRecentFiles(storedFiles);
  }, []);

  /**
   * Persists the current workspace path so refreshes reopen the same workspace.
   */
  useEffect(() => {
    if (!hasRestoredSessionRef.current) return;
    try {
      if (workspaceDirectory === null || workspaceDirectory === undefined) {
        sessionStorage.removeItem(WORKSPACE_DIRECTORY_SESSION_KEY);
        return;
      }
      sessionStorage.setItem(
        WORKSPACE_DIRECTORY_SESSION_KEY,
        workspaceDirectory,
      );
    } catch (error) {
      console.warn(
        "Failed to persist workspace directory to session storage:",
        error,
      );
    }
  }, [workspaceDirectory]);

  /**
   * Persists the current file so refreshes reopen the same file in the editor.
   */
  useEffect(() => {
    if (!hasRestoredSessionRef.current) return;
    try {
      if (!currentFile.path) {
        sessionStorage.removeItem(ACTIVE_FILE_SESSION_KEY);
        return;
      }

      sessionStorage.setItem(
        ACTIVE_FILE_SESSION_KEY,
        JSON.stringify({
          name: currentFile.name || deriveFileNameFromPath(currentFile.path),
          path: currentFile.path,
          openAsText: currentFile.openAsText === true ? true : undefined,
        }),
      );
    } catch (error) {
      console.warn("Failed to persist current file to session storage:", error);
    }
  }, [currentFile.name, currentFile.openAsText, currentFile.path]);

  /** Dispatches a minimap navigation event to the NotebookEditor */
  const handleMinimapNavigate = useCallback(
    (cellIndex: number, outputIndex?: number) => {
      window.dispatchEvent(
        new CustomEvent("notebookMinimapNavigate", {
          detail: { cellIndex, outputIndex },
        }),
      );
    },
    [],
  );

  /**
   * Closes the current file and clears the editor.
   */
  const closeCurrentFile = useCallback(() => {
    pendingFileSelectionRef.current = null;
    setCurrentFile({ name: "", path: "" });
    setNotebook(null);
    setOpen(false);
  }, []);

  const handleCloseFile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasUnsavedChanges) {
        setUnsavedDialogIntent({ type: "close-file" });
        return;
      }
      closeCurrentFile();
    },
    [closeCurrentFile, hasUnsavedChanges],
  );

  const selectFile = useCallback(
    (file: ActiveFile) => {
      if (
        file.path !== currentFile.path ||
        file.openAsText !== currentFile.openAsText
      ) {
        pendingFileSelectionRef.current = {
          failedPath: file.path,
          fallbackFile: currentFile,
        };
      }
      setCurrentFile(file);
      addToRecentFiles(file);
    },
    [addToRecentFiles, currentFile],
  );

  /**
   * Opens a path with the OS-default application after Orion's editor cannot
   * load it natively.
   */
  const openFileExternally = useCallback((path: string): boolean => {
    const service = kernelServiceRef.current;
    if (!service) return false;

    const pool =
      externalOpenTerminalPoolRef.current ?? new TerminalPool(service);
    externalOpenTerminalPoolRef.current = pool;
    void openPathInSystemTerminal(pool, service, path).catch((error) => {
      console.error("Failed to open file in system application:", error);
    });
    return true;
  }, []);

  /**
   * Handles file selection and tracks fallback state for load failures.
   */
  const handleFileSelect = useCallback(
    (file: ActiveFile) => {
      if (
        file.path === currentFile.path &&
        file.openAsText === currentFile.openAsText
      ) {
        return;
      }
      if (hasUnsavedChanges) {
        setUnsavedDialogIntent({ type: "switch-file", file });
        return;
      }
      selectFile(file);
    },
    [currentFile.openAsText, currentFile.path, hasUnsavedChanges, selectFile],
  );

  /**
   * Opens a file and scrolls to a specific line number.
   * Used by the workspace search panel when the user clicks a content match.
   */
  const handleNavigateToLine = useCallback(
    (file: ActiveFile, line: number) => {
      handleFileSelect(file);
      // Dispatch after a short delay so the editor has time to load the file
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("orion:navigateToLine", {
            detail: { path: file.path, line },
          }),
        );
      }, 150);
    },
    [handleFileSelect],
  );

  /**
   * Restores the previous file when the newly selected file fails to load.
   */
  const handleEditorFileLoadError = useCallback(
    (failedFilepath: string): boolean => {
      const openedExternally = openFileExternally(failedFilepath);
      const pendingSelection = pendingFileSelectionRef.current;
      const fallbackFile =
        pendingSelection?.failedPath === failedFilepath
          ? pendingSelection.fallbackFile
          : null;

      if (!fallbackFile) {
        setCurrentFile((activeFile) =>
          activeFile.path === failedFilepath
            ? { name: "", path: "" }
            : activeFile,
        );
        setRecentFiles((prevFiles) => {
          const filtered = prevFiles.filter(
            (file) => file.path !== failedFilepath,
          );
          if (filtered.length !== prevFiles.length) {
            saveRecentFilesToStorage(filtered);
          }
          return filtered;
        });
        return openedExternally;
      }

      setCurrentFile((activeFile) =>
        activeFile.path === failedFilepath ? fallbackFile : activeFile,
      );
      setRecentFiles((prevFiles) => {
        const filtered = prevFiles.filter(
          (file) => file.path !== failedFilepath,
        );
        if (filtered.length !== prevFiles.length) {
          saveRecentFilesToStorage(filtered);
        }
        return filtered;
      });
      pendingFileSelectionRef.current = null;
      return openedExternally;
    },
    [openFileExternally, saveRecentFilesToStorage],
  );

  /**
   * Handles saving the current file
   */
  const handleSave = async () => {
    if (!currentFile.path) return;

    // Dispatch a custom event to be caught by the Editor component
    window.dispatchEvent(new CustomEvent("saveFile"));

    // Show check mark
    setIsSaved(true);

    // Reset to save icon after 2 seconds
    setTimeout(() => {
      setIsSaved(false);
    }, 1000);
  };

  /**
   * Saves then completes the pending action (reload, switch file, or close).
   */
  const handleUnsavedDialogSave = useCallback(() => {
    if (!unsavedDialogIntent) return;
    setUnsavedDialogIntent(null);

    window.dispatchEvent(new CustomEvent("saveFile"));
    if (unsavedDialogIntent.type === "reload") {
      intentionalReloadRef.current = true;
      window.location.reload();
      return;
    }
    if (unsavedDialogIntent.type === "switch-file") {
      selectFile(unsavedDialogIntent.file);
      return;
    }
    closeCurrentFile();
  }, [closeCurrentFile, selectFile, unsavedDialogIntent]);

  /**
   * Discards unsaved changes and completes the pending action.
   */
  const handleUnsavedDialogDiscard = useCallback(() => {
    if (!unsavedDialogIntent) return;
    setUnsavedDialogIntent(null);

    if (unsavedDialogIntent.type === "reload") {
      intentionalReloadRef.current = true;
      window.location.reload();
      return;
    }
    if (unsavedDialogIntent.type === "switch-file") {
      selectFile(unsavedDialogIntent.file);
      return;
    }
    closeCurrentFile();
  }, [closeCurrentFile, selectFile, unsavedDialogIntent]);

  // Subscribe to notebook minimap updates dispatched by NotebookEditor
  useEffect(() => {
    const handleMinimapUpdate = (e: CustomEvent) => {
      setNotebookMinimap(e.detail.sections ?? []);
    };

    window.addEventListener(
      "notebookMinimapUpdate",
      handleMinimapUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "notebookMinimapUpdate",
        handleMinimapUpdate as EventListener,
      );
    };
  }, []);

  // Navigate to notebooks created by the agent
  useEffect(() => {
    const handleAgentCreated = (e: CustomEvent) => {
      const path = e.detail?.path as string | undefined;
      if (!path) return;
      const name = path.split("/").pop() ?? path;
      const newFile = { name, path };
      setCurrentFile(newFile);
      addToRecentFiles(newFile);
    };
    window.addEventListener(
      "agentNotebookCreated",
      handleAgentCreated as EventListener,
    );
    return () =>
      window.removeEventListener(
        "agentNotebookCreated",
        handleAgentCreated as EventListener,
      );
  }, []);

  // Kernel state lifted from NotebookEditor
  const [kernelStatus, setKernelStatus] =
    useState<KernelStatus>("disconnected");
  const [currentKernel, setCurrentKernel] = useState<KernelInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [kernelService, setKernelService] = useState<KernelService | null>(
    null,
  );
  const [availableKernels, setAvailableKernels] = useState<KernelInfo[]>([]);
  const [isKernelDropdownOpen, setIsKernelDropdownOpen] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const executionCountRef = React.useRef(0);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const autoConnectionAttemptedRef = React.useRef(false);
  const [runningKernels, setRunningKernels] = useState<
    RunningKernelSidebarInfo[]
  >([]);
  const { serverAvailable: isJupyterServerReady } =
    useJupyterShellReady(kernelService);

  useEffect(() => {
    setWorkspaceSettingsSource(
      kernelService?.getContentsManager() ?? null,
      workspaceDirectory
    );
  }, [kernelService, setWorkspaceSettingsSource, workspaceDirectory]);

  /**
   * Restores the last opened workspace and file only after the Jupyter server
   * is reachable, to avoid early fetch failures and UI thrashing on boot.
   * URL query params (?file=&workspace=) take precedence over sessionStorage,
   * allowing files to be opened directly in a new tab.
   */
  useEffect(() => {
    if (!isJupyterServerReady || hasRestoredSessionRef.current) {
      return;
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const urlFile = params.get("file");
      const urlWorkspace = params.get("workspace");

      const workspaceToRestore =
        urlWorkspace !== null
          ? urlWorkspace
          : sessionStorage.getItem(WORKSPACE_DIRECTORY_SESSION_KEY);

      if (workspaceToRestore !== null) {
        setWorkspaceDirectory(workspaceToRestore);
      }

      const fileToRestore = urlFile
        ? { name: deriveFileNameFromPath(urlFile), path: urlFile }
        : parseStoredCurrentFile(
          sessionStorage.getItem(ACTIVE_FILE_SESSION_KEY),
        );

      if (fileToRestore) {
        setCurrentFile(fileToRestore);
        addToRecentFiles(fileToRestore);
      }

      if (urlFile || urlWorkspace) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState(null, "", cleanUrl);
      }
    } catch (error) {
      console.warn(
        "Failed to restore workspace/file from session storage after server connection:",
        error,
      );
    } finally {
      hasRestoredSessionRef.current = true;
    }
  }, [addToRecentFiles, isJupyterServerReady]);

  /**
   * Refresh the sidebar's running-kernel list from the Jupyter server.
   *
   * This follows list-kernels semantics by querying server-side running sessions
   * (deduped by kernel ID), not only Orion-tracked local sessions.
   */
  const refreshRunningKernels = React.useCallback(async () => {
    if (!kernelService) {
      setRunningKernels([]);
      return;
    }
    try {
      const kernels = await kernelService.getRunningKernelsForSidebar();
      setRunningKernels(kernels);
    } catch (error) {
      console.error("Failed to refresh running kernels:", error);
      setRunningKernels([]);
    }
  }, [kernelService]);

  /**
   * Replace the active KernelService and dispose the previous one to avoid
   * leaked background polling against stale credentials.
   */
  const replaceKernelService = React.useCallback(
    (nextService: KernelService | null) => {
      setKernelService((previousService) => {
        if (previousService && previousService !== nextService) {
          previousService.dispose();
        }
        return nextService;
      });
    },
    [],
  );

  /**
   * Keeps the open file, recent list, and kernel session paths aligned when
   * an item is renamed from the file tree.
   */
  const handleWorkspacePathRenamed = React.useCallback(
    (payload: {
      oldPath: string;
      newPath: string;
      newName: string;
      itemType: "file" | "folder";
    }) => {
      if (kernelService) {
        kernelService.retargetPathsAfterRename(
          payload.oldPath,
          payload.newPath,
          payload.itemType,
        );
      }

      setCurrentFile((prev) => {
        if (!prev.path) return prev;
        if (payload.itemType === "file") {
          if (prev.path === payload.oldPath) {
            return { name: payload.newName, path: payload.newPath };
          }
          return prev;
        }
        if (prev.path === payload.oldPath) {
          return { name: payload.newName, path: payload.newPath };
        }
        const prefix = `${payload.oldPath}/`;
        if (prev.path.startsWith(prefix)) {
          return {
            name: prev.name,
            path: payload.newPath + prev.path.slice(payload.oldPath.length),
          };
        }
        return prev;
      });

      setRecentFiles((prev) => {
        const next = prev.map((f) => {
          if (payload.itemType === "file") {
            if (f.path === payload.oldPath) {
              return { name: payload.newName, path: payload.newPath };
            }
            return f;
          }
          if (f.path === payload.oldPath) {
            return { name: payload.newName, path: payload.newPath };
          }
          const prefix = `${payload.oldPath}/`;
          if (f.path.startsWith(prefix)) {
            return {
              name: f.name,
              path: payload.newPath + f.path.slice(payload.oldPath.length),
            };
          }
          return f;
        });
        saveRecentFilesToStorage(next);
        return next;
      });
    },
    [kernelService, saveRecentFilesToStorage],
  );

  /**
   * Closes the editor and clears recent entries when a deleted tree item
   * matches the open file or lives under a deleted folder.
   */
  const handleWorkspacePathDeleted = React.useCallback(
    (payload: { path: string; itemType: "file" | "folder" }) => {
      const prefix = `${payload.path}/`;
      const pathMatches = (p: string) => {
        if (!p) return false;
        return payload.itemType === "file"
          ? p === payload.path
          : p === payload.path || p.startsWith(prefix);
      };

      if (kernelService) {
        const pathsToShutdown = kernelService
          .listActiveSessions()
          .map((s) => s.path)
          .filter((p) => pathMatches(p));
        for (const p of pathsToShutdown) {
          void kernelService.shutdownSession(p);
        }
      }

      setRecentFiles((prev) => {
        const next = prev.filter((f) => !pathMatches(f.path));
        saveRecentFilesToStorage(next);
        return next;
      });

      let closedEditor = false;
      setCurrentFile((prev) => {
        if (!pathMatches(prev.path)) return prev;
        closedEditor = true;
        return { name: "", path: "" };
      });
      if (closedEditor) {
        setHasUnsavedChanges(false);
        pendingFileSelectionRef.current = null;
        setNotebook(null);
        setOpen(false);
      }
    },
    [kernelService, saveRecentFilesToStorage],
  );

  /**
   * Attempts to auto-connect to stored kernel connections on page load
   */
  const attemptAutoConnection = React.useCallback(async () => {
    if (autoConnectionAttemptedRef.current) return false;
    autoConnectionAttemptedRef.current = true;

    const recentConnections = getStoredKernelConnections();
    if (recentConnections.length === 0) return false;

    setIsAutoConnecting(true);
    console.log(
      `Attempting auto-connection to ${recentConnections.length} stored kernel(s)...`,
    );

    try {
      for (let i = 0; i < Math.min(3, recentConnections.length); i++) {
        const connection = recentConnections[i];
        console.log(`Trying connection ${i + 1}: ${connection.baseUrl}`);
        let service: KernelService | null = null;
        let keepService = false;

        try {
          service = new KernelService({
            baseUrl: connection.baseUrl,
            token: connection.token,
          });

          const validation = service.validateConfiguration();
          if (!validation.isValid) {
            console.log(
              `Connection ${i + 1} has invalid configuration, skipping...`,
            );
            continue;
          }

          const isConnected = await service.testConnection();
          if (!isConnected) {
            console.log(
              `Connection ${i + 1} failed to connect, trying next...`,
            );
            continue;
          }

          // Connection successful
          console.log(
            `Connection ${i + 1} successful! Connecting to kernel...`,
          );
          setKernelStatus("connecting");

          const fetchedKernels =
            (await service.getAvailableKernels()) as KernelInfo[];
          setAvailableKernels(
            fetchedKernels.length > 0
              ? fetchedKernels
              : [
                {
                  name: "python3",
                  displayName: "Python 3",
                  language: "python",
                },
              ],
          );

          if (fetchedKernels.length > 0) {
            const notebookPath = isNotebookFile(currentFile)
              ? currentFile.path
              : undefined;
            await service.startKernel(fetchedKernels[0].name, notebookPath);

            keepService = true;
            replaceKernelService(service);

            setCurrentKernel(fetchedKernels[0]);
            setKernelStatus("connected");
            executionCountRef.current = 0;

            // Save the successful connection
            const settings = service.getServerSettings();
            saveKernelConnection(
              settings.baseUrl,
              settings.token || undefined,
              connection.displayName,
            );
            console.log(`Auto-connection successful on attempt ${i + 1}`);
            return true; // Success, stop trying
          }

          setKernelStatus("disconnected");
        } catch (error) {
          console.log(`Connection ${i + 1} failed with error:`, error);
          if (i === Math.min(3, recentConnections.length) - 1) {
            // Last attempt failed
            console.log("All auto-connection attempts failed");
            setKernelStatus("disconnected");
          }
        } finally {
          if (service && !keepService) {
            service.dispose();
          }
        }
      }
    } finally {
      setIsAutoConnecting(false);
    }

    return false;
  }, [currentFile, replaceKernelService]);

  // Keep refs aligned with the latest service for cleanup and external opens.
  useEffect(() => {
    kernelServiceRef.current = kernelService;
    externalOpenTerminalPoolRef.current?.dispose();
    externalOpenTerminalPoolRef.current = null;
  }, [kernelService]);

  // Initialize kernel service and attempt auto-connection
  useEffect(() => {
    const initializeKernelService = async () => {
      try {
        // First try auto-connection to stored kernels
        const autoConnected = await attemptAutoConnection();
        if (autoConnected) {
          return;
        }

        // If auto-connection didn't work, initialize default local service.
        // Read from ref to avoid stale closure values after async work.
        if (!kernelServiceRef.current) {
          const service = new KernelService();
          try {
            const kernels =
              (await service.getAvailableKernels()) as KernelInfo[];
            replaceKernelService(service);
            setAvailableKernels(
              kernels.length > 0
                ? kernels
                : [
                  {
                    name: "python3",
                    displayName: "Python 3",
                    language: "python",
                  },
                ],
            );
          } catch {
            service.dispose();
            throw new Error("Failed to initialize default kernel service");
          }
        }
      } catch (error) {
        console.warn("Failed to initialize kernel service:", error);
        setAvailableKernels([
          { name: "python3", displayName: "Python 3", language: "python" },
        ]);
      }
    };
    initializeKernelService();
  }, [attemptAutoConnection, kernelService, replaceKernelService]);

  // Dispose on unmount to stop managers and polling.
  useEffect(() => {
    return () => {
      externalOpenTerminalPoolRef.current?.dispose();
      kernelServiceRef.current?.dispose();
    };
  }, []);

  // Subscribe to kernel status changes
  useEffect(() => {
    if (!kernelService) return;
    const kernel = kernelService.getKernel();
    if (!kernel) return;

    const unsubscribe = kernelService.onStatusChanged((status) => {
      switch (status) {
        case "idle":
          setKernelStatus("connected");
          setIsRunning(false);
          break;
        case "busy":
          setKernelStatus("busy");
          setIsRunning(true);
          break;
        case "starting":
        case "restarting":
          setKernelStatus("connecting");
          break;
        case "dead":
        case "terminating":
          setKernelStatus("disconnected");
          setIsRunning(false);
          setCurrentKernel(null); // Reset current kernel when disconnected
          break;
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [kernelService, currentKernel]); // Added currentKernel dependency

  // Subscribe to session map changes (sessions added/removed/died externally)
  useEffect(() => {
    if (!kernelService) return;

    const unsubscribe = kernelService.onSessionsChanged(() => {
      void refreshRunningKernels();

      // If the active path no longer has a session, update UI
      const activePath = kernelService.getActivePath();
      if (activePath && !kernelService.hasSessionForPath(activePath)) {
        setKernelStatus("disconnected");
        setCurrentKernel(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [kernelService, refreshRunningKernels]);

  // Keep the sidebar's server-running-kernel list current for this service.
  useEffect(() => {
    void refreshRunningKernels();
  }, [refreshRunningKernels]);

  // Sync the active kernel session only when the user switches notebook files.
  // Each notebook has its own independent kernel. Opening non-notebook files
  // leaves the previously active notebook kernel connected.
  useEffect(() => {
    if (!kernelService || !currentFile.path) return;

    if (!isNotebookFile(currentFile)) {
      return;
    }

    if (kernelService.hasSessionForPath(currentFile.path)) {
      // Reconnect to the existing session for this notebook
      kernelService.setActivePath(currentFile.path);
      const model = kernelService.getKernel();
      if (model) {
        const matchingSpec = availableKernels.find(
          (k) => k.name === model.name,
        );
        setCurrentKernel(
          matchingSpec || {
            name: model.name,
            displayName: model.name,
            language: "python",
          },
        );
      }
    } else {
      // Auto-start a new kernel for this notebook
      const autoStartKernel = async () => {
        try {
          setKernelStatus("connecting");
          const spec = availableKernels[0]?.name || "python3";
          await kernelService.startKernel(spec, currentFile.path);
          const model = kernelService.getKernel();
          if (model) {
            const matchingSpec = availableKernels.find(
              (k) => k.name === model.name,
            );
            setCurrentKernel(
              matchingSpec || {
                name: model.name,
                displayName: model.name,
                language: "python",
              },
            );
          }
          executionCountRef.current = 0;
        } catch (error) {
          console.warn("Auto-start kernel failed for", currentFile.path, error);
          kernelService.clearActivePath();
          setCurrentKernel(null);
        }
      };
      autoStartKernel();
    }
  }, [kernelService, currentFile, availableKernels]);

  /** Handle clicking a running kernel in the sidebar — connects and activates by kernel ID. */
  const handleSessionSelect = React.useCallback(
    async (session: RunningKernelSidebarInfo) => {
      if (!kernelService) return;
      try {
        const model = await kernelService.connectToKernel(session.kernelId);
        const matchingSpec = availableKernels.find(
          (k) => k.name === model.name,
        );
        setCurrentKernel(
          matchingSpec || {
            name: model.name,
            displayName: model.name,
            language: "python",
          },
        );
        await refreshRunningKernels();
      } catch (error) {
        console.error("Failed to connect to running kernel:", error);
      }
    },
    [kernelService, availableKernels, refreshRunningKernels],
  );

  /** Handle shutting down a running kernel from the sidebar. */
  const handleSessionShutdown = React.useCallback(
    async (session: RunningKernelSidebarInfo) => {
      if (!kernelService) return;
      try {
        await kernelService.shutdownKernelById(session.kernelId);
        await refreshRunningKernels();
      } catch (error) {
        console.error("Failed to shutdown session:", error);
      }
    },
    [kernelService, refreshRunningKernels],
  );

  /**
   * Handle refreshing the list of running kernels from the Jupyter server.
   * This fetches all active kernels and triggers a re-render of the kernel sessions list.
   */
  const handleRefreshKernels = React.useCallback(async () => {
    await refreshRunningKernels();
  }, [refreshRunningKernels]);

  /**
   * Shut down all currently running server kernels shown in the sidebar.
   */
  const handleShutdownAllKernels = React.useCallback(async () => {
    if (!kernelService) return;
    try {
      const serverKernels = await kernelService.getRunningKernelsForSidebar();
      await Promise.allSettled(
        serverKernels.map((kernel) =>
          kernelService.shutdownKernelById(kernel.kernelId),
        ),
      );
      await refreshRunningKernels();
    } catch (error) {
      console.error("Failed to shutdown all kernels:", error);
    }
  }, [kernelService, refreshRunningKernels]);

  const handleRunAll = React.useCallback((stopOnError = true) => {
    const event = new CustomEvent("runAllCells", {
      detail: { stopOnError },
    });
    window.dispatchEvent(event);
  }, []);

  const handleRestartKernel = React.useCallback(async () => {
    if (!kernelService) return;
    try {
      setKernelStatus("connecting");
      await kernelService.restart();
      executionCountRef.current = 0;
      setKernelStatus("connected");
    } catch (error) {
      console.error("Error restarting kernel:", error);
      setKernelStatus("disconnected");
    }
  }, [kernelService]);

  const handleStopKernel = React.useCallback(async () => {
    if (!kernelService) return;
    try {
      await kernelService.interrupt();
      setIsRunning(false); // Explicitly set isRunning to false
    } catch (error) {
      console.error("Error interrupting kernel:", error);
    }
  }, [kernelService]);

  const handleRestartAndRunAll = React.useCallback(async () => {
    if (!kernelService) return;
    try {
      setKernelStatus("connecting");
      await kernelService.restart();
      executionCountRef.current = 0;
      setKernelStatus("connected");

      // Wait for kernel to be fully ready before running all cells
      setTimeout(() => {
        handleRunAll();
      }, 1000);
    } catch (error) {
      console.error("Error restarting kernel:", error);
      setKernelStatus("disconnected");
    }
  }, [kernelService, handleRunAll]);

  const openConnectionDialog = React.useCallback(() => {
    setIsKernelDropdownOpen(false);
    setConnectionError("");
    requestAnimationFrame(() => setShowConnectionDialog(true));
  }, []);

  const handleDisconnect = React.useCallback(() => {
    setIsKernelDropdownOpen(false);
    replaceKernelService(null);
    setCurrentKernel(null);
    setKernelStatus("disconnected");
    setAvailableKernels([]);
  }, [replaceKernelService]);

  const handleKernelSelect = React.useCallback(
    (action: "url" | "change") => {
      if (action === "url" || action === "change") {
        openConnectionDialog();
      }
    },
    [openConnectionDialog],
  );

  const handleConnectToKernelUrlDialog = React.useCallback(
    async (url: string, token?: string) => {
      let shouldKeepService = false;
      const newService = new KernelService({ baseUrl: url, token });

      try {
        setConnectionError("");
        const validation = newService.validateConfiguration();
        if (!validation.isValid) {
          const errorMessage = [
            "Configuration issues found:",
            ...validation.issues,
            "",
            "Suggestions:",
            ...validation.suggestions,
          ].join("\n");
          setConnectionError(errorMessage);
          return;
        }

        setKernelStatus("connecting");

        const isConnected = await newService.testConnection();
        if (!isConnected) {
          const errorMessage = [
            "Failed to connect to Jupyter server.",
            "",
            "Please check:",
            "• Server is running and accessible",
            "• URL and token are correct",
            "• Server allows CORS requests",
            "",
            "Try starting Jupyter with:",
            "jupyter lab --allow-origin='*' --ip=0.0.0.0",
          ].join("\n");
          setConnectionError(errorMessage);
          setKernelStatus("disconnected");
          return;
        }

        const fetchedKernels =
          (await newService.getAvailableKernels()) as KernelInfo[];
        setAvailableKernels(
          fetchedKernels.length > 0
            ? fetchedKernels
            : [
              {
                name: "python3",
                displayName: "Python 3",
                language: "python",
              },
            ],
        );

        if (fetchedKernels.length > 0) {
          const notebookPath = isNotebookFile(currentFile)
            ? currentFile.path
            : undefined;
          await newService.startKernel(fetchedKernels[0].name, notebookPath);
          shouldKeepService = true;
          replaceKernelService(newService);
          setCurrentKernel(fetchedKernels[0]);
          setKernelStatus("connected");
          executionCountRef.current = 0;

          // Save the successful connection to storage
          const settings = newService.getServerSettings();
          saveKernelConnection(settings.baseUrl, settings.token || undefined);
          setShowConnectionDialog(false);
        } else {
          // No kernels found, but connection is live. User can try again or select.
          setCurrentKernel(null);
          setKernelStatus("disconnected"); // Or a new status like 'connected_no_kernel'
          setConnectionError("Connected to server, but no kernels found.");
        }
      } catch (error) {
        console.error("Error connecting to kernel via URL:", error);
        let errorMessage = "Failed to connect to Jupyter server.";
        if (error instanceof Error) {
          if (error.message.includes("Cannot connect to Jupyter server"))
            errorMessage = error.message;
          else if (error.message.includes("Failed to fetch"))
            errorMessage = [
              "Network error: Cannot reach Jupyter server.",
              "",
              "Please check:",
              "• Server is running and accessible",
              "• URL is correct and reachable",
              "• No firewall blocking the connection",
              "• Server allows CORS requests",
            ].join("\n");
          else errorMessage = `Connection failed: ${error.message}`;
        }
        setConnectionError(errorMessage);
        setKernelStatus("disconnected");
        setCurrentKernel(null);
      } finally {
        if (!shouldKeepService) {
          newService.dispose();
        }
      }
    },
    [currentFile, replaceKernelService],
  );

  const getStatusIcon = () => {
    if (isAutoConnecting) {
      return (
        <Circle
          style={{ height: "8px", width: "8px" }}
          className="fill-purple-500 text-purple-500 animate-pulse"
        />
      );
    }

    switch (kernelStatus) {
      case "connected":
        return (
          <Circle
            style={{ height: "8px", width: "8px" }}
            className="fill-green-500 text-green-500"
          />
        );
      case "connecting":
        return (
          <Circle
            style={{ height: "8px", width: "8px" }}
            className="fill-yellow-500 text-yellow-500 animate-pulse"
          />
        );
      case "busy":
        return (
          <Circle
            style={{ height: "8px", width: "8px" }}
            className="fill-blue-500 text-blue-500 animate-pulse"
          />
        );
      case "disconnected":
      default:
        return (
          <Circle
            style={{ height: "8px", width: "8px" }}
            className="fill-red-500 text-red-500"
          />
        );
    }
  };

  const getKernelDisplayName = () => {
    if (isAutoConnecting) return "Connecting...";
    if (!currentKernel) return "No Kernel";
    return currentKernel.displayName || currentKernel.name;
  };

  const hasServerConnection =
    isAutoConnecting ||
    kernelStatus === "connected" ||
    kernelStatus === "busy" ||
    kernelStatus === "connecting" ||
    Boolean(currentKernel);

  /** A Jupyter workspace folder is selected in the Files panel (including server root ""). */
  const hasWorkspaceOpen =
    workspaceDirectory !== null && workspaceDirectory !== undefined;

  /** True when a workspace is selected and the active editor path is not under that folder (server root `""` counts as containing all paths). */
  const currentFileOutsideWorkspace =
    workspaceDirectory != null &&
    Boolean(currentFile.path) &&
    !isJupyterPathWithinWorkspace(currentFile.path, workspaceDirectory);

  const persistPanelVisibilityState = React.useCallback(
    (next: Partial<PanelVisibilityState>) => {
      if (!hasLoadedPanelVisibilityState) return;
      savePanelVisibilityState({
        leftCollapsed: leftSidebarCollapsed,
        rightCollapsed: rightSidebarCollapsed,
        bottomCollapsed: bottomSidebarCollapsed,
        isFocusMode,
        ...next,
      });
    },
    [
      bottomSidebarCollapsed,
      hasLoadedPanelVisibilityState,
      isFocusMode,
      leftSidebarCollapsed,
      rightSidebarCollapsed,
    ],
  );

  const handleTogglePresentationHideAllCellInputs = React.useCallback(() => {
    void setUserSettings((current) => ({
      ...current,
      notebook: {
        ...current.notebook,
        presentationHideAllCellInputs:
          !current.notebook.presentationHideAllCellInputs,
      },
    }));
  }, [setUserSettings]);

  const handleHorizontalLayout = React.useCallback(
    (sizes: number[]) => {
      if (sizes.length !== 3) return;
      const next = [sizes[0], sizes[1], sizes[2]] as [number, number, number];
      setHorizontalPanelSizes(next);
      panelLayoutRef.current = {
        ...panelLayoutRef.current,
        horizontal: next,
      };
      if (!persistPanelLayoutRef.current) return;
      savePanelLayoutState(panelLayoutRef.current);
    },
    [],
  );

  const handleVerticalLayout = React.useCallback(
    (sizes: number[]) => {
      if (sizes.length !== 2) return;
      const next = [sizes[0], sizes[1]] as [number, number];
      setVerticalPanelSizes(next);
      panelLayoutRef.current = {
        ...panelLayoutRef.current,
        vertical: next,
      };
      if (!persistPanelLayoutRef.current) return;
      savePanelLayoutState(panelLayoutRef.current);
    },
    [],
  );

  const handleLeftCollapse = React.useCallback(() => {
    setLeftSidebarCollapsed(true);
    persistPanelVisibilityState({ leftCollapsed: true });
  }, [persistPanelVisibilityState]);

  const handleLeftExpand = React.useCallback(() => {
    setLeftSidebarCollapsed(false);
    persistPanelVisibilityState({ leftCollapsed: false });
  }, [persistPanelVisibilityState]);

  const handleRightCollapse = React.useCallback(() => {
    setRightSidebarCollapsed(true);
    persistPanelVisibilityState({ rightCollapsed: true });
  }, [persistPanelVisibilityState]);

  const handleRightExpand = React.useCallback(() => {
    setRightSidebarCollapsed(false);
    persistPanelVisibilityState({ rightCollapsed: false });
  }, [persistPanelVisibilityState]);

  const handleBottomCollapse = React.useCallback(() => {
    setBottomSidebarCollapsed(true);
    persistPanelVisibilityState({ bottomCollapsed: true });
  }, [persistPanelVisibilityState]);

  const handleBottomExpand = React.useCallback(() => {
    setBottomSidebarCollapsed(false);
    persistPanelVisibilityState({ bottomCollapsed: false });
  }, [persistPanelVisibilityState]);

  // Add toggle functions
  const toggleLeftSidebar = React.useCallback(() => {
    if (leftPanelRef.current) {
      if (leftSidebarCollapsed) {
        leftPanelRef.current.expand();
      } else {
        leftPanelRef.current.collapse();
      }
    }
  }, [leftSidebarCollapsed]);

  const toggleRightSidebar = React.useCallback(() => {
    if (rightPanelRef.current) {
      if (rightSidebarCollapsed) {
        rightPanelRef.current.expand();
      } else {
        rightPanelRef.current.collapse();
      }
    }
  }, [rightSidebarCollapsed]);

  const toggleBottomSidebar = React.useCallback(() => {
    if (bottomPanelRef.current) {
      if (bottomSidebarCollapsed) {
        bottomPanelRef.current.expand();
      } else {
        bottomPanelRef.current.collapse();
      }
    }
  }, [bottomSidebarCollapsed]);

  /** If both are collapsed, expands both; otherwise collapses both. */
  const toggleBothSidebars = React.useCallback(() => {
    const bothCollapsed = leftSidebarCollapsed && rightSidebarCollapsed;
    if (leftPanelRef.current) {
      if (bothCollapsed) {
        leftPanelRef.current.expand();
      } else {
        leftPanelRef.current.collapse();
      }
    }
    if (rightPanelRef.current) {
      if (bothCollapsed) {
        rightPanelRef.current.expand();
      } else {
        rightPanelRef.current.collapse();
      }
    }
  }, [leftSidebarCollapsed, rightSidebarCollapsed]);

  /** Keep sidebar visible when focus remains inside after enabling Focus mode. */
  useEffect(() => {
    if (!isFocusMode) {
      setFocusLeftHovered(false);
      setFocusLeftFocused(false);
      setFocusRightHovered(false);
      setFocusRightFocused(false);
      return;
    }

    const active = document.activeElement;
    setFocusLeftFocused(
      leftSidebarRevealRef.current?.contains(active) ?? false,
    );
    setFocusRightFocused(
      rightSidebarRevealRef.current?.contains(active) ?? false,
    );
  }, [isFocusMode]);

  /**
   * Hides sidebar chrome until each panel is hovered or focused; layout and sizing stay the same.
   */
  const toggleFocusMode = React.useCallback(() => {
    setIsFocusMode((current) => !current);
  }, []);

  const handleSidebarRevealBlur = React.useCallback(
    (setFocused: React.Dispatch<React.SetStateAction<boolean>>) =>
      (event: React.FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget;
        if (next == null || !event.currentTarget.contains(next)) {
          setFocused(false);
        }
      },
    [],
  );

  // Add keyboard shortcuts for toggling sidebars and saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === "KeyZ"
      ) {
        e.preventDefault();
        toggleFocusMode();
      } else if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === "Digit1"
      ) {
        e.preventDefault();
        toggleLeftSidebar();
      } else if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === "Digit2"
      ) {
        e.preventDefault();
        toggleRightSidebar();
      } else if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === "KeyX"
      ) {
        e.preventDefault();
        toggleBothSidebars();
      } else if (
        !e.altKey &&
        !e.shiftKey &&
        ((((e.metaKey && !e.ctrlKey) || (!e.metaKey && e.ctrlKey)) &&
          e.key.toLowerCase() === "j") ||
          (e.ctrlKey && !e.metaKey && e.code === "Backquote"))
      ) {
        e.preventDefault();
        toggleBottomSidebar();
      } else if (
        ((e.metaKey && !e.ctrlKey) || (!e.metaKey && e.ctrlKey)) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    toggleFocusMode,
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleBothSidebars,
    toggleBottomSidebar,
    handleSave,
  ]);

  if (isMobile) {
    return (
      <OpenSettingsProvider>
        <NotebookViewModeProvider>
          <MobileLayoutProvider>
            <MobileLayout
              currentFile={currentFile}
              recentFiles={recentFiles}
              onFileSelect={handleFileSelect}
              onNavigateToLine={handleNavigateToLine}
              notebookMinimap={notebookMinimap}
              onMinimapNavigate={handleMinimapNavigate}
              runningKernels={runningKernels}
              onSessionSelect={handleSessionSelect}
              onSessionShutdown={handleSessionShutdown}
              onShutdownAllKernels={handleShutdownAllKernels}
              onRefreshKernels={handleRefreshKernels}
              kernelService={kernelService}
              workspaceDirectory={workspaceDirectory}
              onWorkspaceChange={setWorkspaceDirectory}
              onOpenKernelDropdown={
                !currentKernel
                  ? openConnectionDialog
                  : () => setIsKernelDropdownOpen(true)
              }
              currentKernel={currentKernel}
              kernelStatus={kernelStatus}
              notebook={notebook}
              hasWorkspaceOpen={hasWorkspaceOpen}
              hasServerConnection={hasServerConnection}
              openConnectionDialog={openConnectionDialog}
              isRunning={isRunning}
              executionCountRef={executionCountRef}
              onKernelStatusChange={setKernelStatus}
              onCurrentKernelChange={setCurrentKernel}
              onIsRunningChange={setIsRunning}
              onNotebookChange={setNotebook}
              onUnsavedChangesChange={setHasUnsavedChanges}
              notebookPresentationHideAllInputs={
                effectiveSettings.notebook.presentationHideAllCellInputs
              }
              onFileLoadError={handleEditorFileLoadError}
              onWorkspacePathRenamed={handleWorkspacePathRenamed}
              onWorkspacePathDeleted={handleWorkspacePathDeleted}
            />

            <KernelConnectionDialog
              open={showConnectionDialog}
              onOpenChange={setShowConnectionDialog}
              onConnect={handleConnectToKernelUrlDialog}
              error={connectionError}
            />

            <EditorReloadDialog
              open={unsavedDialogIntent !== null}
              filename={currentFile.name || undefined}
              onSave={handleUnsavedDialogSave}
              onDiscard={handleUnsavedDialogDiscard}
              onCancel={() => setUnsavedDialogIntent(null)}
            />
          </MobileLayoutProvider>
        </NotebookViewModeProvider>
      </OpenSettingsProvider>
    );
  }

  return (
    <OpenSettingsProvider>
      <NotebookViewModeProvider>
        <div className="h-screen">
          {hasLoadedPanelVisibilityState ? (
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full"
            onLayout={handleHorizontalLayout}
          >
            {/* Left Sidebar Panel */}
            <ResizablePanel
              ref={leftPanelRef}
              defaultSize={horizontalPanelSizes[0]}
              minSize={10}
              maxSize={40}
              collapsible={true}
              onCollapse={handleLeftCollapse}
              onExpand={handleLeftExpand}
            >
              <div
                ref={leftSidebarRevealRef}
                className="relative h-full overflow-hidden bg-sidebar"
                onPointerEnter={() => setFocusLeftHovered(true)}
                onPointerLeave={() => setFocusLeftHovered(false)}
                onFocus={() => setFocusLeftFocused(true)}
                onBlur={handleSidebarRevealBlur(setFocusLeftFocused)}
              >
                <div
                  className={cn(
                    "relative h-full transition-opacity duration-300",
                    isLeftSidebarContentHidden && "pointer-events-none opacity-0",
                  )}
                  aria-hidden={isLeftSidebarContentHidden}
                >
                  <LeftSidebar
                    currentFile={currentFile}
                    onFileSelect={handleFileSelect}
                    onNavigateToLine={handleNavigateToLine}
                    notebookMinimap={notebookMinimap}
                    onMinimapNavigate={handleMinimapNavigate}
                    kernelSessions={runningKernels}
                    onSessionSelect={handleSessionSelect}
                    onSessionShutdown={handleSessionShutdown}
                    onShutdownAllKernels={handleShutdownAllKernels}
                    onRefreshKernels={handleRefreshKernels}
                    kernelService={kernelService}
                    workspaceDirectory={workspaceDirectory}
                    onWorkspaceChange={setWorkspaceDirectory}
                    onWorkspacePathRenamed={handleWorkspacePathRenamed}
                    onWorkspacePathDeleted={handleWorkspacePathDeleted}
                    onOpenKernelDropdown={
                      !currentKernel
                        ? openConnectionDialog
                        : () => setIsKernelDropdownOpen(true)
                    }
                    onToggleTerminalPanel={toggleBottomSidebar}
                    isTerminalPanelOpen={!bottomSidebarCollapsed}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className="bg-transparent border-none w-0 transition-all" />

            {/* Main Content Panel */}
            <ResizablePanel defaultSize={horizontalPanelSizes[1]} minSize={30}>
              <ResizablePanelGroup
                direction="vertical"
                onLayout={handleVerticalLayout}
              >
                {/* Top Panel - Toolbar and Editor */}
                <ResizablePanel defaultSize={verticalPanelSizes[0]} minSize={30}>
                  <div className="flex flex-col h-full">
                    {/* Unified Toolbar */}
                    <div
                      className={`bg-sidebar ${leftSidebarCollapsed && rightSidebarCollapsed
                        ? "pt-0"
                        : "pt-2"
                        }`}
                    >
                      <div
                        className="corner-squircle sticky top-0 z-10 mx-1 flex h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 shadow-md"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <ToolbarButton
                            onClick={toggleLeftSidebar}
                            toolTipLabel={
                              leftSidebarCollapsed
                                ? "Show Sidebar"
                                : "Hide Sidebar"
                            }
                            toolTipShortcut={[[AltOrOption, "1"]]}
                          >
                            <PanelLeft className="h-4 w-4" />
                          </ToolbarButton>
                          <Separator
                            orientation="vertical"
                            className="bg-toolbar-separator-foreground h-6"
                          />
                          {/* Recent Files Combobox — shown when a file is open or when there are recents (empty editor) */}
                          {(currentFile.name || recentFiles.length > 0) && (
                            <Popover
                              open={open}
                              onOpenChange={(next) => {
                                setOpen(next);
                                if (!next) setIsFileIconHovered(false);
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  role="combobox"
                                  aria-expanded={open}
                                  aria-label={
                                    currentFile.name
                                      ? `Current file: ${currentFile.name}. Open recent files`
                                      : "Open recent files"
                                  }
                                  className={cn(
                                    "h-8 max-w-[min(100%,15rem)] min-w-0 shrink px-2 justify-between font-normal",
                                    currentFileOutsideWorkspace &&
                                    "border bg-amber-50 dark:bg-amber-950/35 border-amber-200/90 dark:border-amber-800/80 hover:bg-amber-100/90 dark:hover:bg-amber-900/45",
                                  )}
                                  disabled={
                                    !currentFile.name && recentFiles.length === 0
                                  }
                                  onMouseEnter={() => setIsFileIconHovered(true)}
                                  onMouseLeave={() => setIsFileIconHovered(false)}
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                    {currentFile.name ? (
                                      <>
                                        <TooltipProvider delayDuration={300}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                type="button"
                                                className="corner-squircle flex items-center justify-center w-5 h-5 shrink-0 rounded cursor-pointer hover:bg-muted transition-colors text-red-500/50 hover:text-red-500"
                                                onClick={handleCloseFile}
                                                aria-label="Close file"
                                              >
                                                {open || isFileIconHovered ? (
                                                  <X className="h-4 w-4" />
                                                ) : (
                                                  <FileIcon
                                                    filename={
                                                      currentFile.name || ""
                                                    }
                                                  />
                                                )}
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Close file</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                        <span
                                          className="min-w-0 flex-1 truncate text-left"
                                          title={currentFile.name}
                                        >
                                          {currentFile.name}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                                          Recent files
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-1">
                                <Command>
                                  {currentFileOutsideWorkspace && (
                                    <div
                                      className="corner-squircle mx-1 mb-1 flex gap-2 rounded-md border border-amber-300/90 bg-amber-100/90 px-2 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-900/45 dark:text-amber-50"
                                      role="status"
                                    >
                                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                                      <p className="leading-snug">
                                        This file is not inside the workspace
                                        folder open in the Files sidebar.
                                      </p>
                                    </div>
                                  )}
                                  <CommandInput placeholder="Search recent files..." />
                                  <CommandEmpty>
                                    No recent files found.
                                  </CommandEmpty>
                                  <CommandList>
                                    <CommandGroup heading="Recent Files">
                                      {recentFiles.map((file, index) => (
                                        <CommandItem
                                          key={`${file.path}-${index}`}
                                          value={file.path}
                                          onSelect={() => {
                                            handleFileSelect(file);
                                            setOpen(false);
                                          }}
                                          className="flex items-center gap-2"
                                        >
                                          <FileIcon filename={file.name} />
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="truncate font-medium">
                                              {file.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground truncate">
                                              {file.path}
                                            </span>
                                          </div>
                                          {currentFile.path === file.path && (
                                            <Check className="h-4 w-4 text-green-500" />
                                          )}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                          {/* Save File Button */}
                          {currentFile.path && kernelService && (
                            <>
                              <ToolbarButton
                                onClick={handleSave}
                                toolTipLabel="Save File"
                              >
                                <div className="relative w-4 h-4">
                                  <Save
                                    className={cn(
                                      "h-4 w-4 absolute transition-all duration-300",
                                      isSaved
                                        ? "opacity-0 scale-0 rotate-45"
                                        : "opacity-100 scale-100 rotate-0",
                                    )}
                                  />
                                  <Check
                                    className={cn(
                                      "h-4 w-4 absolute text-green-500 transition-all duration-300",
                                      isSaved
                                        ? "opacity-100 scale-100 rotate-0"
                                        : "opacity-0 scale-0 rotate-45",
                                    )}
                                  />
                                </div>
                              </ToolbarButton>
                            </>
                          )}
                          {/* Notebook action buttons */}
                          {currentFile.name.endsWith(".ipynb") &&
                            !currentFile.openAsText && (
                              <>
                                {/* Run All Cells — split button (single chrome; inner segments square — avoids doubled borders + corner-squircle on Button). */}
                                <TooltipProvider delayDuration={300}>
                                  <div
                                    role="group"
                                    aria-label="Run all cells"
                                    className="inline-flex h-8 overflow-hidden rounded-md border border-border/50 bg-background shadow-sm"
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-7 shrink-0 !rounded-none border-0 border-e border-border/50 bg-background px-0 shadow-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:z-10"
                                          onClick={() => handleRunAll(true)}
                                          disabled={
                                            !currentKernel ||
                                            kernelStatus !== "connected" ||
                                            isRunning
                                          }
                                        >
                                          <Play className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Run All Cells</p>
                                      </TooltipContent>
                                    </Tooltip>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-4 shrink-0 !rounded-none border-0 bg-background px-0 shadow-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:z-10"
                                          disabled={
                                            !currentKernel ||
                                            kernelStatus !== "connected" ||
                                            isRunning
                                          }
                                        >
                                          <ChevronDown className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="start"
                                        className="w-56"
                                      >
                                        <DropdownMenuItem
                                          onClick={() => handleRunAll(true)}
                                        >
                                          <Play className="h-4 w-4 mr-2" />
                                          Run All Cells
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleRunAll(false)}
                                        >
                                          <Play className="h-4 w-4 mr-2 text-yellow-500" />
                                          Run All Cells (Ignore Errors)
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </TooltipProvider>
                                <ToolbarButton
                                  onClick={handleStopKernel}
                                  disabled={
                                    !currentKernel ||
                                    kernelStatus === "disconnected" ||
                                    kernelStatus === "connecting"
                                  }
                                  toolTipLabel="Interrupt Kernel"
                                >
                                  <Square className="h-4 w-4" />
                                </ToolbarButton>
                                <ToolbarButton
                                  onClick={handleRestartKernel}
                                  disabled={
                                    !currentKernel ||
                                    kernelStatus === "disconnected" ||
                                    kernelStatus === "connecting"
                                  }
                                  toolTipLabel="Restart Kernel"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </ToolbarButton>
                                <ToolbarButton
                                  onClick={handleRestartAndRunAll}
                                  disabled={
                                    !currentKernel ||
                                    kernelStatus === "disconnected" ||
                                    kernelStatus === "connecting" ||
                                    isRunning
                                  }
                                  toolTipLabel="Restart Kernel and Run All Cells"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </ToolbarButton>
                                <ToolbarButton
                                  onClick={
                                    handleTogglePresentationHideAllCellInputs
                                  }
                                  aria-pressed={
                                    effectiveSettings.notebook
                                      .presentationHideAllCellInputs
                                  }
                                  className="bg-transparent hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
                                  toolTipLabel={
                                    effectiveSettings.notebook
                                      .presentationHideAllCellInputs
                                      ? "Show cell inputs"
                                      : "Hide cell inputs"
                                  }
                                >
                                  {effectiveSettings.notebook
                                    .presentationHideAllCellInputs ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </ToolbarButton>
                                <NotebookViewToggle />
                              </>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Jupyter Server Connection */}
                          {currentKernel ? (
                            <DropdownMenu
                              open={isKernelDropdownOpen}
                              modal={false}
                              onOpenChange={setIsKernelDropdownOpen}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 px-2 text-sm font-normal"
                                  title={
                                    currentKernel.displayName ||
                                    currentKernel.name
                                  }
                                >
                                  {getStatusIcon()}
                                  <KernelIcon
                                    language={currentKernel.language}
                                    name={currentKernel.name}
                                    size={16}
                                  />
                                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                  {currentKernel.displayName ||
                                    currentKernel.name}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleKernelSelect("change")}
                                >
                                  <span>Change Jupyter Server</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={handleDisconnect}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <span>Disconnect</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5 text-sm font-normal"
                              onClick={openConnectionDialog}
                            >
                              {getStatusIcon()}
                              <span className="max-w-[120px] truncate">
                                {getKernelDisplayName()}
                              </span>
                            </Button>
                          )}
                          <Separator
                            orientation="vertical"
                            className="h-6 bg-toolbar-separator-foreground"
                          />
                          <ToolbarButton
                            onClick={toggleFocusMode}
                            aria-pressed={isFocusMode}
                            className={cn(
                              isFocusMode &&
                              "bg-accent text-foreground hover:bg-accent",
                            )}
                            toolTipLabel={
                              isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"
                            }
                            toolTipShortcut={[[AltOrOption, "Z"]]}
                          >
                            <Scan className="h-4 w-4" />
                          </ToolbarButton>
                          <ToolbarButton
                            onClick={toggleRightSidebar}
                            toolTipLabel={
                              rightSidebarCollapsed ? "Show Chat" : "Hide Chat"
                            }
                            toolTipShortcut={[[AltOrOption, "2"]]}
                          >
                            <MessagesSquare className="h-4 w-4" />
                          </ToolbarButton>
                          <SettingsMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col min-h-0 overflow-hidden no-overscroll-x no-overscroll-y">
                      <Editor
                        filepath={currentFile.path}
                        openNotebookAsText={currentFile.openAsText === true}
                        hasWorkspace={hasWorkspaceOpen}
                        hasServerConnection={hasServerConnection}
                        onConnectServer={openConnectionDialog}
                        // Pass kernel related props
                        kernelService={kernelService}
                        currentKernel={currentKernel}
                        kernelStatus={kernelStatus}
                        isRunning={isRunning}
                        executionCountRef={executionCountRef}
                        onKernelStatusChange={setKernelStatus}
                        onCurrentKernelChange={setCurrentKernel}
                        onIsRunningChange={setIsRunning}
                        onNotebookChange={setNotebook}
                        onUnsavedChangesChange={setHasUnsavedChanges}
                        presentationHideAllCellInputs={
                          effectiveSettings.notebook.presentationHideAllCellInputs
                        }
                        onFileLoadError={handleEditorFileLoadError}
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle className="bg-transparent border-none h-0 transition-all data-[panel-group-direction=vertical]:h-0" />

                {/* Bottom Panel - Terminal */}
                <ResizablePanel
                  ref={bottomPanelRef}
                  defaultSize={verticalPanelSizes[1]}
                  minSize={20}
                  collapsible={true}
                  onCollapse={handleBottomCollapse}
                  onExpand={handleBottomExpand}
                >
                  <TerminalPanel
                    kernelService={kernelService}
                    onOpenKernelDropdown={
                      !currentKernel
                        ? openConnectionDialog
                        : () => setIsKernelDropdownOpen(true)
                    }
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle className="bg-transparent border-none w-0 transition-all" />

            {/* Right Sidebar Panel */}
            <ResizablePanel
              ref={rightPanelRef}
              className="min-w-0 overflow-hidden"
              defaultSize={horizontalPanelSizes[2]}
              minSize={10}
              maxSize={40}
              collapsible={true}
              onCollapse={handleRightCollapse}
              onExpand={handleRightExpand}
            >
              <AssistantProvider
                kernelService={kernelService}
                notebook={notebook}
                workspaceDirectory={workspaceDirectory ?? undefined}
                onAgentNotebookChange={() => {
                  window.dispatchEvent(new CustomEvent("agentNotebookModified"));
                }}
              >
                <div
                  ref={rightSidebarRevealRef}
                  className="relative h-full overflow-hidden bg-sidebar"
                  onPointerEnter={() => setFocusRightHovered(true)}
                  onPointerLeave={() => setFocusRightHovered(false)}
                  onFocus={() => setFocusRightFocused(true)}
                  onBlur={handleSidebarRevealBlur(setFocusRightFocused)}
                >
                  <div
                    className={cn(
                      "relative h-full transition-opacity duration-300",
                      isRightSidebarContentHidden &&
                      "pointer-events-none opacity-0",
                    )}
                    aria-hidden={isRightSidebarContentHidden}
                  >
                    <RightSidebar
                      activeNotebookPath={currentFile.path}
                      activeNotebook={notebook}
                      kernelService={kernelService}
                      kernelStatus={kernelStatus}
                      onOpenKernelDropdown={
                        !currentKernel
                          ? openConnectionDialog
                          : () => setIsKernelDropdownOpen(true)
                      }
                      workspaceDirectory={workspaceDirectory ?? undefined}
                      recentFiles={recentFiles}
                      onOpenFile={handleFileSelect}
                    />
                  </div>
                </div>
              </AssistantProvider>
            </ResizablePanel>
          </ResizablePanelGroup>
          ) : null}

          <KernelConnectionDialog
            open={showConnectionDialog}
            onOpenChange={setShowConnectionDialog}
            onConnect={handleConnectToKernelUrlDialog}
            error={connectionError}
          />

          {/* Unsaved changes (reload, switch file, close) */}
          <EditorReloadDialog
            open={unsavedDialogIntent !== null}
            filename={currentFile.name || undefined}
            onSave={handleUnsavedDialogSave}
            onDiscard={handleUnsavedDialogDiscard}
            onCancel={() => setUnsavedDialogIntent(null)}
          />
        </div>
      </NotebookViewModeProvider>
    </OpenSettingsProvider>
  );
}
