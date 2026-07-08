"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Folder,
  Map as MinimapIcon,
  Search,
  Cpu,
  Boxes,
  Circle,
  Power,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  AlignLeft,
  GalleryVerticalEnd,
  Database,
  KeyRound,
  Terminal,
} from "lucide-react";

import {
  FileTree,
  type FileTreeItem,
  type FileTreeSelection,
} from "./file-tree";
import { WorkspacePicker } from "./workspace-picker";
import { SIDEBAR_ACCORDION_CARD, SIDEBAR_ACCORDION_STICKY_HEADER } from "./accordion-styles";
import { StickyAccordionHeaderWithToolbar } from "./sticky-accordion-header-with-toolbar";
import { VariablesAccordionItem } from "./variables-panel";
import {
  WorkspaceSearch,
  type WorkspaceSearchHandle,
} from "./workspace-search";
import { ConfirmPopover } from "@/components/common/confirm-popover";
import { NoKernelPrompt } from "@/components/common/no-kernel-prompt";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useJupyterShellReady } from "@/hooks/use-jupyter-shell-ready";
import { useIsDesktopApp, usePlatformOs } from "@/hooks/use-platform";
import { Separator } from "@/components/ui/separator";
import type { NotebookMinimapSection } from "@/components/notebook/notebook-minimap";
import {
  NotebookMinimapPanel,
  type NotebookMinimapPreviewMode,
} from "@/components/notebook/notebook-minimap-panel";
import type {
  KernelService,
  RunningKernelSidebarInfo,
} from "@/lib/kernel/kernel-service";
import type { ContentsManager } from "@jupyterlab/services";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CmdOrCtrl } from "../common/keyboard-icons";
import {
  cn,
  scheduleAfterMinDuration,
  MIN_REFRESH_SPIN_MS,
} from "@/lib/utils";
import { openFile } from "@/lib/shell/system-commands/open-file";
import {
  getWorkspaceFilesChangedDetail,
  WORKSPACE_FILES_CHANGED_EVENT,
} from "@/lib/workspace/workspace-events";

/**
 * Accordion header actions: do not pass `size="sm"` on ToolbarButton — it
 * overrides the default `size="icon"` and applies `h-9` + horizontal padding.
 * Base `Button` also sets `[&_svg]:size-4`, so we shrink icons via the parent.
 */
const SIDEBAR_ACCORDION_TOOLBAR_BTN =
  "text-muted-foreground hover:text-foreground hover:bg-transparent h-5 w-5 px-0 p-0 min-w-0 shrink-0 [&_svg]:size-3.5";

/**
 * Wraps AccordionTrigger in a sticky div so the section header pins to the top
 * of the sidebar scroll container while the user scrolls through its content.
 * (AccordionTrigger's className goes to the inner <button>, not the <h3> it
 * renders in, so sticky must live on an outer element instead.)
 */
function StickyAccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionTrigger>) {
  return (
    <div className={SIDEBAR_ACCORDION_STICKY_HEADER}>
      <AccordionTrigger className={className} {...props}>
        {children}
      </AccordionTrigger>
    </div>
  );
}

type SidebarViewType =
  | "files"
  | "search"
  | "toc"
  | "cpu"
  | "vars"
  | "dataSources"
  | "secrets";

interface SidebarViewInfo {
  id: SidebarViewType;
  title: string;
  icon: React.ReactNode;
}

/** Fixed order of view toggle buttons in the sidebar tab bar. */
const SIDEBAR_TAB_VIEWS: SidebarViewInfo[] = [
  { id: "files", title: "Files", icon: <Folder /> },
  { id: "search", title: "Search", icon: <Search /> },
  { id: "toc", title: "Minimap", icon: <MinimapIcon /> },
  { id: "vars", title: "Variables", icon: <Boxes /> },
  { id: "cpu", title: "Kernels", icon: <Cpu /> },
  // { id: "dataSources", title: "Data sources", icon: <Database /> },
  // { id: "secrets", title: "Secrets", icon: <KeyRound /> },
];

const LEFT_SIDEBAR_SESSION_KEY = "orion.leftSidebar";
const DEFAULT_ACTIVE_SIDEBAR_VIEWS: SidebarViewType[] = ["files"];
const DEFAULT_OPEN_ACCORDION_ITEMS: SidebarViewType[] = ["files", "toc"];
const SIDEBAR_VIEW_IDS = new Set<SidebarViewType>(
  SIDEBAR_TAB_VIEWS.map((view) => view.id)
);

interface LeftSidebarSessionState {
  activeViews: SidebarViewType[];
  openAccordionItems: SidebarViewType[];
  showHiddenFiles: boolean;
  showMinimapOutputs: boolean;
  minimapPreviewMode: NotebookMinimapPreviewMode;
  isSearchCaseSensitive: boolean;
}

const DEFAULT_LEFT_SIDEBAR_SESSION_STATE: LeftSidebarSessionState = {
  activeViews: DEFAULT_ACTIVE_SIDEBAR_VIEWS,
  openAccordionItems: DEFAULT_OPEN_ACCORDION_ITEMS,
  showHiddenFiles: true,
  showMinimapOutputs: true,
  minimapPreviewMode: "compact",
  isSearchCaseSensitive: false,
};

/**
 * Returns true when a stored string is one of the supported sidebar tabs.
 */
function isSidebarViewType(value: unknown): value is SidebarViewType {
  return typeof value === "string" && SIDEBAR_VIEW_IDS.has(value as SidebarViewType);
}

/**
 * Sanitizes stored sidebar tab arrays and falls back when nothing valid remains.
 */
function parseSidebarViewList(
  value: unknown,
  fallback: SidebarViewType[],
  allowEmpty = false
): SidebarViewType[] {
  if (!Array.isArray(value)) return fallback;
  const views = value.filter(isSidebarViewType);
  if (allowEmpty && views.length === 0) return [];
  return views.length > 0 ? views : fallback;
}

/**
 * Reads left-sidebar-only UI preferences from the current browser tab.
 */
function loadLeftSidebarSessionState(): LeftSidebarSessionState {
  if (typeof window === "undefined") {
    return DEFAULT_LEFT_SIDEBAR_SESSION_STATE;
  }

  try {
    const raw = window.sessionStorage.getItem(LEFT_SIDEBAR_SESSION_KEY);
    if (!raw) return DEFAULT_LEFT_SIDEBAR_SESSION_STATE;
    const parsed = JSON.parse(raw) as Partial<LeftSidebarSessionState>;
    return {
      activeViews: parseSidebarViewList(
        parsed.activeViews,
        DEFAULT_LEFT_SIDEBAR_SESSION_STATE.activeViews
      ),
      openAccordionItems: parseSidebarViewList(
        parsed.openAccordionItems,
        DEFAULT_LEFT_SIDEBAR_SESSION_STATE.openAccordionItems,
        true
      ),
      showHiddenFiles:
        typeof parsed.showHiddenFiles === "boolean"
          ? parsed.showHiddenFiles
          : DEFAULT_LEFT_SIDEBAR_SESSION_STATE.showHiddenFiles,
      showMinimapOutputs:
        typeof parsed.showMinimapOutputs === "boolean"
          ? parsed.showMinimapOutputs
          : DEFAULT_LEFT_SIDEBAR_SESSION_STATE.showMinimapOutputs,
      minimapPreviewMode:
        parsed.minimapPreviewMode === "miniature" ||
        parsed.minimapPreviewMode === "compact"
          ? parsed.minimapPreviewMode
          : DEFAULT_LEFT_SIDEBAR_SESSION_STATE.minimapPreviewMode,
      isSearchCaseSensitive:
        typeof parsed.isSearchCaseSensitive === "boolean"
          ? parsed.isSearchCaseSensitive
          : DEFAULT_LEFT_SIDEBAR_SESSION_STATE.isSearchCaseSensitive,
    };
  } catch {
    return DEFAULT_LEFT_SIDEBAR_SESSION_STATE;
  }
}

/**
 * Stores left-sidebar-only UI preferences for the current browser tab.
 */
function saveLeftSidebarSessionState(state: LeftSidebarSessionState): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      LEFT_SIDEBAR_SESSION_KEY,
      JSON.stringify(state)
    );
  } catch {
    // Session UI state can fall back to defaults if storage is unavailable.
  }
}

/**
 * Fetches the immediate children of a directory from the Jupyter ContentsManager.
 * Non-recursive — each folder child is returned with `childrenLoaded: false`
 * so the tree can lazy-load deeper levels on demand.
 */
async function fetchDirectoryChildren(
  contentsManager: ContentsManager,
  path: string
): Promise<FileTreeItem[]> {
  const model = await contentsManager.get(path, { content: true });
  const entries: Array<{ name: string; path: string; type: string }> =
    (model.content as any[]) ?? [];

  return entries
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: (entry.type === "directory" ? "folder" : "file") as "folder" | "file",
      childrenLoaded: entry.type === "directory" ? false : undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Recursively updates the children of the node at `targetPath` in the tree,
 * returning a new tree array with the updated node.
 */
function updateChildrenAtPath(
  items: FileTreeItem[],
  targetPath: string,
  newChildren: FileTreeItem[]
): FileTreeItem[] {
  return items.map((item) => {
    if (item.path === targetPath) {
      return { ...item, children: newChildren, childrenLoaded: true };
    }
    if (item.children) {
      return {
        ...item,
        children: updateChildrenAtPath(item.children, targetPath, newChildren),
      };
    }
    return item;
  });
}

export function LeftSidebar({
  currentFile,
  onFileSelect,
  onNavigateToLine,
  notebookMinimap = [],
  onMinimapNavigate,
  kernelSessions = [],
  onSessionSelect,
  onSessionShutdown,
  onShutdownAllKernels,
  onRefreshKernels,
  kernelService,
  workspaceDirectory,
  onWorkspaceChange,
  onWorkspacePathRenamed,
  onWorkspacePathDeleted,
  onOpenKernelDropdown,
  onToggleTerminalPanel,
  isTerminalPanelOpen = false,
  mobileFilesOnly = false,
  className,
  ...props
}: {
  currentFile?: FileTreeSelection;
  onFileSelect?: (file: FileTreeSelection) => void;
  /** Called when the user clicks a content search match to open a file and scroll to a line. */
  onNavigateToLine?: (
    file: { name: string; path: string },
    line: number
  ) => void;
  notebookMinimap?: NotebookMinimapSection[];
  onMinimapNavigate?: (cellIndex: number, outputIndex?: number) => void;
  kernelSessions?: RunningKernelSidebarInfo[];
  onSessionSelect?: (session: RunningKernelSidebarInfo) => void;
  onSessionShutdown?: (session: RunningKernelSidebarInfo) => void;
  onShutdownAllKernels?: () => void | Promise<void>;
  onRefreshKernels?: () => void | Promise<void>;
  /** KernelService instance — used to populate the file tree via ContentsManager. */
  kernelService?: KernelService | null;
  /**
   * The currently selected workspace folder path (Jupyter-relative).
   * `null` means no workspace is selected (show picker).
   * `""` means the server root is selected.
   */
  workspaceDirectory?: string | null;
  /** Called when the user selects or clears a workspace folder. */
  onWorkspaceChange?: (dir: string | null) => void;
  /** After a file or folder rename in the tree — sync open file and recents. */
  onWorkspacePathRenamed?: (payload: {
    oldPath: string;
    newPath: string;
    newName: string;
    itemType: "file" | "folder";
  }) => void;
  /** After delete in the tree — close editor if the open path was removed. */
  onWorkspacePathDeleted?: (payload: {
    path: string;
    itemType: "file" | "folder";
  }) => void;
  /** Opens the kernel / Jupyter connection flow (same as the terminal panel). */
  onOpenKernelDropdown?: () => void;
  /** Toggles the bottom terminal panel (desktop) or terminal full-screen view (mobile). */
  onToggleTerminalPanel?: () => void;
  /** When true, the terminal control is shown as active (panel open / mobile terminal view). */
  isTerminalPanelOpen?: boolean;
  /** When true, only the workspace file tree is shown (mobile full-screen files). Hides the sidebar tab bar and Ctrl/Cmd+K → Search. */
  mobileFilesOnly?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { effectiveSettings } = useOrionSettings();
  const fileTreeFontSize = effectiveSettings.fileTree.fontSize;
  const workspaceSearchRef = useRef<WorkspaceSearchHandle>(null);
  const [fileTreeData, setFileTreeData] = useState<FileTreeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeViews, setActiveViews] = useState<SidebarViewType[]>(
    DEFAULT_LEFT_SIDEBAR_SESSION_STATE.activeViews
  );

  const [openAccordionItems, setOpenAccordionItems] = useState<SidebarViewType[]>(
    DEFAULT_LEFT_SIDEBAR_SESSION_STATE.openAccordionItems
  );

  /** Controls whether all notebook minimap sections are expanded or collapsed. */
  const [allMinimapSectionsOpen, setAllMinimapSectionsOpen] = useState(true);
  /** Controls whether notebook cell output previews are visible in the minimap. */
  const [showMinimapOutputs, setShowMinimapOutputs] = useState(
    DEFAULT_LEFT_SIDEBAR_SESSION_STATE.showMinimapOutputs
  );
  /** Controls the minimap cell preview rendering mode. */
  const [minimapPreviewMode, setMinimapPreviewMode] =
    useState<NotebookMinimapPreviewMode>(
      DEFAULT_LEFT_SIDEBAR_SESSION_STATE.minimapPreviewMode
    );
  /** Tracks the currently selected notebook cell index for minimap highlighting. */
  const [selectedMinimapCellIndex, setSelectedMinimapCellIndex] = useState<number | null>(null);

  /** When false, dotfiles (files/folders starting with ".") are hidden from the tree. */
  const [showHiddenFiles, setShowHiddenFiles] = useState(
    DEFAULT_LEFT_SIDEBAR_SESSION_STATE.showHiddenFiles
  );

  /**
   * OS-appropriate label for the "reveal in file manager" context menu action.
   * Derived from browser platform detection.
   */
  const platformOs = usePlatformOs();
  const isDesktopApp = useIsDesktopApp();
  const shouldStackBelowMacWindowControls =
    isDesktopApp && platformOs === "macos";
  const revealLabel =
    platformOs === "macos"
      ? "Reveal in Finder"
      : platformOs === "windows"
        ? "Reveal in Explorer"
        : "Reveal in file manager";

  const [isRefreshingFileTree, setIsRefreshingFileTree] = useState(false);
  const [isRefreshingKernels, setIsRefreshingKernels] = useState(false);
  const [isShuttingDownAllKernels, setIsShuttingDownAllKernels] = useState(false);
  /** True when search uses exact letter casing (off by default). */
  const [isSearchCaseSensitive, setIsSearchCaseSensitive] = useState(
    DEFAULT_LEFT_SIDEBAR_SESSION_STATE.isSearchCaseSensitive
  );
  const [hasLoadedSidebarSessionState, setHasLoadedSidebarSessionState] =
    useState(false);

  useEffect(() => {
    const savedState = loadLeftSidebarSessionState();
    setActiveViews(savedState.activeViews);
    setOpenAccordionItems(savedState.openAccordionItems);
    setShowHiddenFiles(savedState.showHiddenFiles);
    setShowMinimapOutputs(savedState.showMinimapOutputs);
    setMinimapPreviewMode(savedState.minimapPreviewMode);
    setIsSearchCaseSensitive(savedState.isSearchCaseSensitive);
    setHasLoadedSidebarSessionState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedSidebarSessionState) return;
    saveLeftSidebarSessionState({
      activeViews,
      openAccordionItems,
      showHiddenFiles,
      showMinimapOutputs,
      minimapPreviewMode,
      isSearchCaseSensitive,
    });
  }, [
    activeViews,
    hasLoadedSidebarSessionState,
    isSearchCaseSensitive,
    minimapPreviewMode,
    openAccordionItems,
    showHiddenFiles,
    showMinimapOutputs,
  ]);

  /** True when the editor has an `.ipynb` file open (minimap applies). */
  const isNotebookOpen =
    !!currentFile?.path &&
    !currentFile.openAsText &&
    (currentFile.name.endsWith(".ipynb") ||
      currentFile.path.endsWith(".ipynb"));

  /**
   * In-memory cache mapping folder paths → their immediate children.
   * Cleared on workspace change or full refresh.
   */
  const childrenCacheRef = useRef<Map<string, FileTreeItem[]>>(new Map());

  const handleAccordionChange = (value: string[]) => {
    setOpenAccordionItems(parseSidebarViewList(value, [], true));
  };

  /**
   * Activates the sidebar search as an exclusive view and focuses its input.
   * Cmd/Ctrl+K should never add search alongside other active views.
   */
  const activateSearchOnlyView = useCallback(() => {
    setActiveViews(["search"]);
    setOpenAccordionItems(["search"]);
    // Wait for React to commit the view switch before focusing the input.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => workspaceSearchRef.current?.focus());
    });
  }, []);

  /** Switches to the Kernels sidebar tab (same as clicking the Kernels tab button). */
  const openKernelsSidebarTab = useCallback(() => {
    setActiveViews(["cpu"]);
    setOpenAccordionItems(["cpu"]);
  }, []);

  const handleViewButtonClick = (
    view: SidebarViewType,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey) {
      if (activeViews.includes(view)) {
        if (activeViews.length <= 1) return;
        setActiveViews(activeViews.filter((v) => v !== view));
        setOpenAccordionItems(openAccordionItems.filter((item) => item !== view));
      } else {
        /** Most recently added view is first — renders on top. */
        setActiveViews([view, ...activeViews]);
        setOpenAccordionItems([view, ...openAccordionItems]);
      }
    } else {
      setActiveViews([view]);
      setOpenAccordionItems([view]);
    }
  };

  /**
   * Shuts down every running kernel and keeps the spinner visible briefly so
   * users perceive the action feedback even on very fast responses.
   */
  const handleShutdownAllKernels = useCallback(async () => {
    if (!onShutdownAllKernels) return;
    setIsShuttingDownAllKernels(true);
    const start = Date.now();
    try {
      await Promise.resolve(onShutdownAllKernels());
    } finally {
      scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
        setIsShuttingDownAllKernels(false)
      );
    }
  }, [onShutdownAllKernels]);

  /**
   * Fetches the immediate children of `path`, using the cache when available.
   * Used by both the file tree (lazy expand) and the workspace picker.
   */
  const fetchAndCacheChildren = useCallback(
    async (path: string): Promise<FileTreeItem[]> => {
      if (!kernelService) return [];
      const cached = childrenCacheRef.current.get(path);
      if (cached) return cached;
      const contentsManager = kernelService.getContentsManager();
      const children = await fetchDirectoryChildren(contentsManager, path);
      childrenCacheRef.current.set(path, children);
      return children;
    },
    [kernelService]
  );

  /**
   * Re-fetches the immediate children of `folderPath` from the server and updates
   * only that node in the tree — used after CRUD operations.
   */
  const refreshFolder = useCallback(
    async (folderPath: string) => {
      if (!kernelService) return;
      // Invalidate cache for this folder
      childrenCacheRef.current.delete(folderPath);
      try {
        const contentsManager = kernelService.getContentsManager();
        const newChildren = await fetchDirectoryChildren(contentsManager, folderPath);
        childrenCacheRef.current.set(folderPath, newChildren);

        setFileTreeData((prev) => {
          if (prev.length === 0) return prev;
          const root = prev[0];
          if (root.path === folderPath) {
            return [{ ...root, children: newChildren, childrenLoaded: true }];
          }
          return [
            {
              ...root,
              children: updateChildrenAtPath(root.children ?? [], folderPath, newChildren),
            },
          ];
        });
      } catch (error) {
        console.error("Error refreshing folder:", error);
      }
    },
    [kernelService]
  );

  /** Re-fetches only the root of the current workspace, clearing all cached data. */
  const refreshFileTree = useCallback(async () => {
    if (!kernelService || workspaceDirectory === null || workspaceDirectory === undefined) return;
    setIsRefreshingFileTree(true);
    // Clear entire cache so expanded folders re-fetch on next interaction
    childrenCacheRef.current.clear();
    const start = Date.now();
    try {
      const rootPath = workspaceDirectory;
      const contentsManager = kernelService.getContentsManager();
      const children = await fetchDirectoryChildren(contentsManager, rootPath);
      childrenCacheRef.current.set(rootPath, children);
      setFileTreeData((prev) => {
        if (prev.length === 0) return prev;
        return [{ ...prev[0], children, childrenLoaded: true }];
      });
    } catch (error) {
      console.error("Error refreshing file tree:", error);
    } finally {
      scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
        setIsRefreshingFileTree(false)
      );
    }
  }, [kernelService, workspaceDirectory]);

  /**
   * Opens the given path in the OS native file manager by running the
   * appropriate shell command via a short-lived Jupyter terminal.
   */
  const handleRevealInFinder = useCallback(
    (path: string) => {
      if (!kernelService) return;
      void openFile(kernelService, path).catch((err) => {
        console.error("Failed to reveal in file manager:", err);
      });
    },
    [kernelService]
  );

  // Load the file tree when the kernel connects or the workspace changes.
  useEffect(() => {
    if (!kernelService) {
      setFileTreeData([]);
      childrenCacheRef.current.clear();
      return;
    }
    // workspaceDirectory === null → picker is shown; don't load a tree
    if (workspaceDirectory === null || workspaceDirectory === undefined) {
      setFileTreeData([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      childrenCacheRef.current.clear();
      try {
        const rootPath = workspaceDirectory;
        const contentsManager = kernelService.getContentsManager();
        const model = await contentsManager.get(rootPath || "", { content: false });
        const rootName =
          model.name ||
          (rootPath ? rootPath.split("/").pop() : undefined) ||
          "root";
        const children = await fetchDirectoryChildren(contentsManager, rootPath);
        childrenCacheRef.current.set(rootPath, children);

        const rootItem: FileTreeItem = {
          name: rootName || "root",
          path: model.path ?? rootPath,
          type: "folder",
          children,
          childrenLoaded: true,
        };
        setFileTreeData([rootItem]);
      } catch (error) {
        console.error("Error loading file tree:", error);
        setFileTreeData([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [kernelService, workspaceDirectory]);

  // Refresh specific folder when the agent creates a new notebook.
  useEffect(() => {
    const handleAgentCreated = (e: Event) => {
      const path = (e as CustomEvent).detail?.path as string | undefined;
      if (!path) {
        void refreshFileTree();
        return;
      }
      const parentDir = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/"))
        : workspaceDirectory ?? "";
      void refreshFolder(parentDir);
    };
    window.addEventListener("agentNotebookCreated", handleAgentCreated);
    return () => window.removeEventListener("agentNotebookCreated", handleAgentCreated);
  }, [refreshFileTree, refreshFolder, workspaceDirectory]);

  // Refresh the visible tree after non-sidebar create actions change a folder.
  useEffect(() => {
    const handleWorkspaceFilesChanged = (event: Event) => {
      const detail = getWorkspaceFilesChangedDetail(event);
      if (!detail) return;
      void refreshFolder(detail.folderPath);
    };

    window.addEventListener(
      WORKSPACE_FILES_CHANGED_EVENT,
      handleWorkspaceFilesChanged
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_FILES_CHANGED_EVENT,
        handleWorkspaceFilesChanged
      );
    };
  }, [refreshFolder]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const isSearchShortcut =
        ((event.metaKey && !event.ctrlKey) || (!event.metaKey && event.ctrlKey)) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k";

      if (!isSearchShortcut) return;
      if (mobileFilesOnly) return;

      event.preventDefault();
      activateSearchOnlyView();
    };

    // Capture phase ensures this works even when editors stop propagation.
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [activateSearchOnlyView, mobileFilesOnly]);

  useEffect(() => {
    const handleSelectionUpdate = (event: Event) => {
      const selectedCellIndex = (event as CustomEvent).detail?.selectedCellIndex;
      setSelectedMinimapCellIndex(
        typeof selectedCellIndex === "number" ? selectedCellIndex : null
      );
    };

    window.addEventListener(
      "notebookMinimapSelectionUpdate",
      handleSelectionUpdate
    );
    return () => {
      window.removeEventListener(
        "notebookMinimapSelectionUpdate",
        handleSelectionUpdate
      );
    };
  }, []);

  // Whether a workspace has been chosen (including the empty-string server root)
  const hasWorkspace = workspaceDirectory !== null && workspaceDirectory !== undefined;

  const { serverAvailable } = useJupyterShellReady(
    kernelService ?? null
  );
  /** File tree and workspace picker only need a live server, not an active kernel. */
  const kernelForFiles =
    serverAvailable && kernelService ? kernelService : null;

  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 flex-col bg-sidebar",
        className
      )}
      {...props}
    >
      {!mobileFilesOnly && (
        <div
          className={cn(
            "sticky top-0 z-30 flex h-14 w-full min-w-0 shrink-0 items-center gap-1 bg-sidebar px-2",
            shouldStackBelowMacWindowControls && "h-20 items-end pb-2"
          )}
        >
          {shouldStackBelowMacWindowControls && (
            <div
              aria-hidden="true"
              className="electron-window-drag absolute left-24 right-2 top-0 h-10"
            />
          )}
          {SIDEBAR_TAB_VIEWS.map((view) => (
            <ToolbarButton
              key={view.id}
              onClick={(e) => handleViewButtonClick(view.id, e)}
              toolTipLabel={view.title}
              toolTipShortcut={
                view.id === "search" ? [[CmdOrCtrl, "K"]] : undefined
              }
              className={cn(
                "h-8 min-w-0 max-w-none flex-1 basis-0 w-full",
                activeViews.includes(view.id)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {view.icon}
            </ToolbarButton>
          ))}
          {onToggleTerminalPanel && (
            <>
              <Separator
                orientation="vertical"
                className="h-6 w-px shrink-0 bg-border"
              />
              <ToolbarButton
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTerminalPanel();
                }}
                toolTipLabel={
                  isTerminalPanelOpen ? "Hide Terminal" : "Show Terminal"
                }
                toolTipShortcut={
                  platformOs === "macos"
                    ? [[CmdOrCtrl, "J"]]
                    : [[CmdOrCtrl, "`"]]
                }
                aria-pressed={isTerminalPanelOpen}
                className={cn(
                  "h-8 min-w-0 max-w-none flex-1 basis-0 w-full",
                  isTerminalPanelOpen
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Terminal />
              </ToolbarButton>
            </>
          )}
        </div>
      )}

      <div className="relative z-0 flex-1 overflow-auto no-overscroll-x">
        <Accordion
          type="multiple"
          value={openAccordionItems}
          onValueChange={handleAccordionChange}
          className="w-full space-y-2 p-2"
        >
          {activeViews.map((viewId) => {
            switch (viewId) {
              case "files":
                return (
                  <AccordionItem key="files" value="files" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionHeaderWithToolbar
                      triggerClassName="py-2 px-2 hover:no-underline"
                      toolbar={
                        <div className="flex items-center gap-1">
                          {hasWorkspace && kernelService && (
                            <>
                              <ToolbarButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void refreshFileTree();
                                }}
                                toolTipLabel="Refresh"
                                className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                              >
                                <RefreshCw
                                  className={cn(
                                    isRefreshingFileTree && "animate-spin"
                                  )}
                                />
                              </ToolbarButton>
                              <ToolbarButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowHiddenFiles((prev) => !prev);
                                }}
                                toolTipLabel={
                                  showHiddenFiles ? "Hide dotfiles" : "Show dotfiles"
                                }
                                className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                              >
                                {showHiddenFiles ? (
                                  <EyeOff />
                                ) : (
                                  <Eye />
                                )}
                              </ToolbarButton>
                              <ToolbarButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onWorkspaceChange?.(null);
                                }}
                                toolTipLabel="Close workspace"
                                className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                              >
                                <X />
                              </ToolbarButton>
                            </>
                          )}
                          <Separator orientation="vertical" className="mx-1 h-4" />
                        </div>
                      }
                    >
                      <div className="flex items-center">
                        <Folder className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Files</span>
                      </div>
                    </StickyAccordionHeaderWithToolbar>

                    <AccordionContent>
                      <div className="px-2 pt-2">
                        {!kernelForFiles ? (
                          <div className="flex min-h-[180px] items-center justify-center px-2 py-4">
                            <NoKernelPrompt
                              description="Connect Orion's runtime to browse workspace files."
                              onConnect={onOpenKernelDropdown}
                              className="max-w-md"
                            />
                          </div>
                        ) : !hasWorkspace ? (
                          // Connected but no workspace selected — show picker
                          <WorkspacePicker
                            contentsManager={kernelForFiles.getContentsManager()}
                            onSelectWorkspace={(path) => onWorkspaceChange?.(path)}
                            onFetchChildren={fetchAndCacheChildren}
                          />
                        ) : loading ? (
                          <FileTree
                            items={[]}
                            loading={true}
                            fontSize={fileTreeFontSize}
                          />
                        ) : fileTreeData.length > 0 ? (
                          <>
                            <FileTree
                              items={fileTreeData}
                              showHiddenFiles={showHiddenFiles}
                              defaultCollapsed={true}
                              contentsManager={kernelForFiles.getContentsManager()}
                              onFileSelect={onFileSelect}
                              onTreeChange={refreshFolder}
                              onFetchChildren={fetchAndCacheChildren}
                              onRevealInFinder={handleRevealInFinder}
                              onPathRenamed={onWorkspacePathRenamed}
                              onPathDeleted={onWorkspacePathDeleted}
                              revealLabel={revealLabel}
                              workspaceDirectory={workspaceDirectory}
                              fontSize={fileTreeFontSize}
                            />
                          </>
                        ) : (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No files found.
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              case "search":
                return (
                  <AccordionItem key="search" value="search" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionHeaderWithToolbar
                      triggerClassName="py-2 px-2 hover:no-underline"
                      toolbar={
                        <div className="flex items-center gap-1">
                          <ToolbarButton
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSearchCaseSensitive((prev) => !prev);
                            }}
                            toolTipLabel={
                              isSearchCaseSensitive
                                ? "Turn off case-sensitive search"
                                : "Turn on case-sensitive search"
                            }
                            className={cn(
                              SIDEBAR_ACCORDION_TOOLBAR_BTN,
                              isSearchCaseSensitive && "bg-accent text-foreground hover:bg-accent"
                            )}
                            aria-pressed={isSearchCaseSensitive}
                            aria-label="Toggle case-sensitive search"
                          >
                            <span className="text-[9px] font-semibold tracking-wide">
                              Aa
                            </span>
                          </ToolbarButton>
                          <Separator orientation="vertical" className="mx-1 h-4" />
                        </div>
                      }
                    >
                      <div className="flex items-center">
                        <Search className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Search</span>
                      </div>
                    </StickyAccordionHeaderWithToolbar>
                    <AccordionContent className="pb-0">
                      <WorkspaceSearch
                        ref={workspaceSearchRef}
                        workspaceDirectory={workspaceDirectory ?? null}
                        kernelService={kernelForFiles}
                        caseSensitive={isSearchCaseSensitive}
                        onFileSelect={onFileSelect}
                        onNavigateToLine={onNavigateToLine}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              case "toc":
                return (
                  <AccordionItem key="toc" value="toc" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionHeaderWithToolbar
                      triggerClassName="py-2 px-2 hover:no-underline"
                      toolbar={
                        isNotebookOpen ? (
                          <div className="flex items-center gap-1">
                            <ToolbarButton
                              onClick={(e) => {
                                e.stopPropagation();
                                setAllMinimapSectionsOpen((v) => !v);
                              }}
                              toolTipLabel={
                                allMinimapSectionsOpen
                                  ? "Collapse all sections"
                                  : "Expand all sections"
                              }
                              className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                            >
                              {allMinimapSectionsOpen ? (
                                <ChevronsDownUp />
                              ) : (
                                <ChevronsUpDown />
                              )}
                            </ToolbarButton>
                            <ToolbarButton
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowMinimapOutputs((v) => !v);
                              }}
                              toolTipLabel={
                                showMinimapOutputs
                                  ? "Hide cell outputs"
                                  : "Show cell outputs"
                              }
                              className={cn(
                                SIDEBAR_ACCORDION_TOOLBAR_BTN,
                                !showMinimapOutputs && "bg-accent text-foreground hover:bg-accent"
                              )}
                            >
                              {showMinimapOutputs ? (
                                <EyeOff />
                              ) : (
                                <Eye />
                              )}
                            </ToolbarButton>
                            <ToolbarButton
                              onClick={(e) => {
                                e.stopPropagation();
                                setMinimapPreviewMode((mode) =>
                                  mode === "miniature" ? "compact" : "miniature"
                                );
                              }}
                              toolTipLabel={
                                minimapPreviewMode === "miniature"
                                  ? "Switch to compact view"
                                  : "Switch to miniature view"
                              }
                              className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                            >
                              {minimapPreviewMode === "miniature" ? (
                                <AlignLeft />
                              ) : (
                                <GalleryVerticalEnd />
                              )}
                            </ToolbarButton>
                            <Separator orientation="vertical" className="mx-1 h-4" />
                          </div>
                        ) : undefined
                      }
                    >
                      <div className="flex items-center">
                        <MinimapIcon className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Minimap</span>
                      </div>
                    </StickyAccordionHeaderWithToolbar>
                    <AccordionContent>
                      {isNotebookOpen ? (
                        <NotebookMinimapPanel
                          sections={notebookMinimap}
                          allOpen={allMinimapSectionsOpen}
                          previewMode={minimapPreviewMode}
                          showOutputs={showMinimapOutputs}
                          selectedCellIndex={selectedMinimapCellIndex}
                          onNavigate={(cellIndex, outputIndex) =>
                            onMinimapNavigate?.(cellIndex, outputIndex)
                          }
                        />
                      ) : (
                        <div className="flex min-h-[120px] items-center justify-center px-3 py-6 text-center text-sm text-muted-foreground">
                          Open a notebook (.ipynb) to see the minimap.
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              case "cpu":
                return (
                  <AccordionItem key="cpu" value="cpu" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionHeaderWithToolbar
                      triggerClassName="py-2 px-2 hover:no-underline"
                      toolbar={
                        <div className="flex items-center gap-1">
                          <ConfirmPopover
                            title="Shut down all kernels?"
                            confirmLabel="Shut down all"
                            onConfirm={handleShutdownAllKernels}
                            isConfirming={isShuttingDownAllKernels}
                            disabled={!onShutdownAllKernels || isShuttingDownAllKernels}
                          >
                            <ToolbarButton
                              onClick={(e) => e.stopPropagation()}
                              toolTipLabel="Shut down all kernels"
                              className={cn(
                                SIDEBAR_ACCORDION_TOOLBAR_BTN,
                                "hover:text-destructive"
                              )}
                              disabled={!onShutdownAllKernels || isShuttingDownAllKernels}
                              aria-label="Shut down all kernels"
                            >
                              <Power
                                className={cn(
                                  isShuttingDownAllKernels && "animate-pulse"
                                )}
                              />
                            </ToolbarButton>
                          </ConfirmPopover>
                          <ToolbarButton
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!onRefreshKernels) return;
                              setIsRefreshingKernels(true);
                              const start = Date.now();
                              try {
                                await Promise.resolve(onRefreshKernels());
                              } finally {
                                scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
                                  setIsRefreshingKernels(false)
                                );
                              }
                            }}
                            toolTipLabel="Refresh kernels from server"
                            className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
                          >
                            <RefreshCw
                              className={cn(
                                isRefreshingKernels && "animate-spin"
                              )}
                            />
                          </ToolbarButton>
                          <Separator orientation="vertical" className="mx-1 h-4" />
                        </div>
                      }
                    >
                      <div className="flex items-center">
                        <Cpu className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Kernels</span>
                        {kernelSessions.length > 0 && (
                          <span className="text-xs text-muted-foreground px-2">
                            {kernelSessions.length}
                          </span>
                        )}
                      </div>
                    </StickyAccordionHeaderWithToolbar>
                    <AccordionContent>
                      <div className="px-2">
                        <TooltipProvider delayDuration={150}>
                          {kernelSessions.length > 0 ? (
                            <ul className="list-none p-0 m-0 space-y-0.5 py-1">
                              {kernelSessions.map((session) => {
                                const filename = session.fileName || session.sessionPath;
                                const isIdle = session.state === "idle";
                                const isBusy = session.state === "busy";
                                return (
                                  <li key={session.kernelId}>
                                    <div
                                      className={`corner-squircle w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 group hover:bg-accent cursor-pointer ${session.isActive ? "bg-accent/50 font-medium" : ""}`}
                                      onClick={() => onSessionSelect?.(session)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          onSessionSelect?.(session);
                                        }
                                      }}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            className={cn(
                                              "flex-shrink-0 inline-flex",
                                              !session.isActive && "opacity-40"
                                            )}
                                          >
                                            <Circle
                                              style={{ height: "8px", width: "8px" }}
                                              className={`${isBusy
                                                ? "fill-blue-500 text-blue-500 animate-pulse"
                                                : isIdle
                                                  ? "fill-green-500 text-green-500"
                                                  : "fill-yellow-500 text-yellow-500"
                                                }`}
                                            />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{session.state.charAt(0).toUpperCase() + session.state.slice(1)}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <span className="truncate flex-1">{filename}</span>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              className="corner-squircle flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onSessionShutdown?.(session);
                                              }}
                                            >
                                              <Power className="h-3 w-3" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Shut down kernel</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              No running kernels
                            </div>
                          )}
                        </TooltipProvider>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              case "vars":
                return (
                  <VariablesAccordionItem
                    key="vars"
                    kernelService={kernelService ?? null}
                    onOpenKernelsTab={openKernelsSidebarTab}
                  />
                );
              case "dataSources":
                return (
                  <AccordionItem key="dataSources" value="dataSources" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionTrigger className="py-2 px-2 hover:no-underline">
                      <div className="flex items-center">
                        <Database className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Data sources</span>
                      </div>
                    </StickyAccordionTrigger>
                    <AccordionContent>
                      <div className="px-2">
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          Coming soon
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              case "secrets":
                return (
                  <AccordionItem key="secrets" value="secrets" className={SIDEBAR_ACCORDION_CARD}>
                    <StickyAccordionTrigger className="py-2 px-2 hover:no-underline">
                      <div className="flex items-center">
                        <KeyRound className="h-4 w-4 mr-2" />
                        <span className="text-sm font-medium">Secrets</span>
                      </div>
                    </StickyAccordionTrigger>
                    <AccordionContent>
                      <div className="px-2">
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          Coming soon
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              default:
                return null;
            }
          })}
        </Accordion>
      </div>
    </div>
  );
}
