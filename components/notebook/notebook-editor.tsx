"use client";

import type React from "react";

import {
  Fragment,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  HelpCircle,
  Orbit,
  Plus,
} from "lucide-react";
import { parseNotebook } from "@/lib/notebook/notebook-parser";
import { NotebookCell } from "@/components/notebook/notebook-cell";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import {
  ORION_TABLE_COMM_TARGET,
  OrionTableCommEnvelopeSchema,
  type OrionTableCommResponse,
  type OrionTableOutputMetadata,
  type OrionTableRequest,
} from "@/components/notebook/orion-ui-table/types";
import { NotebookAppView } from "@/components/notebook/notebook-app-view";
import { NotebookPublishDialog } from "@/components/notebook/notebook-publish-dialog";
import type {
  NotebookType,
  NotebookCellType,
  NotebookOutputType,
  CellExecutionInfo,
} from "@/lib/types";
import { CellType, CellExecutionStatus } from "@/lib/types";
import { buildNotebookMinimap } from "./notebook-minimap";
import { cn } from "@/lib/utils";
import { useOrionSetting } from "@/hooks/use-orion-settings";
import type { KernelStatus, KernelInfo } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { runCells as runCellsBatch } from "@/lib/notebook/cell-executor";
import type { CellExecutionResult } from "@/lib/notebook/cell-executor";
import { CellExecutionQueue } from "@/lib/notebook/cell-execution-queue";
import {
  RUN_ALL_CELLS_EVENT_NAME,
  SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
  RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME,
  type RunAllCellsEventDetail,
  type RunAllTriggerSource,
  type ScrollToNotebookCellEventDetail,
} from "@/lib/notebook/notebook-execution-events";
import {
  AGENT_NOTEBOOK_EXECUTION_EVENT_NAME,
  type AgentNotebookExecutionEventDetail,
} from "@/lib/notebook/agent-notebook-events";
import {
  buildScreenNotebookExportHtml,
  downloadNotebookExport,
  downloadScreenNotebookHtml,
  getNotebookExportFilename,
  getNotebookExportLabel,
  getNotebookExportUrl,
  isNotebookExportFormat,
  isScreenRenderedNotebookExport,
  NOTEBOOK_EXPORT_EVENT_NAME,
  openScreenNotebookPrintWindow,
  printScreenNotebookHtml,
  type NotebookExportEventDetail,
  type NotebookExportFormat,
} from "@/lib/notebook/notebook-export";
import {
  NOTEBOOK_PUBLISH_EVENT_NAME,
  publishNotebookToCloud,
  type PublishNotebookResponse,
} from "@/lib/cloud/publishing";
import {
  addNotebookAppViewReference,
  isNotebookAppViewReferenceInNotebook,
  NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
  removeNotebookAppViewReference,
  setNotebookOutputTableMetadata,
  type NotebookAppViewReference,
} from "@/lib/notebook/app-view";
import {
  KernelSelectionDialog,
  KernelConnectionDialog,
  RunningKernelDialog,
} from "./kernel-dialogs";
import {
  applyPendingSourceChangesById,
  changeCellTypesById,
  clampSelectionToNotebook,
  createCellId,
  deleteCellsById,
  duplicateCellById,
  ensureUniqueCellIds,
  getCellId,
  getCellIdByIndex,
  getCellIdsByIndices,
  getCellIndexById,
  getCellIndicesByIds,
  insertCellById,
  moveCellById,
  pasteCellsAtIndex,
  restoreCellsByOriginalIndex,
  singleCellSelection,
  sourceTextToLines,
  type CellId,
  type DeletedCellSnapshot,
  type CellSelectionState,
} from "./notebook-commands";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ORION_USER_DOCS_PDF_EXPORT_URL } from "@/lib/constants/user-docs";
import {
  getSubagentDisableModelInvocation,
  getSubagentMetadata,
  getSubagentModelId,
  isRecord,
  isSubagentNotebookPath,
  validateSubagentNotebookStructure,
} from "./subagent-validation";
import type {
  OpenDocumentSaveResult,
  OpenDocumentSnapshotProvider,
} from "@/lib/agent/open-document-snapshots";

interface NotebookEditorProps {
  /**
   * Path to the .ipynb file to display (Jupyter-relative path)
   */
  filepath: string;
  /** Enables business-mode notebook presentation affordances. */
  businessMode?: boolean;
  /** Enables direct App View cell interactions from the Business shell's Edit toggle. */
  businessEditMode?: boolean;
  // Kernel related props passed from parent
  kernelService?: KernelService | null;
  currentKernel?: KernelInfo | null;
  kernelStatus?: KernelStatus;
  isRunning?: boolean;
  executionCountRef?: React.MutableRefObject<number>;
  onKernelStatusChange?: React.Dispatch<React.SetStateAction<KernelStatus>>;
  onCurrentKernelChange?: React.Dispatch<
    React.SetStateAction<KernelInfo | null>
  >;
  onIsRunningChange?: React.Dispatch<React.SetStateAction<boolean>>;
  onNotebookChange?: (notebook: NotebookType | null) => void;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onFileLoadError?: (failedFilepath: string, error?: unknown) => boolean | void;
  onNotebookSnapshotGetterChange?: (
    getter: OpenDocumentSnapshotProvider["getNotebookSnapshot"] | null,
  ) => void;
  onNotebookSaveHandlerChange?: (
    handler: ((path: string) => Promise<OpenDocumentSaveResult>) | null,
  ) => void;
  /**
   * When true, code cell inputs are hidden in the UI only (does not change notebook metadata).
   */
  presentationHideAllCellInputs?: boolean;
  /** Updates transient global code-input visibility for presentation/export flows. */
  onSetPresentationHideAllCellInputs?: (hidden: boolean) => void;
  activeNotebookView?: "notebook" | "app";
  onActiveNotebookViewChange?: (view: "notebook" | "app") => void;
  // Callbacks for actions that are now handled in the parent (page.tsx)
  // These will be invoked by custom events dispatched from here
}

const NOTEBOOK_SHORTCUT_GROUPS = [
  {
    title: "Cell Actions",
    shortcuts: [
      { keys: "A", description: "Add a code cell above" },
      { keys: "B", description: "Add a code cell below" },
      { keys: "D D", description: "Delete selected cells" },
      { keys: "C", description: "Copy selected cells" },
      { keys: "X", description: "Cut selected cells" },
      { keys: "V", description: "Paste cells below" },
      { keys: "Z", description: "Restore recently deleted cells" },
      { keys: "Alt + V", description: "Paste cells above" },
      { keys: "Alt + A", description: "Run all code cells above" },
      { keys: "Alt + B", description: "Run selected code cell and below" },
      { keys: "Alt + Up / Down", description: "Move selected cell" },
      { keys: "M", description: "Change selected cells to Markdown" },
      { keys: "Y", description: "Change selected cells to Code" },
      { keys: "I", description: "Mention the selected cell in chat" },
    ],
  },
  {
    title: "Run & Edit",
    shortcuts: [
      { keys: "Enter", description: "Edit the selected cell" },
      { keys: "Shift + Enter", description: "Run selected cells and advance" },
      { keys: "Ctrl/Cmd + Enter", description: "Run selected cells" },
      { keys: "Esc", description: "Leave edit mode or clear selection" },
      { keys: "H", description: "Show notebook shortcuts" },
    ],
  },
  {
    title: "Navigation & Selection",
    shortcuts: [
      { keys: "Up / Down", description: "Move between cells" },
      { keys: "Shift + Up / Down", description: "Extend cell selection" },
      { keys: "Page Up / Page Down", description: "Jump by several cells" },
      {
        keys: "Shift + Page Up / Page Down",
        description: "Extend selection by several cells",
      },
      { keys: "Ctrl/Cmd + Home", description: "Jump to the first cell" },
      { keys: "Ctrl/Cmd + End", description: "Jump to the last cell" },
      {
        keys: "Shift + Ctrl/Cmd + Home / End",
        description: "Extend selection to the first or last cell",
      },
    ],
  },
] as const;

/** Returns true when keyboard input belongs to a text-editing control. */
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );
}

/** Returns true when a document keydown event belongs to this notebook instance. */
function isNotebookKeyboardScope(
  event: KeyboardEvent,
  notebookRoot: HTMLElement | null,
): boolean {
  if (!notebookRoot) return false;
  const target = event.target;
  const activeElement = document.activeElement;

  return (
    (target instanceof Node && notebookRoot.contains(target)) ||
    (activeElement instanceof Node && notebookRoot.contains(activeElement))
  );
}

/** Normalizes editor/source line endings before comparing dirty state. */
function normalizeSourceForDirtyCheck(source: string): string {
  return source.replace(/\r\n/g, "\n");
}

function SubagentOptionTooltip({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top" align="center" className="max-w-[260px]">
          <p>{text}</p>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/** Waits for the browser to commit one frame of DOM updates. */
function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

/** Dialog listing notebook command-mode keyboard shortcuts. */
function NotebookShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 py-4">
          <DialogTitle>Notebook Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <div className="grid gap-6 md:grid-cols-2">
            {NOTEBOOK_SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="space-y-3">
                <h3 className="text-sm font-bold text-foreground">
                  {group.title}
                </h3>
                <dl className="grid grid-cols-[minmax(112px,max-content)_1fr] gap-x-3 gap-y-2 text-sm">
                  {group.shortcuts.map((shortcut) => (
                    <Fragment key={shortcut.keys}>
                      <dt>
                        <kbd className="inline-flex min-h-7 items-center rounded border bg-muted px-2 font-mono text-xs font-medium text-foreground shadow-sm">
                          {shortcut.keys}
                        </kbd>
                      </dt>
                      <dd className="flex min-h-7 items-center text-muted-foreground">
                        {shortcut.description}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SubagentModelOption {
  modelId: string;
  label: string;
  providerId: string;
}

type CellScrollAlignment = "start" | "end";

interface AddedCellResult {
  index: number;
  cellId: CellId;
}

interface ScrollPositionSnapshot {
  container: HTMLElement;
  scrollTop: number;
  scrollLeft: number;
}

/**
 * Component that displays a Jupyter notebook from a specified filepath
 */
export function NotebookEditor({
  filepath,
  businessMode = false,
  businessEditMode = false,
  // Destructure new props
  kernelService: parentKernelService,
  currentKernel: parentCurrentKernel,
  kernelStatus: parentKernelStatus,
  isRunning: parentIsRunning,
  executionCountRef: parentExecutionCountRef,
  onKernelStatusChange: parentSetKernelStatus,
  onCurrentKernelChange: parentSetCurrentKernel,
  onIsRunningChange: parentSetIsRunning,
  onNotebookChange,
  onUnsavedChangesChange,
  onFileLoadError,
  onNotebookSnapshotGetterChange,
  onNotebookSaveHandlerChange,
  presentationHideAllCellInputs,
  onSetPresentationHideAllCellInputs,
  activeNotebookView: controlledActiveNotebookView,
  onActiveNotebookViewChange,
}: NotebookEditorProps) {
  const [notebook, setNotebook] = useState<NotebookType | null>(null);
  const notebookRef = useRef<NotebookType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCellIds, setSelectedCellIds] = useState<Set<CellId>>(
    new Set(),
  );
  const [selectionAnchorCellId, setSelectionAnchorCellId] =
    useState<CellId | null>(null);
  const [cellCursorId, setCellCursorId] = useState<CellId | null>(null);
  const [editingCellIds, setEditingCellIds] = useState<Set<CellId>>(new Set());

  // Kernel state - now mostly controlled by parent, but some local interaction might be needed
  // const [kernelStatus, setKernelStatus] =
  //   useState<KernelStatus>("disconnected"); // Now from props
  // const [currentKernel, setCurrentKernel] = useState<any>(null); // Now from props
  // const [isRunning, setIsRunning] = useState(false); // Now from props
  // const [kernelService, setKernelService] = useState<KernelService | null>(
  //   null
  // ); // Now from props
  const [availableKernels, setAvailableKernels] = useState<any[]>([]); // Still needed for dialogs if they remain here
  const [showKernelDialog, setShowKernelDialog] = useState(false); // Dialogs might remain here or be lifted too
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showRunningKernelDialog, setShowRunningKernelDialog] = useState(false);
  const [showNotebookShortcutsDialog, setShowNotebookShortcutsDialog] =
    useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [subagentModelComboboxOpen, setSubagentModelComboboxOpen] =
    useState(false);
  const [subagentModelOptions, setSubagentModelOptions] = useState<
    SubagentModelOption[]
  >([]);

  useEffect(() => {
    notebookRef.current = notebook;
  }, [notebook]);

  const cellRefs = useRef<Map<CellId, HTMLDivElement | null>>(new Map());
  const notebookRootRef = useRef<HTMLDivElement | null>(null);
  const queuedAgentExecutionCellsRef = useRef<Set<number>>(new Set());
  const activeAgentExecutionCellsRef = useRef<Set<number>>(new Set());
  const pendingAgentNotebookReloadRef = useRef(false);
  const mouseSelectionScrollSnapshotRef =
    useRef<ScrollPositionSnapshot | null>(null);
  const showSubagentOptions = isSubagentNotebookPath(filepath);
  const subagentValidation = useMemo(
    () =>
      showSubagentOptions
        ? validateSubagentNotebookStructure(notebook)
        : { issues: [], cellIssues: new Map<number, string>() },
    [notebook, showSubagentOptions],
  );
  const subagentModelId = getSubagentModelId(notebook?.metadata);
  const subagentDisableModelInvocation = getSubagentDisableModelInvocation(
    notebook?.metadata,
  );
  const selectedSubagentModel = subagentModelOptions.find(
    (model) => model.modelId === subagentModelId,
  );
  const selectedCellIndices = useMemo(
    () => new Set(getCellIndicesByIds(notebook, selectedCellIds)),
    [notebook, selectedCellIds],
  );
  const cellCursorIndex = useMemo(
    () =>
      notebook && cellCursorId ? getCellIndexById(notebook, cellCursorId) : null,
    [notebook, cellCursorId],
  );
  const selectionAnchorIndex = useMemo(
    () =>
      notebook && selectionAnchorCellId
        ? getCellIndexById(notebook, selectionAnchorCellId)
        : null,
    [notebook, selectionAnchorCellId],
  );

  /** Applies identity-based selection returned by a notebook command. */
  const applySelectionState = useCallback((selection: CellSelectionState) => {
    setSelectedCellIds(new Set(selection.selectedCellIds));
    setCellCursorId(selection.cellCursorId);
    setSelectionAnchorCellId(selection.selectionAnchorCellId);
  }, []);

  /** Selects one current notebook cell by array index. */
  const selectCellByIndex = useCallback(
    (cellIndex: number | null) => {
      const cellId = getCellIdByIndex(notebook, cellIndex);
      applySelectionState(singleCellSelection(cellId));
      return cellId;
    },
    [applySelectionState, notebook],
  );

  /** Finds the notebook scroll container for a cell or nested editor element. */
  const getScrollContainer = useCallback((el: HTMLElement): HTMLElement => {
    let parent = el.parentElement;
    while (parent) {
      const overflow = window.getComputedStyle(parent).overflowY;
      if (overflow === "auto" || overflow === "scroll") return parent;
      parent = parent.parentElement;
    }
    return document.documentElement as HTMLElement;
  }, []);

  /** Restores scroll after mouse-originated selection so clicks never reposition the notebook. */
  const restoreMouseSelectionScroll = useCallback(() => {
    const snapshot = mouseSelectionScrollSnapshotRef.current;
    if (!snapshot) return;

    const restore = () => {
      snapshot.container.scrollTop = snapshot.scrollTop;
      snapshot.container.scrollLeft = snapshot.scrollLeft;
    };

    restore();
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 25);
    window.setTimeout(() => {
      restore();
      if (mouseSelectionScrollSnapshotRef.current === snapshot) {
        mouseSelectionScrollSnapshotRef.current = null;
      }
    }, 100);
  }, []);

  /** Captures the current scroll position before click/focus side effects can move it. */
  const handleCellMouseDownCapture = useCallback(
    (_cellIndex: number, event: React.MouseEvent) => {
      if (event.button !== 0) return;

      const container = getScrollContainer(event.currentTarget as HTMLElement);
      mouseSelectionScrollSnapshotRef.current = {
        container,
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      };
      restoreMouseSelectionScroll();
    },
    [getScrollContainer, restoreMouseSelectionScroll],
  );

  /** Focuses the selected cell wrapper so notebook command-mode shortcuts remain active. */
  const focusNotebookCommandTarget = useCallback(
    (targetCellId: CellId | null) => {
      if (targetCellId) {
        if (cellCursorId !== targetCellId || !selectedCellIds.has(targetCellId)) {
          applySelectionState(singleCellSelection(targetCellId));
        }

        window.requestAnimationFrame(() => {
          const cellElement = cellRefs.current.get(targetCellId);
          if (cellElement) {
            cellElement.focus({ preventScroll: true });
            return;
          }

          notebookRootRef.current
            ?.querySelector<HTMLElement>(".notebook-editor-content-area")
            ?.focus({ preventScroll: true });
        });
        return;
      }

      window.requestAnimationFrame(() => {
        notebookRootRef.current
          ?.querySelector<HTMLElement>(".notebook-editor-content-area")
          ?.focus({ preventScroll: true });
      });
    },
    [applySelectionState, cellCursorId, selectedCellIds],
  );

  useEffect(() => {
    const handler = () => {
      focusNotebookCommandTarget(cellCursorId);
    };
    window.addEventListener("orion:focusEditor", handler);
    return () => window.removeEventListener("orion:focusEditor", handler);
  }, [cellCursorId, focusNotebookCommandTarget]);

  /** Selects multiple current notebook cells by array index. */
  const selectCellsByIndices = useCallback(
    (cellIndices: Iterable<number>) => {
      const cellIds = getCellIdsByIndices(notebook, cellIndices);
      const firstCellId = cellIds[0] ?? null;
      applySelectionState({
        selectedCellIds: new Set(cellIds),
        selectionAnchorCellId: firstCellId,
        cellCursorId: firstCellId,
      });
      return cellIds;
    },
    [applySelectionState, notebook],
  );

  /** Returns the stable id for a current cell index. */
  const cellIdForIndex = useCallback(
    (cellIndex: number): CellId | null => getCellIdByIndex(notebook, cellIndex),
    [notebook],
  );

  // Use a ref to track modified cells by stable id instead of state to avoid re-renders.
  const modifiedCellsRef = useRef<Set<CellId>>(new Set());

  // Store pending cell content changes by stable id without causing rerenders.
  const pendingCellChangesRef = useRef<Map<CellId, string>>(new Map());

  // Track whether there are unsaved changes so we can notify the parent once per transition
  const isUnsavedRef = useRef(false);
  const dirtyVersionRef = useRef(0);

  /** Marks the notebook as having unsaved changes and notifies the parent (once per transition). */
  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    if (!isUnsavedRef.current) {
      isUnsavedRef.current = true;
      onUnsavedChangesChange?.(true);
    }
  }, [onUnsavedChangesChange]);

  /** Marks the notebook as clean (no unsaved changes) and notifies the parent (once per transition). */
  const markClean = useCallback(() => {
    if (isUnsavedRef.current) {
      isUnsavedRef.current = false;
      onUnsavedChangesChange?.(false);
    }
  }, [onUnsavedChangesChange]);

  useEffect(() => {
    return () => {
      markClean();
    };
  }, [markClean]);

  useEffect(() => {
    if (!showSubagentOptions) return;

    let cancelled = false;
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/models");
        if (!response.ok) return;

        const json = (await response.json()) as {
          models?: Array<{
            model_id?: string;
            label?: string;
            provider_id?: string;
          }>;
        };
        if (cancelled) return;

        const options = (json.models ?? [])
          .filter((model) => typeof model.model_id === "string")
          .map((model) => ({
            modelId: model.model_id as string,
            label: model.label ?? (model.model_id as string),
            providerId: model.provider_id ?? "",
          }));
        setSubagentModelOptions(options);
      } catch {
        if (!cancelled) setSubagentModelOptions([]);
      }
    };

    void fetchModels();
    return () => {
      cancelled = true;
    };
  }, [showSubagentOptions]);

  /** Updates top-level notebook metadata for notebooks that are sub-agent definitions. */
  const handleUpdateSubagentMetadata = useCallback(
    (patch: { model?: string; disableModelInvocation?: boolean }) => {
      setNotebook((prevNotebook) => {
        if (!prevNotebook || !isSubagentNotebookPath(filepath)) {
          return prevNotebook;
        }

        const prevOrion = isRecord(prevNotebook.metadata.orion)
          ? prevNotebook.metadata.orion
          : {};
        const prevSubagent = isRecord(prevOrion.subagent)
          ? prevOrion.subagent
          : {};
        const nextSubagent = { ...prevSubagent };

        if (patch.model !== undefined) {
          const trimmedModel = patch.model.trim();
          if (trimmedModel.length > 0) {
            nextSubagent.model = trimmedModel;
          } else {
            delete nextSubagent.model;
          }
        }

        if (patch.disableModelInvocation !== undefined) {
          delete nextSubagent.autoDiscover;
          nextSubagent["disable-model-invocation"] =
            patch.disableModelInvocation;
        }

        return {
          ...prevNotebook,
          metadata: {
            ...prevNotebook.metadata,
            orion: {
              ...prevOrion,
              subagent: nextSubagent,
            },
          },
        };
      });
      markDirty();
    },
    [filepath, markDirty],
  );

  // Store refs to cell components for direct access
  const cellComponentRefs = useRef<
    Map<CellId, { getSource: () => string; focusSource: () => void }>
  >(new Map());
  const executionQueueRef = useRef(new CellExecutionQueue());

  /**
   * Publishes whether any notebook execution source is active. A queued run and
   * pending or active agent execution can overlap, so neither source may clear
   * the shared running state on its own.
   */
  const updateExecutionRunningState = useCallback(() => {
    parentSetIsRunning?.(
      executionQueueRef.current.isActive ||
        queuedAgentExecutionCellsRef.current.size > 0 ||
        activeAgentExecutionCellsRef.current.size > 0,
    );
  }, [parentSetIsRunning]);

  // Clipboard for copy/paste
  const [copiedCells, setCopiedCells] = useState<NotebookCellType[]>([]);
  const deletedCellHistoryRef = useRef<DeletedCellSnapshot[][]>([]);
  const activeNotebookView = controlledActiveNotebookView ?? "notebook";
  const previousActiveNotebookViewRef = useRef(activeNotebookView);
  /** Cell index to scroll to after switching from app view to notebook view. */
  const pendingScrollToCellIndexRef = useRef<number | null>(null);
  // For 'D' twice to delete
  const lastDKeyPressTimeRef = useRef<number>(0);

  /** When false, the notebook scroll area keeps overflow but hides the scrollbar (see Appearance). */
  const notebookScrollbarVisible = useOrionSetting(
    (s) => s.notebook.scrollbarVisible,
  );
  const notebookMinimapSections = useMemo(
    () => (notebook ? buildNotebookMinimap(notebook.cells) : []),
    [notebook],
  );

  // Track execution count
  // const executionCountRef = useRef(0); // Now from props

  useEffect(() => {
    // Load the notebook from the filepath when the component mounts or filepath changes
    const loadNotebook = async () => {
      if (!filepath) {
        setError("No filepath provided");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const contentsManager = parentKernelService?.getContentsManager();
        if (!contentsManager) {
          throw new Error(
            "No Jupyter server connection. Connect to a server to open notebooks.",
          );
        }

        const model = await contentsManager.get(filepath, { content: true });
        // ContentsManager returns the notebook as a parsed JS object.
        // Run it through parseNotebook (via JSON round-trip) so all fields
        // (source, outputs.text, outputs.traceback, etc.) are normalized to
        // the string-array format the rest of the app expects.
        const parsedNotebook = parseNotebook(JSON.stringify(model.content));

        const withIds = ensureUniqueCellIds(parsedNotebook, createCellId);

        setNotebook(withIds);
        // Clear modified/pending cells when loading a new notebook.
        modifiedCellsRef.current = new Set();
        pendingCellChangesRef.current = new Map();
        cellComponentRefs.current = new Map();
        executionQueueRef.current.clear();
        updateExecutionRunningState();
        cellRefs.current = new Map();
        deletedCellHistoryRef.current = [];
        markClean();
        applySelectionState(singleCellSelection(getCellId(withIds.cells[0])));
      } catch (err) {
        console.error("Error loading notebook:", err);
        const handledExternally = onFileLoadError?.(filepath, err) === true;
        if (handledExternally) return;

        setError(
          `Failed to load the notebook: ${err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setLoading(false);
      }
    };

    loadNotebook();
  }, [
    applySelectionState,
    filepath,
    parentKernelService,
    markClean,
    onFileLoadError,
    updateExecutionRunningState,
  ]);

  // Notify parent when notebook changes
  useEffect(() => {
    if (onNotebookChange) {
      onNotebookChange(notebook);
    }
  }, [notebook, onNotebookChange]);

  useEffect(() => {
    const clamped = clampSelectionToNotebook(notebook, {
      selectedCellIds,
      selectionAnchorCellId,
      cellCursorId,
    });
    const selectedUnchanged =
      clamped.selectedCellIds.size === selectedCellIds.size &&
      Array.from(clamped.selectedCellIds).every((id) => selectedCellIds.has(id));
    if (
      selectedUnchanged &&
      clamped.selectionAnchorCellId === selectionAnchorCellId &&
      clamped.cellCursorId === cellCursorId
    ) {
      return;
    }
    applySelectionState(clamped);
  }, [
    applySelectionState,
    notebook,
    selectedCellIds,
    selectionAnchorCellId,
    cellCursorId,
  ]);

  /**
   * Tracks which cells have been modified using a ref to avoid re-renders
   */
  const handleCellModified = useCallback(
    (cellIndex: number, source?: string) => {
      const cellId = cellIdForIndex(cellIndex);
      if (!cellId) return;
      const savedSource = notebook?.cells[cellIndex]?.source?.join("") ?? "";
      if (
        source !== undefined &&
        normalizeSourceForDirtyCheck(source) ===
          normalizeSourceForDirtyCheck(savedSource)
      ) {
        pendingCellChangesRef.current.delete(cellId);
        modifiedCellsRef.current.delete(cellId);
        return;
      }
      if (source !== undefined) {
        pendingCellChangesRef.current.set(cellId, source);
      }
      // Simply add to the ref without causing a re-render.
      modifiedCellsRef.current.add(cellId);
      markDirty();
    },
    [cellIdForIndex, markDirty, notebook],
  );

  /**
   * Register a cell component reference for direct access during save and focus
   */
  const registerCellRef = useCallback(
    (
      cellIndex: number,
      ref: { getSource: () => string; focusSource: () => void } | null,
    ) => {
      const cellId = cellIdForIndex(cellIndex);
      if (!cellId) return;
      if (ref) {
        cellComponentRefs.current.set(cellId, ref);
      } else {
        cellComponentRefs.current.delete(cellId);
      }
    },
    [cellIdForIndex],
  );

  /**
   * NEW: Store cell content changes in a ref instead of updating state immediately
   * This is called by cells when they have local changes
   */
  const handleCellContentChange = useCallback(
    (cellIndex: number, source: string) => {
      const cellId = cellIdForIndex(cellIndex);
      if (!cellId) return;
      pendingCellChangesRef.current.set(cellId, source);
    },
    [cellIdForIndex],
  );

  /**
   * Updates cell metadata immediately in the notebook state
   * Unlike content changes, metadata changes are applied immediately
   */
  const handleUpdateCellMetadata = useCallback(
    (cellIndex: number, metadata: any) => {
      if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return;
      }

      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;

        const updatedNotebook = JSON.parse(JSON.stringify(prevNotebook));
        const existingCellId = getCellId(updatedNotebook.cells[cellIndex]);
        updatedNotebook.cells[cellIndex].metadata = {
          ...(metadata ?? {}),
          orion: {
            ...(metadata?.orion ?? {}),
            ...(existingCellId ? { id: existingCellId } : { id: createCellId() }),
          },
        };
        return updatedNotebook;
      });

      // Mark the cell as modified so it gets saved
      const cellId = cellIdForIndex(cellIndex);
      if (cellId) modifiedCellsRef.current.add(cellId);
      markDirty();
    },
    [cellIdForIndex, notebook, markDirty],
  );

  /**
   * Replaces one notebook cell with a full, editor-validated cell payload.
   * Full-cell edits are applied immediately, including source/output changes.
   */
  const handleUpdateCellData = useCallback(
    (cellIndex: number, cell: NotebookCellType) => {
      if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return;
      }

      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;

        const updatedNotebook = JSON.parse(JSON.stringify(prevNotebook));
        const existingCellId = getCellId(updatedNotebook.cells[cellIndex]);
        const nextCellId = getCellId(cell) ?? existingCellId ?? createCellId();
        updatedNotebook.cells[cellIndex] = {
          ...cell,
          metadata: {
            ...(cell.metadata ?? {}),
            orion: {
              ...(cell.metadata?.orion ?? {}),
              id: nextCellId,
            },
          },
        };
        return updatedNotebook;
      });

      const cellId = getCellId(cell) ?? cellIdForIndex(cellIndex);
      if (cellId) pendingCellChangesRef.current.set(cellId, cell.source.join(""));
      markDirty();
    },
    [cellIdForIndex, notebook, markDirty],
  );

  /**
   * Helper function to update execution info in cell metadata
   */
  const updateExecutionInfo = useCallback(
    (cellIndex: number, executionInfo: CellExecutionInfo) => {
      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        if (cellIndex < 0 || cellIndex >= prevNotebook.cells.length)
          return prevNotebook;
        const prevCell = prevNotebook.cells[cellIndex];
        const updatedCell = {
          ...prevCell,
          metadata: {
            ...prevCell.metadata,
            orion: {
              ...prevCell.metadata?.orion,
              cellState: {
                ...prevCell.metadata?.orion?.cellState,
                executionInfo,
              },
            },
          },
        } as any;
        const newCells = prevNotebook.cells.slice();
        newCells[cellIndex] = updatedCell;
        return { ...prevNotebook, cells: newCells };
      });

      const cellId = cellIdForIndex(cellIndex);
      if (cellId) modifiedCellsRef.current.add(cellId);
      markDirty();
    },
    [cellIdForIndex, markDirty],
  );

  /**
   * Updates only the execution status while preserving prior timing metadata.
   */
  const setCellExecutionStatus = useCallback(
    (cellIndex: number, status: CellExecutionStatus) => {
      const currentNotebook = notebookRef.current;
      if (
        !currentNotebook ||
        cellIndex < 0 ||
        cellIndex >= currentNotebook.cells.length
      ) {
        return;
      }

      const previousInfo =
        currentNotebook.cells[cellIndex]?.metadata?.orion?.cellState
          ?.executionInfo;
      updateExecutionInfo(cellIndex, {
        ...previousInfo,
        status,
      });
    },
    [updateExecutionInfo],
  );

  /** Marks code cells as queued when a run request is waiting to execute. */
  const markCellsQueued = useCallback(
    (indices: number[]) => {
      const currentNotebook = notebookRef.current;
      if (!currentNotebook) return;

      for (const idx of indices) {
        const cell = currentNotebook.cells[idx];
        if (!cell || cell.cell_type !== CellType.CODE) continue;

        const currentStatus =
          cell.metadata?.orion?.cellState?.executionInfo?.status;
        if (currentStatus === CellExecutionStatus.RUNNING) continue;

        setCellExecutionStatus(idx, CellExecutionStatus.QUEUED);
      }
    },
    [setCellExecutionStatus],
  );

  /** Clears queued status for cells that will not run. */
  const clearQueuedExecutionStatuses = useCallback(
    (indices?: number[]) => {
      const currentNotebook = notebookRef.current;
      if (!currentNotebook) return;

      const targetIndices =
        indices ?? currentNotebook.cells.map((_, cellIndex) => cellIndex);

      for (const idx of targetIndices) {
        const status =
          currentNotebook.cells[idx]?.metadata?.orion?.cellState?.executionInfo
            ?.status;
        if (status === CellExecutionStatus.QUEUED) {
          setCellExecutionStatus(idx, CellExecutionStatus.IDLE);
        }
      }
    },
    [setCellExecutionStatus],
  );

  /**
   * Updates the notebook with changes from a specific cell
   * Only called when we need to sync cell state with the notebook (e.g., during save)
   */
  const handleUpdateCell = useCallback(
    (cellIndex: number, source: string) => {
      if (!notebook) return;

      // Store the change in pending changes instead of updating state immediately
      const cellId = cellIdForIndex(cellIndex);
      if (cellId) pendingCellChangesRef.current.set(cellId, source);
    },
    [cellIdForIndex, notebook],
  );

  /**
   * NEW: Apply all pending changes to create a new notebook object
   * This is only called during save to minimize state updates
   */
  const applyPendingChanges = useCallback(
    (currentNotebook: NotebookType): NotebookType => {
      return applyPendingSourceChangesById(
        currentNotebook,
        pendingCellChangesRef.current,
      );
    },
    [],
  );

  /**
   * Captures the latest mounted cell editor text before leaving notebook editing surfaces.
   */
  const capturePendingCellSources = useCallback(() => {
    modifiedCellsRef.current.forEach((cellId) => {
      const cellRef = cellComponentRefs.current.get(cellId);
      if (cellRef) {
        pendingCellChangesRef.current.set(cellId, cellRef.getSource());
      }
    });
  }, []);

  /**
   * Return the active in-memory notebook, including pending Monaco cell edits.
   */
  const getNotebookSnapshot = useCallback(
    (path: string) => {
      const currentNotebook = notebookRef.current;
      if (path !== filepath || !currentNotebook) return null;
      capturePendingCellSources();
      return {
        notebook: applyPendingChanges(currentNotebook),
        dirty: isUnsavedRef.current,
        source: "editor-buffer" as const,
      };
    },
    [applyPendingChanges, capturePendingCellSources, filepath],
  );

  useEffect(() => {
    onNotebookSnapshotGetterChange?.(getNotebookSnapshot);
    return () => {
      onNotebookSnapshotGetterChange?.(null);
    };
  }, [getNotebookSnapshot, onNotebookSnapshotGetterChange]);

  useEffect(() => {
    if (
      activeNotebookView === "app" &&
      previousActiveNotebookViewRef.current !== "app"
    ) {
      capturePendingCellSources();
      // Yield before deep-cloning/syncing notebook state so the view toggle can
      // paint and stay responsive under INP-style metrics on large notebooks.
      queueMicrotask(() => {
        setNotebook((prevNotebook) =>
          prevNotebook ? applyPendingChanges(prevNotebook) : prevNotebook,
        );
      });
    }

    previousActiveNotebookViewRef.current = activeNotebookView;
  }, [activeNotebookView, applyPendingChanges, capturePendingCellSources]);

  /**
   * Persists the active dirty notebook after capturing mounted Monaco cell text.
   * Explicit source overrides win over mounted editor text for immediate App View saves.
   */
  const saveOpenNotebookIfDirty = useCallback(
    async (
      path: string,
      sourceOverrides?: ReadonlyMap<CellId, string>,
    ): Promise<OpenDocumentSaveResult> => {
      if (path !== filepath) return { status: "not-open" };
      if (!isUnsavedRef.current) return { status: "clean" };
      const currentNotebook = notebookRef.current;
      if (!parentKernelService || !currentNotebook) {
        return {
          status: "error",
          message: "Cannot save the open notebook before it has finished loading.",
        };
      }

      try {
        const dirtyVersionToSave = dirtyVersionRef.current;
        capturePendingCellSources();
        sourceOverrides?.forEach((source, cellId) => {
          pendingCellChangesRef.current.set(cellId, source);
        });
        const notebookToSave = applyPendingChanges(currentNotebook);

        const contentsManager = parentKernelService.getContentsManager();
        await contentsManager.save(filepath, {
          type: "notebook",
          format: "json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: notebookToSave as any,
        });

        if (getSubagentMetadata(notebookToSave.metadata)) {
          window.dispatchEvent(
            new CustomEvent("orion:subagents-changed", {
              detail: { path: filepath },
            }),
          );
        }

        if (dirtyVersionRef.current === dirtyVersionToSave) {
          // Keep local notebook state aligned with what was persisted.
          // This prevents a later "clean" save (e.g. on file switch) from writing an older snapshot.
          notebookRef.current = notebookToSave;
          setNotebook(notebookToSave);

          pendingCellChangesRef.current.clear();
          modifiedCellsRef.current.clear();
          markClean();
        }

        console.log("Notebook saved successfully");
        return { status: "saved" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error saving notebook:", error);
        return { status: "error", message };
      }
    },
    [
      applyPendingChanges,
      capturePendingCellSources,
      filepath,
      markClean,
      parentKernelService,
    ],
  );

  /**
   * Persists an inline Business-mode markdown edit without exposing notebook controls.
   */
  const handleSaveBusinessMarkdownCell = useCallback(
    async (cellIndex: number, source: string): Promise<void> => {
      const currentNotebook = notebookRef.current;
      const cell = currentNotebook?.cells[cellIndex];
      if (!currentNotebook || !cell || cell.cell_type !== CellType.MARKDOWN) {
        throw new Error("This markdown content is no longer available to save.");
      }

      const cellId = getCellId(cell);
      if (!cellId) {
        throw new Error("This markdown content is missing its notebook identity.");
      }

      capturePendingCellSources();
      const persistedSource = cell.source.join("");
      if (
        normalizeSourceForDirtyCheck(source) ===
        normalizeSourceForDirtyCheck(persistedSource)
      ) {
        return;
      }

      const previousPendingSource = pendingCellChangesRef.current.get(cellId);
      const wasModified = modifiedCellsRef.current.has(cellId);
      const wasDirty = isUnsavedRef.current;
      pendingCellChangesRef.current.set(cellId, source);
      modifiedCellsRef.current.add(cellId);
      markDirty();

      const result = await saveOpenNotebookIfDirty(
        filepath,
        new Map([[cellId, source]]),
      );
      if (result.status === "saved" || result.status === "clean") {
        return;
      }

      if (previousPendingSource === undefined) {
        pendingCellChangesRef.current.delete(cellId);
      } else {
        pendingCellChangesRef.current.set(cellId, previousPendingSource);
      }
      if (!wasModified) {
        modifiedCellsRef.current.delete(cellId);
      }
      if (!wasDirty) {
        markClean();
      }

      throw new Error(
        result.status === "error"
          ? result.message
          : "Could not save this markdown content.",
      );
    },
    [
      capturePendingCellSources,
      filepath,
      markClean,
      markDirty,
      saveOpenNotebookIfDirty,
    ],
  );

  useEffect(() => {
    onNotebookSaveHandlerChange?.(saveOpenNotebookIfDirty);
    return () => {
      onNotebookSaveHandlerChange?.(null);
    };
  }, [onNotebookSaveHandlerChange, saveOpenNotebookIfDirty]);

  /**
   * Saves the current notebook to disk when the global save event fires.
   */
  useEffect(() => {
    // Listen for save file events
    const handleSaveFileEvent = () => {
      void saveOpenNotebookIfDirty(filepath);
    };

    window.addEventListener("saveFile", handleSaveFileEvent as EventListener);

    return () => {
      window.removeEventListener(
        "saveFile",
        handleSaveFileEvent as EventListener,
      );
    };
  }, [filepath, saveOpenNotebookIfDirty]);

  /** Finds the currently visible notebook surface used for screen-rendered exports. */
  const getScreenExportElement = useCallback((): HTMLElement | null => {
    const selector =
      activeNotebookView === "app"
        ? '[data-notebook-export-root="app"]'
        : '[data-notebook-export-root="notebook"]';

    return notebookRootRef.current?.querySelector<HTMLElement>(selector) ?? null;
  }, [activeNotebookView]);

  /** Resolves a readable title for dialogs and published notebook metadata. */
  const getNotebookDefaultTitle = useCallback((): string => {
    const metadataTitle = notebook?.metadata?.title;
    if (typeof metadataTitle === "string" && metadataTitle.trim()) {
      return metadataTitle.trim();
    }

    const basename = filepath.split("/").filter(Boolean).pop() ?? "notebook";
    return basename.replace(/\.ipynb$/i, "") || "Notebook";
  }, [filepath, notebook?.metadata?.title]);

  /** Saves pending editor edits and returns the notebook content used by publish/export flows. */
  const saveNotebookForCloudPublish = useCallback(async (): Promise<NotebookType> => {
    if (!parentKernelService || !notebook) {
      throw new Error(
        "Wait for the notebook to finish loading and confirm Jupyter is connected.",
      );
    }

    capturePendingCellSources();
    const notebookToPublish = applyPendingChanges(notebook);
    const contentsManager = parentKernelService.getContentsManager();
    await contentsManager.save(filepath, {
      type: "notebook",
      format: "json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: notebookToPublish as any,
    });

    if (getSubagentMetadata(notebookToPublish.metadata)) {
      window.dispatchEvent(
        new CustomEvent("orion:subagents-changed", {
          detail: { path: filepath },
        }),
      );
    }

    setNotebook(notebookToPublish);
    pendingCellChangesRef.current.clear();
    modifiedCellsRef.current.clear();
    markClean();

    return notebookToPublish;
  }, [
    applyPendingChanges,
    capturePendingCellSources,
    filepath,
    markClean,
    notebook,
    parentKernelService,
  ]);

  /** Publishes the active notebook view to Orion Cloud after saving local edits. */
  const handlePublishNotebook = useCallback(
    async (input: {
      publishId?: string;
      title: string;
      description: string;
      hideInputCells: boolean;
      allowSourceDownload: boolean;
      password: string;
      apiBaseUrl: string;
      accessToken: string;
    }): Promise<PublishNotebookResponse> => {
      const sourceFilename =
        filepath.split("/").filter(Boolean).pop() ?? "notebook.ipynb";
      const title = input.title.trim();
      const snapshotTitle = title || getNotebookDefaultTitle();
      let staticHtmlSnapshot: string;

      if (input.hideInputCells && !presentationHideAllCellInputs) {
        if (!onSetPresentationHideAllCellInputs) {
          throw new Error("Input cell visibility cannot be updated for publishing.");
        }
        onSetPresentationHideAllCellInputs(true);
        await nextAnimationFrame();
      }

      try {
        const sourceElement = getScreenExportElement();
        if (!sourceElement) {
          throw new Error("No rendered notebook surface is available.");
        }

        staticHtmlSnapshot = buildScreenNotebookExportHtml({
          sourceElement,
          title: snapshotTitle,
        });
      } finally {
        if (input.hideInputCells && !presentationHideAllCellInputs) {
          onSetPresentationHideAllCellInputs?.(false);
        }
      }

      const notebookToPublish = await saveNotebookForCloudPublish();
      const metadata = {
        title: snapshotTitle,
        description: input.description.trim(),
        sourceFilename,
        currentView: activeNotebookView,
        allowSourceDownload: input.allowSourceDownload,
      };

      return publishNotebookToCloud({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        request: {
          publishId: input.publishId,
          metadata,
          password: input.password.trim() || undefined,
          bundle: {
            schemaVersion: 1,
            rendererSchemaVersion: NOTEBOOK_APP_VIEW_SCHEMA_VERSION,
            metadata,
            notebook: notebookToPublish as unknown as Record<string, unknown>,
            staticHtmlSnapshot,
          },
        },
      });
    },
    [
      activeNotebookView,
      filepath,
      getNotebookDefaultTitle,
      getScreenExportElement,
      onSetPresentationHideAllCellInputs,
      presentationHideAllCellInputs,
      saveNotebookForCloudPublish,
    ],
  );

  /** Saves the current editor state and exports the notebook in the requested format. */
  const handleExportNotebook = useCallback(
    async (format: NotebookExportFormat) => {
      if (!parentKernelService || !notebook) {
        toast({
          title: "Notebook export unavailable",
          description:
            "Wait for the notebook to finish loading and confirm Jupyter is connected.",
          variant: "destructive",
        });
        return;
      }

      const label = getNotebookExportLabel(format);
      const filename = getNotebookExportFilename(filepath, format);
      const shouldUseScreenExport = isScreenRenderedNotebookExport(format);
      const printWindow =
        format === "pdf" ? openScreenNotebookPrintWindow(filename) : null;

      if (format === "pdf" && !printWindow) {
        toast({
          title: "PDF export blocked",
          description:
            "Allow pop-ups for Orion, then try exporting the notebook again.",
          variant: "destructive",
          action: (
            <ToastAction
              altText="Open PDF export help"
              onClick={() => {
                window.open(ORION_USER_DOCS_PDF_EXPORT_URL, "_blank", "noopener,noreferrer");
              }}
            >
              Help
            </ToastAction>
          ),
        });
        return;
      }

      try {
        const screenExportHtml = shouldUseScreenExport
          ? (() => {
              const sourceElement = getScreenExportElement();
              if (!sourceElement) {
                throw new Error("No rendered notebook surface is available.");
              }

              return buildScreenNotebookExportHtml({
                sourceElement,
                title: filename,
                autoPrint: format === "pdf",
              });
            })()
          : null;

        // Capture mounted editor text so the export includes unsaved cell edits.
        modifiedCellsRef.current.forEach((cellId) => {
          const cellRef = cellComponentRefs.current.get(cellId);
          if (cellRef) {
            pendingCellChangesRef.current.set(cellId, cellRef.getSource());
          }
        });

        const notebookToExport = applyPendingChanges(notebook);
        const contentsManager = parentKernelService.getContentsManager();
        await contentsManager.save(filepath, {
          type: "notebook",
          format: "json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: notebookToExport as any,
        });

        if (getSubagentMetadata(notebookToExport.metadata)) {
          window.dispatchEvent(
            new CustomEvent("orion:subagents-changed", {
              detail: { path: filepath },
            }),
          );
        }

        setNotebook(notebookToExport);
        pendingCellChangesRef.current.clear();
        modifiedCellsRef.current.clear();
        markClean();

        if (screenExportHtml) {
          if (format === "html") {
            downloadScreenNotebookHtml(screenExportHtml, filename);
          } else if (printWindow) {
            printScreenNotebookHtml(printWindow, screenExportHtml);
          }
        } else {
          const exportUrl = getNotebookExportUrl(
            parentKernelService.getServerSettings(),
            filepath,
            format,
          );
          downloadNotebookExport(exportUrl, filename);
        }

        toast({
          title: format === "pdf" ? "PDF export opened" : "Notebook exported",
          description:
            format === "pdf"
              ? "Use the print dialog to save the Orion-rendered notebook as PDF."
              : `${label} export downloaded as ${filename}.`,
        });
      } catch (error) {
        printWindow?.close();
        console.error("Error exporting notebook:", error);
        toast({
          title: "Notebook export failed",
          description:
            error instanceof Error
              ? error.message
              : "Jupyter could not export this notebook.",
          variant: "destructive",
        });
      }
    },
    [
      applyPendingChanges,
      filepath,
      getScreenExportElement,
      markClean,
      notebook,
      parentKernelService,
    ],
  );

  useEffect(() => {
    /** Handles export requests dispatched by the notebook toolbar. */
    const handleNotebookExportEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotebookExportEventDetail>).detail;
      if (!isNotebookExportFormat(detail?.format)) {
        return;
      }

      void handleExportNotebook(detail.format);
    };

    window.addEventListener(
      NOTEBOOK_EXPORT_EVENT_NAME,
      handleNotebookExportEvent,
    );
    return () => {
      window.removeEventListener(
        NOTEBOOK_EXPORT_EVENT_NAME,
        handleNotebookExportEvent,
      );
    };
  }, [handleExportNotebook]);

  useEffect(() => {
    /** Opens the cloud publishing dialog from the notebook toolbar. */
    const handleNotebookPublishEvent = () => {
      setPublishDialogOpen(true);
    };

    window.addEventListener(
      NOTEBOOK_PUBLISH_EVENT_NAME,
      handleNotebookPublishEvent,
    );
    return () => {
      window.removeEventListener(
        NOTEBOOK_PUBLISH_EVENT_NAME,
        handleNotebookPublishEvent,
      );
    };
  }, []);

  const reloadNotebookAfterAgentModification = useCallback(async () => {
    if (!parentKernelService) {
      return;
    }

    try {
      const contentsManager = parentKernelService.getContentsManager();
      const model = await contentsManager.get(filepath, { content: true });
      const parsedNotebook = parseNotebook(JSON.stringify(model.content));

      const withIds = ensureUniqueCellIds(parsedNotebook, createCellId);

      setNotebook(withIds);
      modifiedCellsRef.current = new Set();
      pendingCellChangesRef.current = new Map();
      cellComponentRefs.current = new Map();
      cellRefs.current = new Map();
      applySelectionState(singleCellSelection(getCellId(withIds.cells[0])));
      markClean();
    } catch (err) {
      console.error(
        "Failed to reload notebook after agent modification:",
        err,
      );
    }
  }, [applySelectionState, parentKernelService, filepath, markClean]);

  /**
   * Listen for agentNotebookModified events dispatched when the Orion agent
   * modifies the notebook via Jupyter's ContentsManager. Re-reads from
   * ContentsManager to sync the editor with the agent's changes.
   */
  useEffect(() => {
    const handleAgentModified = () => {
      if (activeAgentExecutionCellsRef.current.size > 0) {
        pendingAgentNotebookReloadRef.current = true;
        return;
      }
      void reloadNotebookAfterAgentModification();
    };

    window.addEventListener(
      "agentNotebookModified",
      handleAgentModified as EventListener,
    );
    return () => {
      window.removeEventListener(
        "agentNotebookModified",
        handleAgentModified as EventListener,
      );
    };
  }, [reloadNotebookAfterAgentModification]);

  /** Applies live notebook output updates emitted by agent execute_cell. */
  useEffect(() => {
    const handleAgentExecution = (event: Event) => {
      const detail = (event as CustomEvent<AgentNotebookExecutionEventDetail>)
        .detail;
      if (!detail || detail.notebookPath !== filepath) return;

      if (detail.type === "queued") {
        markCellsQueued(detail.cellIndices);
        detail.cellIndices.forEach((cellIndex) =>
          queuedAgentExecutionCellsRef.current.add(cellIndex),
        );
        updateExecutionRunningState();
        return;
      }

      if (detail.type === "start") {
        queuedAgentExecutionCellsRef.current.delete(detail.cellIndex);
        activeAgentExecutionCellsRef.current.add(detail.cellIndex);
        setNotebook((prev) => {
          if (!prev || detail.cellIndex < 0 || detail.cellIndex >= prev.cells.length) {
            return prev;
          }
          const newCells = prev.cells.slice();
          const targetCell = {
            ...newCells[detail.cellIndex],
            outputs: [],
            execution_count: null,
          } as NotebookCellType;
          newCells[detail.cellIndex] = targetCell;
          return { ...prev, cells: newCells };
        });
        updateExecutionInfo(detail.cellIndex, {
          status: CellExecutionStatus.RUNNING,
          startTime: detail.startTime,
        });
        updateExecutionRunningState();
        return;
      }

      if (detail.type === "output") {
        setNotebook((prev) => {
          if (!prev || detail.cellIndex < 0 || detail.cellIndex >= prev.cells.length) {
            return prev;
          }
          const newCells = prev.cells.slice();
          const targetCell = { ...newCells[detail.cellIndex] } as NotebookCellType;
          targetCell.outputs = [...(targetCell.outputs ?? []), detail.output];
          newCells[detail.cellIndex] = targetCell;
          return { ...prev, cells: newCells };
        });
        return;
      }

      if (detail.type === "execution-count") {
        setNotebook((prev) => {
          if (!prev || detail.cellIndex < 0 || detail.cellIndex >= prev.cells.length) {
            return prev;
          }
          const newCells = prev.cells.slice();
          const targetCell = { ...newCells[detail.cellIndex] } as NotebookCellType;
          targetCell.execution_count = detail.executionCount;
          newCells[detail.cellIndex] = targetCell;
          return { ...prev, cells: newCells };
        });
        if (parentExecutionCountRef) {
          parentExecutionCountRef.current = detail.executionCount;
        }
        return;
      }

      if (detail.type === "complete") {
        updateExecutionInfo(detail.cellIndex, detail.executionInfo);
        queuedAgentExecutionCellsRef.current.delete(detail.cellIndex);
        activeAgentExecutionCellsRef.current.delete(detail.cellIndex);
        updateExecutionRunningState();
        if (activeAgentExecutionCellsRef.current.size === 0) {
          if (pendingAgentNotebookReloadRef.current) {
            pendingAgentNotebookReloadRef.current = false;
            void reloadNotebookAfterAgentModification();
          }
        }
      }
    };

    window.addEventListener(
      AGENT_NOTEBOOK_EXECUTION_EVENT_NAME,
      handleAgentExecution as EventListener,
    );
    return () => {
      window.removeEventListener(
        AGENT_NOTEBOOK_EXECUTION_EVENT_NAME,
        handleAgentExecution as EventListener,
      );
    };
  }, [
    filepath,
    markCellsQueued,
    parentExecutionCountRef,
    reloadNotebookAfterAgentModification,
    updateExecutionRunningState,
    updateExecutionInfo,
  ]);

  /** Scrolls a rendered cell/output only when it is not fully visible. */
  const scrollElementIntoView = useCallback(
    (targetElement: HTMLElement, alignment: CellScrollAlignment = "start") => {
      const container = getScrollContainer(targetElement);
      const targetRect = targetElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const isFullyVisible =
        targetRect.top >= containerRect.top &&
        targetRect.bottom <= containerRect.bottom;

      if (!isFullyVisible) {
        const scrollDelta =
          alignment === "end"
            ? targetRect.bottom - containerRect.bottom
            : targetRect.top - containerRect.top;
        container.scrollTop += scrollDelta;
      }
    },
    [getScrollContainer],
  );

  /**
   * Navigates to a cell (and optionally a specific output within it).
   * If the target is already fully visible in its scroll container the method
   * only updates selection state without scrolling; otherwise it scrolls the
   * target to the requested viewport edge.
   */
  const scrollToCell = useCallback(
    (
      cellIndex: number,
      outputIndex?: number,
      alignment: CellScrollAlignment = "start",
    ) => {
      if (cellIndex < 0 || !notebook || cellIndex >= notebook.cells.length)
        return;

      // Resolve the target element — prefer the specific output when provided
      let targetElement: HTMLElement | null = null;
      if (outputIndex !== undefined) {
        targetElement = document.getElementById(
          `output-${cellIndex}-${outputIndex}`,
        );
      }
      if (!targetElement) {
        const cellId = getCellIdByIndex(notebook, cellIndex);
        targetElement = cellId ? (cellRefs.current.get(cellId) ?? null) : null;
      }

      if (!targetElement) return;
      scrollElementIntoView(targetElement, alignment);
    },
    [notebook, scrollElementIntoView],
  );

  /** Scrolls to a cell by stable id, which works for cells inserted after this render. */
  const scrollToCellId = useCallback(
    (cellId: CellId, alignment: CellScrollAlignment = "start") => {
      const targetElement = cellRefs.current.get(cellId);
      if (!targetElement) return;
      scrollElementIntoView(targetElement, alignment);
    },
    [scrollElementIntoView],
  );

  /** Re-applies id-based cell scrolling after newly mounted cells settle. */
  const scrollToCellIdAfterLayout = useCallback(
    (cellId: CellId, alignment: CellScrollAlignment = "start") => {
      const scroll = () => scrollToCellId(cellId, alignment);
      window.setTimeout(() => {
        scroll();
        window.requestAnimationFrame(() => {
          scroll();
          window.requestAnimationFrame(scroll);
        });
      }, 0);
    },
    [scrollToCellId],
  );

  /** Selects and scrolls to a cell by index (e.g. go-to-error from the toolbar). */
  const scrollToCellIndexFromEvent = useCallback(
    (cellIndex: number) => {
      const currentNotebook = notebookRef.current;
      if (
        cellIndex < 0 ||
        !currentNotebook ||
        cellIndex >= currentNotebook.cells.length
      ) {
        return;
      }

      selectCellByIndex(cellIndex);
      const cellId = getCellIdByIndex(currentNotebook, cellIndex);
      if (cellId) {
        scrollToCellIdAfterLayout(cellId);
      } else {
        scrollToCell(cellIndex);
      }
    },
    [scrollToCell, scrollToCellIdAfterLayout, selectCellByIndex],
  );

  useEffect(() => {
    if (notebook) {
      // Initialize refs array with the correct length
      const currentCellIds = new Set(
        notebook.cells
          .map((cell) => getCellId(cell))
          .filter((id): id is CellId => id !== null),
      );
      for (const cellId of Array.from(cellRefs.current.keys())) {
        if (!currentCellIds.has(cellId)) cellRefs.current.delete(cellId);
      }

      // Broadcast the updated minimap data to any listeners (e.g. page.tsx → LeftSidebar)
      window.dispatchEvent(
        new CustomEvent("notebookMinimapUpdate", {
          detail: { sections: notebookMinimapSections, notebook },
        }),
      );
    }
  }, [notebook, notebookMinimapSections]);

  // Keep the minimap highlight synced with the editor's current selected cell.
  useEffect(() => {
    const selectedCellIndex =
      cellCursorIndex !== null
        ? cellCursorIndex
        : selectedCellIndices.size > 0
          ? Math.min(...Array.from(selectedCellIndices))
          : null;

    window.dispatchEvent(
      new CustomEvent("notebookMinimapSelectionUpdate", {
        detail: { selectedCellIndex },
      }),
    );
  }, [cellCursorIndex, selectedCellIndices]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent("notebookMinimapSelectionUpdate", {
          detail: { selectedCellIndex: null },
        }),
      );
    };
  }, []);

  // Listen for minimap navigation events dispatched by page.tsx when the user
  // clicks any element in the NotebookMinimapPanel.
  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail && typeof e.detail.cellIndex === "number") {
        const newCellIndex = e.detail.cellIndex as number;
        const outputIndex =
          typeof e.detail.outputIndex === "number"
            ? (e.detail.outputIndex as number)
            : undefined;

        scrollToCell(newCellIndex, outputIndex);
        selectCellByIndex(newCellIndex);
      }
    };

    window.addEventListener(
      "notebookMinimapNavigate",
      handleNavigate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "notebookMinimapNavigate",
        handleNavigate as EventListener,
      );
    };
  }, [scrollToCell, selectCellByIndex]);

  /**
   * Handles selecting a cell
   */
  const handleCellSelect = useCallback(
    (cellIndex: number, event?: React.MouseEvent | React.KeyboardEvent) => {
      if (!notebook) return;
      const isMouseSelection = event?.type.startsWith("mouse") ?? false;
      const selectedId = getCellIdByIndex(notebook, cellIndex);
      if (!selectedId) return;
      const newCursorIndex = cellIndex;

      if (event?.shiftKey && selectionAnchorIndex !== null) {
        setCellCursorId(selectedId);
        const start = Math.min(selectionAnchorIndex, newCursorIndex);
        const end = Math.max(selectionAnchorIndex, newCursorIndex);
        const newSelected = new Set<number>();
        for (let i = start; i <= end; i++) {
          newSelected.add(i);
        }
        setSelectedCellIds(new Set(getCellIdsByIndices(notebook, newSelected)));
      } else if (event?.metaKey || event?.ctrlKey) {
        setSelectedCellIds((prevSelectedIds) => {
          const newSelected = new Set(prevSelectedIds);
          if (newSelected.has(selectedId)) {
            newSelected.delete(selectedId);
          } else {
            newSelected.add(selectedId);
          }
          // Update anchor and cursor based on new selection state
          if (newSelected.size === 1) {
            const singleIndex = Array.from(newSelected)[0];
            setCellCursorId(singleIndex);
            setSelectionAnchorCellId(singleIndex);
          } else if (newSelected.size > 1) {
            setCellCursorId(selectedId); // Cursor is the last clicked one
            // Anchor could be the first item in sorted selection or remain based on prior state
            // For simplicity with ctrl/cmd clicks, let's set anchor to the current cursor if it's now part of selection
            if (newSelected.has(selectedId)) {
              // If multiple selected, set anchor to the earliest selected item in the group containing the cursor.
              // This part can be complex. A simpler approach: if selectionAnchorIndex is not in newSelected, update it.
              if (
                selectionAnchorCellId === null ||
                !newSelected.has(selectionAnchorCellId)
              ) {
                setSelectionAnchorCellId(Array.from(newSelected)[0] ?? null);
              }
            } else if (selectionAnchorCellId === selectedId) {
              // if we just deselected the anchor
              setSelectionAnchorCellId(Array.from(newSelected)[0] ?? null);
            }
          } else {
            // size is 0
            setCellCursorId(null);
            setSelectionAnchorCellId(null);
          }
          return newSelected;
        });
      } else {
        // Normal click
        applySelectionState(singleCellSelection(selectedId));
      }
      // Ensure clicked cell is visible
      // scrollToCell(newCursorIndex);
      if (isMouseSelection) {
        restoreMouseSelectionScroll();
      }
    },
    [
      applySelectionState,
      notebook,
      restoreMouseSelectionScroll,
      selectionAnchorCellId,
      selectionAnchorIndex,
      scrollToCell,
    ],
  );

  /**
   * Handles changes to a cell's editing mode status
   */
  const handleEditingModeChange = useCallback(
    (cellIndex: number, isEditing: boolean) => {
      const cellId = cellIdForIndex(cellIndex);
      if (!cellId) return;
      if (isEditing) {
        restoreMouseSelectionScroll();
      }
      setEditingCellIds((prevEditingIds) => {
        const newEditingIds = new Set(prevEditingIds);
        if (isEditing) {
          newEditingIds.add(cellId);
        } else {
          newEditingIds.delete(cellId);
        }
        return newEditingIds;
      });
    },
    [cellIdForIndex, restoreMouseSelectionScroll],
  );

  const isAnyCellEditing = editingCellIds.size > 0;

  // Effect to sync parent kernel state to local state if needed, or directly use parent state
  // This ensures that if the parent (page.tsx) updates kernel state, NotebookEditor reflects it.
  // This might not be strictly necessary if all kernel interactions are dispatched as events
  // or if the dialogs are also lifted to page.tsx.
  // For now, let's assume dialogs are still managed here and might need this info.
  useEffect(() => {
    if (parentKernelService) {
      // setKernelService(parentKernelService); // If local kernel service state was used
      // Fetch available kernels if service is provided by parent
      const fetchKernels = async () => {
        try {
          const kernels = await parentKernelService.getAvailableKernels();
          setAvailableKernels(kernels);
        } catch (error) {
          console.warn(
            "Failed to fetch available kernels in NotebookEditor:",
            error,
          );
          setAvailableKernels([]); // Default or empty
        }
      };
      fetchKernels();
    }
  }, [parentKernelService]);

  /**
   * Resolves the latest executable source for a cell from editor refs and pending edits.
   */
  const resolveCellExecutionSource = useCallback((cellIndex: number): string => {
    const currentNotebook = notebookRef.current;
    if (
      !currentNotebook ||
      cellIndex < 0 ||
      cellIndex >= currentNotebook.cells.length
    ) {
      return "";
    }

    const cell = currentNotebook.cells[cellIndex];
    const cellId = getCellId(cell);
    const cellRef = cellId ? cellComponentRefs.current.get(cellId) : null;
    if (cellRef) {
      return cellRef.getSource();
    }

    const pendingSource = cellId
      ? pendingCellChangesRef.current.get(cellId)
      : undefined;
    if (pendingSource !== undefined) {
      return pendingSource;
    }

    return Array.isArray(cell.source) ? cell.source.join("") : "";
  }, []);

  /**
   * Prepares the list of { index, source } pairs for execution,
   * resolving the latest source from cell component refs when available.
   */
  const prepareCellsForExecution = useCallback(
    (indices: number[]): { index: number; source: string }[] => {
      const currentNotebook = notebookRef.current;
      if (!currentNotebook) return [];
      return indices
        .filter((idx) => {
          const cell = currentNotebook.cells[idx];
          return cell && cell.cell_type === CellType.CODE;
        })
        .map((idx) => ({
          index: idx,
          source: resolveCellExecutionSource(idx),
        }));
    },
    [resolveCellExecutionSource],
  );

  /**
   * Returns true when the active kernel session can accept execute requests.
   */
  const isKernelAvailableForExecution = useCallback((): boolean => {
    if (!parentKernelService) return false;
    const kernel = parentKernelService.getKernel();
    if (!kernel) return false;
    const status = parentKernelService.getStatus();
    return status !== "dead" && status !== "terminating" && status !== "unknown";
  }, [parentKernelService]);

  /**
   * Processes queued cell runs one batch at a time until the queue is empty.
   */
  const processExecutionQueue = useCallback(async () => {
    const queue = executionQueueRef.current;
    if (queue.isProcessing) return;

    queue.setProcessing(true);
    updateExecutionRunningState();

    try {
      let job = queue.dequeue();
      while (job) {
        if (!parentKernelService || !isKernelAvailableForExecution()) {
          console.warn("Cannot run cell: kernel not available");
          queue.clear();
          break;
        }

        capturePendingCellSources();
        const cellsToRun = prepareCellsForExecution(job.indices);
        if (cellsToRun.length === 0) {
          job = queue.dequeue();
          continue;
        }

        const batchResult = await runCellsBatch({
          kernelService: parentKernelService,
          cells: cellsToRun,
          stopOnError: job.stopOnError,

          onCellStart: (idx) => {
            const source = resolveCellExecutionSource(idx);
            const currentNotebook = notebookRef.current;
            if (!currentNotebook) return;

            const cellId = getCellIdByIndex(currentNotebook, idx);

            setNotebook((prev) => {
              if (!prev || idx < 0 || idx >= prev.cells.length) return prev;
              const prevCell = prev.cells[idx];
              const updatedCell = {
                ...prevCell,
                source: sourceTextToLines(source),
                outputs: [],
                execution_count: null,
              } as any;
              const newCells = prev.cells.slice();
              newCells[idx] = updatedCell;
              return { ...prev, cells: newCells };
            });

            updateExecutionInfo(idx, {
              status: CellExecutionStatus.RUNNING,
              startTime: new Date(),
            });

            if (cellId) {
              modifiedCellsRef.current.add(cellId);
              pendingCellChangesRef.current.set(cellId, source);
            }
            markDirty();
          },

          onCellOutput: (idx, output) => {
            setNotebook((prev) => {
              if (!prev || idx < 0 || idx >= prev.cells.length) return prev;
              const newCells = prev.cells.slice();
              const targetCell = { ...newCells[idx] } as any;
              if (!targetCell.outputs) targetCell.outputs = [];
              targetCell.outputs = [...targetCell.outputs, output];
              newCells[idx] = targetCell;
              return { ...prev, cells: newCells };
            });
          },

          onCellExecutionCount: (idx, count) => {
            setNotebook((prev) => {
              if (!prev || idx < 0 || idx >= prev.cells.length) return prev;
              const newCells = prev.cells.slice();
              const targetCell = { ...newCells[idx] } as any;
              targetCell.execution_count = count;
              newCells[idx] = targetCell;
              return { ...prev, cells: newCells };
            });

            if (parentExecutionCountRef) {
              parentExecutionCountRef.current = count;
            }
          },

          onCellComplete: (idx, result: CellExecutionResult) => {
            updateExecutionInfo(idx, {
              status: result.success
                ? CellExecutionStatus.SUCCESS
                : CellExecutionStatus.ERROR,
              startTime: result.startTime,
              endTime: result.endTime,
              duration: result.duration,
              lastExecuted: result.endTime,
              statistics: {
                wallTime: result.duration,
              },
            });
          },
        });

        if (
          job.stopOnError &&
          job.triggerSource &&
          !batchResult.success
        ) {
          const errorCellIndex = cellsToRun.find(({ index }) => {
            const result = batchResult.results.get(index);
            return result !== undefined && !result.success;
          })?.index;

          if (errorCellIndex !== undefined) {
            window.dispatchEvent(
              new CustomEvent(RUN_ALL_STOPPED_ON_ERROR_EVENT_NAME, {
                detail: {
                  cellIndex: errorCellIndex,
                  triggerSource: job.triggerSource,
                },
              }),
            );
          }
        }

        if (job.stopOnError && !batchResult.success) {
          clearQueuedExecutionStatuses(
            cellsToRun
              .map(({ index }) => index)
              .filter((index) => !batchResult.results.has(index)),
          );
        }

        job = queue.dequeue();
      }
    } catch (error) {
      console.error("Error executing cells:", error);
    } finally {
      queue.setProcessing(false);
      updateExecutionRunningState();
      if (queue.pendingCount > 0) {
        void processExecutionQueue();
      }
    }
  }, [
    parentKernelService,
    parentExecutionCountRef,
    prepareCellsForExecution,
    updateExecutionInfo,
    isKernelAvailableForExecution,
    markDirty,
    clearQueuedExecutionStatuses,
    capturePendingCellSources,
    resolveCellExecutionSource,
    updateExecutionRunningState,
  ]);

  /**
   * Runs a specific cell or selected cells.
   *
   * Requests are enqueued and processed sequentially so rapid triggers are not
   * dropped while the kernel is busy.
   *
   * @param indicesToRun - Cell indices to run. If undefined, runs all selected cells.
   * @param stopOnError - Whether to stop on first cell error. Defaults to true for
   *   batch operations (run all, run all above/below) and false for explicit
   *   multi-select runs.
   */
  const handleRunCell = useCallback(
    (
      indicesToRun?: number[] | number,
      stopOnError = true,
      triggerSource?: RunAllTriggerSource,
    ) => {
      if (!notebook || !isKernelAvailableForExecution()) {
        console.warn("Cannot run cell: kernel not available");
        return;
      }

      let finalIndices: number[];
      if (indicesToRun === undefined) {
        finalIndices = Array.from(selectedCellIndices);
      } else if (typeof indicesToRun === "number") {
        finalIndices = [indicesToRun];
      } else {
        finalIndices = indicesToRun;
      }

      const cellsToRun = prepareCellsForExecution(finalIndices);
      if (cellsToRun.length === 0) return;

      capturePendingCellSources();
      executionQueueRef.current.enqueue({
        indices: finalIndices,
        stopOnError,
        triggerSource,
      });
      markCellsQueued(finalIndices);
      void processExecutionQueue();
    },
    [
      notebook,
      selectedCellIndices,
      isKernelAvailableForExecution,
      prepareCellsForExecution,
      processExecutionQueue,
      markCellsQueued,
      capturePendingCellSources,
    ],
  );

  /**
   * Synchronizes a bound Orion UI control value into the Python runtime without
   * creating a visible notebook output or adding an execution history entry.
   */
  const handleOrionUiStateChange = useCallback(
    async (
      key: string,
      value: OrionUiLocalValue,
      outputId?: string,
    ): Promise<void> => {
      if (!parentKernelService || !parentKernelService.isReady()) {
        return;
      }

      const toPythonJsonLoad = (payload: unknown): string =>
        `_orion_json.loads(${JSON.stringify(JSON.stringify(payload))})`;
      const outputIdExpression =
        outputId === undefined ? "None" : toPythonJsonLoad(outputId);
      const code = [
        "import json as _orion_json",
        "import orion_ui as _orion_ui",
        `_orion_ui._runtime.set_value(${toPythonJsonLoad(key)}, ${toPythonJsonLoad(value)}, output_id=${outputIdExpression})`,
      ].join("\n");

      try {
        const future = await parentKernelService.execute(code, undefined, {
          silent: true,
          storeHistory: false,
        });
        await future.done;
      } catch (error) {
        console.warn("Failed to sync Orion UI state", error);
      }
    },
    [parentKernelService],
  );

  /** Ensures the Python table comm target exists before sending table requests. */
  const ensureOrionUiTableBackend = useCallback(async (): Promise<void> => {
    if (!parentKernelService || !parentKernelService.isReady()) {
      throw new Error("No active kernel is available for table operations.");
    }

    const kernel = parentKernelService.getKernelConnection();
    if (!kernel) {
      throw new Error("No active kernel connection is available.");
    }

    const code = [
      "import orion_ui as _orion_ui",
      "if not hasattr(_orion_ui, '_table_runtime'):",
      "    raise RuntimeError('The active orion_ui package does not include the table backend. Restart the kernel after updating Orion.')",
      "_orion_ui._table_runtime.ensure_comm_target()",
    ].join("\n");

    const future = kernel.requestExecute({
      code,
      silent: true,
      store_history: false,
    });
    const reply = await future.done;
    if (reply.content.status !== "ok") {
      const content = reply.content as { evalue?: string };
      throw new Error(content.evalue ?? "Failed to prepare the Orion table backend.");
    }
  }, [parentKernelService]);

  /**
   * Sends one Orion UI table operation to the Python table runtime through a
   * short-lived Jupyter comm and returns the validated result body.
   */
  const handleOrionUiTableRequest = useCallback(
    async (request: OrionTableRequest): Promise<OrionTableCommResponse> => {
      if (!parentKernelService || !parentKernelService.isReady()) {
        throw new Error("No active kernel is available for table operations.");
      }

      await ensureOrionUiTableBackend();

      const kernel = parentKernelService.getKernelConnection();
      if (!kernel) {
        throw new Error("No active kernel connection is available.");
      }

      const requestId = `orion-table-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const comm = kernel.createComm(ORION_TABLE_COMM_TARGET);

      return await new Promise<OrionTableCommResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          try {
            comm.close();
          } catch {
            // The comm may already be closed by Jupyter.
          }
          reject(new Error("Timed out waiting for the Orion table backend."));
        }, 15_000);

        comm.onMsg = (msg) => {
          const parsed = OrionTableCommEnvelopeSchema.safeParse(
            msg.content.data,
          );
          if (!parsed.success || parsed.data.requestId !== requestId) {
            return;
          }

          clearTimeout(timeout);
          try {
            comm.close();
          } catch {
            // The comm may already be closed by Jupyter.
          }

          if (!parsed.data.ok) {
            reject(new Error(parsed.data.error ?? "Table operation failed."));
            return;
          }

          resolve(parsed.data.result);
        };

        comm.open().done
          .then(() => {
            const payload = JSON.parse(
              JSON.stringify({ ...request, requestId }),
            ) as Parameters<typeof comm.send>[0];
            comm.send(payload);
          })
          .catch((error: unknown) => {
            clearTimeout(timeout);
            reject(
              error instanceof Error
                ? error
                : new Error("Failed to open Orion table comm."),
            );
          });
      });
    },
    [ensureOrionUiTableBackend, parentKernelService],
  );

  /** Persists Orion UI table metadata for an output rendered outside NotebookCell. */
  const handleOrionUiTableMetadataChange = useCallback(
    (
      cellIndex: number,
      outputIndex: number,
      tableMetadata: OrionTableOutputMetadata,
    ) => {
      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        return setNotebookOutputTableMetadata(
          prevNotebook,
          cellIndex,
          outputIndex,
          tableMetadata as unknown as Record<string, unknown>,
        );
      });

      const cellId = cellIdForIndex(cellIndex);
      const source = notebookRef.current?.cells[cellIndex]?.source.join("") ?? "";
      if (cellId) {
        pendingCellChangesRef.current.set(cellId, source);
      }
      markDirty();
    },
    [cellIdForIndex, markDirty],
  );

  /**
   * Handles declarative actions emitted by Orion UI buttons.
   */
  const handleOrionUiAction = useCallback(
    (action: unknown): void => {
      if (!notebook || !isRecord(action)) {
        return;
      }

      if (action.type === "execute_cells" && Array.isArray(action.cellIds)) {
        const indices = action.cellIds
          .filter((cellId): cellId is string => typeof cellId === "string")
          .map((cellId) => getCellIndexById(notebook, cellId))
          .filter((index) => index >= 0);

        if (indices.length > 0) {
          void handleRunCell(indices, true);
        }
      }
    },
    [handleRunCell, notebook],
  );

  /**
   * Runs all code cells in the notebook sequentially.
   *
   * @param stopOnError - If true (default), stops on first cell error
   *   (matching Jupyter Notebook v7 behavior). If false, continues
   *   executing remaining cells regardless of errors.
   */
  const handleRunAll = useCallback(
    (stopOnError = true, triggerSource?: RunAllTriggerSource) => {
      if (!notebook) return;
      const allIndices = notebook.cells
        .map((cell, idx) => (cell.cell_type === CellType.CODE ? idx : -1))
        .filter((idx) => idx !== -1);
      handleRunCell(allIndices, stopOnError, triggerSource);
    },
    [notebook, handleRunCell],
  );

  // Listen for runAllCells events from the toolbar
  useEffect(() => {
    const handleRunAllCellsEvent = (e: Event) => {
      const detail = (e as CustomEvent<RunAllCellsEventDetail>).detail;
      const stopOnError = detail?.stopOnError ?? true;
      const triggerSource = detail?.triggerSource;
      handleRunAll(stopOnError, triggerSource);
    };

    window.addEventListener(
      RUN_ALL_CELLS_EVENT_NAME,
      handleRunAllCellsEvent as EventListener,
    );

    return () => {
      window.removeEventListener(
        RUN_ALL_CELLS_EVENT_NAME,
        handleRunAllCellsEvent as EventListener,
      );
    };
  }, [handleRunAll]);

  // Scroll to a cell when the toolbar go-to-error popover is clicked.
  useEffect(() => {
    const handleScrollToCell = (e: Event) => {
      const { cellIndex } = (e as CustomEvent<ScrollToNotebookCellEventDetail>)
        .detail;
      const currentNotebook = notebookRef.current;
      if (
        cellIndex < 0 ||
        !currentNotebook ||
        cellIndex >= currentNotebook.cells.length
      ) {
        return;
      }

      if (activeNotebookView !== "notebook") {
        pendingScrollToCellIndexRef.current = cellIndex;
        onActiveNotebookViewChange?.("notebook");
        return;
      }

      scrollToCellIndexFromEvent(cellIndex);
    };

    window.addEventListener(
      SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
      handleScrollToCell as EventListener,
    );

    return () => {
      window.removeEventListener(
        SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
        handleScrollToCell as EventListener,
      );
    };
  }, [
    activeNotebookView,
    onActiveNotebookViewChange,
    scrollToCellIndexFromEvent,
  ]);

  // Finish scrolling after switching from app view to notebook view.
  useEffect(() => {
    if (activeNotebookView !== "notebook") return;

    const cellIndex = pendingScrollToCellIndexRef.current;
    if (cellIndex === null) return;

    pendingScrollToCellIndexRef.current = null;
    scrollToCellIndexFromEvent(cellIndex);
  }, [activeNotebookView, scrollToCellIndexFromEvent]);

  // Clear pending runs when the user interrupts the kernel.
  useEffect(() => {
    const handleClearExecutionQueue = () => {
      executionQueueRef.current.clear();
      clearQueuedExecutionStatuses();
      updateExecutionRunningState();
    };

    window.addEventListener(
      "clearCellExecutionQueue",
      handleClearExecutionQueue as EventListener,
    );

    return () => {
      window.removeEventListener(
        "clearCellExecutionQueue",
        handleClearExecutionQueue as EventListener,
      );
    };
  }, [clearQueuedExecutionStatuses, updateExecutionRunningState]);

  /**
   * Handles kernel selection
   */
  const handleKernelSelect = useCallback(
    async (kernel: any) => {
      if (kernel === "new") {
        setShowKernelDialog(true);
      } else if (kernel === "url") {
        setConnectionError(""); // Clear local error state for dialog
        setShowConnectionDialog(true);
      } else if (kernel === "running") {
        setShowRunningKernelDialog(true);
      } else if (
        parentSetCurrentKernel &&
        parentSetKernelStatus &&
        parentKernelService
      ) {
        try {
          parentSetKernelStatus("connecting");
          await parentKernelService.startKernel(
            kernel.name,
            filepath || undefined,
          );
          parentSetCurrentKernel(kernel);
          parentSetKernelStatus("connected");
          if (parentExecutionCountRef) parentExecutionCountRef.current = 0;
        } catch (error) {
          console.error("Error starting kernel:", error);
          parentSetKernelStatus("disconnected");
          parentSetCurrentKernel(null);
        }
      }
    },
    [
      parentKernelService,
      filepath,
      parentSetCurrentKernel,
      parentSetKernelStatus,
      parentExecutionCountRef,
    ],
  );

  /**
   * Handles starting a new kernel from the dialog
   */
  const handleStartKernel = useCallback(
    async (kernel: any) => {
      if (
        !parentKernelService ||
        !parentSetCurrentKernel ||
        !parentSetKernelStatus
      )
        return;

      try {
        parentSetKernelStatus("connecting");
        await parentKernelService.startKernel(
          kernel.name,
          filepath || undefined,
        );
        parentSetCurrentKernel(kernel);
        parentSetKernelStatus("connected");
        setShowKernelDialog(false);
        if (parentExecutionCountRef) parentExecutionCountRef.current = 0;
      } catch (error) {
        console.error("Error starting kernel:", error);
        parentSetKernelStatus("disconnected");
        parentSetCurrentKernel(null);
      }
    },
    [
      parentKernelService,
      filepath,
      parentSetCurrentKernel,
      parentSetKernelStatus,
      parentExecutionCountRef,
    ],
  );

  /**
   * Handles connecting to a running kernel
   */
  const handleConnectToRunningKernel = useCallback(
    async (kernelId: string) => {
      if (
        !parentKernelService ||
        !parentSetCurrentKernel ||
        !parentSetKernelStatus
      )
        return;

      try {
        parentSetKernelStatus("connecting");
        await parentKernelService.connectToKernel(kernelId);
        const kernelInfo = parentKernelService.getInfo();
        parentSetCurrentKernel(kernelInfo as any); // TODO: Fix type assertion
        parentSetKernelStatus("connected");
        setShowRunningKernelDialog(false);
        if (parentExecutionCountRef) parentExecutionCountRef.current = 0;
      } catch (error) {
        console.error("Error connecting to running kernel:", error);
        parentSetKernelStatus("disconnected");
        parentSetCurrentKernel(null);
      }
    },
    [
      parentKernelService,
      parentSetCurrentKernel,
      parentSetKernelStatus,
      parentExecutionCountRef,
    ],
  );

  /**
   * Handles connecting to a kernel via URL
   */
  const handleConnectToKernel = useCallback(
    async (url: string, token?: string) => {
      // This function will be called by the KernelConnectionDialog
      // It needs to communicate the URL and token to the parent (page.tsx)
      // For now, let's assume page.tsx handles this through its own dialog trigger
      // or this dialog is also lifted. If this dialog stays, it needs to call a prop from parent.
      // For simplicity now, this might be less used if page.tsx handles the dialog directly.
      // However, if this dialog is to remain and initiate connection, it should use parent service setters.
      if (
        !parentKernelService ||
        !parentSetCurrentKernel ||
        !parentSetKernelStatus
      ) {
        console.warn(
          "Kernel service connection handlers not provided from parent.",
        );
        // Potentially show local error or rely on parent to manage connection flow
        setConnectionError(
          "Cannot initiate connection: Parent service not configured.",
        );
        return;
      }
      // The actual connection logic is now in page.tsx (handleConnectToKernelUrlDialog)
      // This component should not create a new KernelService instance directly anymore.
      // It should either trigger a function passed from page.tsx or page.tsx should handle the dialogs.

      // For now, let's just update the local error state if the dialog is shown from here.
      // The actual connection logic is managed by `handleConnectToKernelUrlDialog` in `page.tsx`
      // This local `handleConnectToKernel` is primarily for the dialog `onConnect` prop if the dialog
      // is managed here. It seems there's a duplication of connection dialogs/logic.
      // Let's assume the parent `page.tsx` handles the dialog and connection attempt, so this function
      // might become redundant or simplified to just opening the parent's dialog.
      console.warn(
        "handleConnectToKernel in NotebookEditor called. This should be handled by page.tsx",
      );
      // If connectionError is for the local dialog:
      // setConnectionError("Connection attempt should be handled by the main page.");
    },
    [parentKernelService, parentSetCurrentKernel, parentSetKernelStatus], // Dependencies reflect reliance on parent setters
  );

  /**
   * Moves a cell up/down in the notebook
   */
  const handleMoveCell = useCallback(
    (cellIndexToMove: number, direction: "up" | "down") => {
      if (!notebook) return;
      const cellId = getCellIdByIndex(notebook, cellIndexToMove);
      if (!cellId) return;

      const result = moveCellById(
        applyPendingChanges(notebook),
        cellId,
        direction,
      );
      setNotebook(result.notebook);
      applySelectionState(result.selection);
      modifiedCellsRef.current.add(cellId);
      markDirty();
      scrollToCellIdAfterLayout(cellId, direction === "up" ? "start" : "end");
    },
    [
      applyPendingChanges,
      applySelectionState,
      notebook,
      scrollToCellIdAfterLayout,
      markDirty,
    ],
  );

  /**
   * Copies selected cells, or explicit target cells when invoked from a cell action.
   */
  const handleCopySelectedCellsToClipboard = useCallback(
    (indicesToCopy?: number[]) => {
      const targetIndices = indicesToCopy ?? Array.from(selectedCellIndices);
      if (!notebook || targetIndices.length === 0) return;
      const notebookWithChanges = applyPendingChanges(notebook);
      const cellsToCopy = targetIndices
        .sort((a, b) => a - b)
        .map((index) =>
          JSON.parse(JSON.stringify(notebookWithChanges.cells[index])),
        );
      setCopiedCells(cellsToCopy);
    },
    [applyPendingChanges, notebook, selectedCellIndices],
  );

  /**
   * Deletes selected cells, or explicit target cells when invoked from a cell action.
   */
  const handleDeleteSelectedCells = useCallback(
    (indicesToDelete?: number[]) => {
      const targetIndices = indicesToDelete ?? Array.from(selectedCellIndices);
      if (!notebook || targetIndices.length === 0) return;
      const targetIds = getCellIdsByIndices(notebook, targetIndices);
      if (targetIds.length === 0) return;
      const cursorForDelete = indicesToDelete
        ? (targetIds[0] ?? cellCursorId)
        : cellCursorId;
      const notebookWithChanges = applyPendingChanges(notebook);
      const deletedSnapshots = targetIds
        .map((cellId) => {
          const index = getCellIndexById(notebookWithChanges, cellId);
          if (index === -1) return null;
          return {
            index,
            cell: JSON.parse(
              JSON.stringify(notebookWithChanges.cells[index]),
            ) as NotebookCellType,
          } satisfies DeletedCellSnapshot;
        })
        .filter((snapshot): snapshot is DeletedCellSnapshot => snapshot !== null);
      const result = deleteCellsById(
        notebookWithChanges,
        targetIds,
        cursorForDelete,
      );
      if (deletedSnapshots.length > 0) {
        deletedCellHistoryRef.current = [
          ...deletedCellHistoryRef.current,
          deletedSnapshots,
        ].slice(-50);
      }
      for (const cellId of targetIds) {
        pendingCellChangesRef.current.delete(cellId);
        modifiedCellsRef.current.delete(cellId);
        cellComponentRefs.current.delete(cellId);
        cellRefs.current.delete(cellId);
      }
      setNotebook(result.notebook);
      applySelectionState(result.selection);
      markDirty();

      const nextCellId = result.selection.cellCursorId;
      if (nextCellId !== null) {
        scrollToCellIdAfterLayout(nextCellId);
      }
    },
    [
      notebook,
      selectedCellIndices,
      cellCursorId,
      scrollToCellIdAfterLayout,
      applyPendingChanges,
      applySelectionState,
      markDirty,
    ],
  );

  /** Restores the most recent batch of deleted cells. */
  const handleRestoreDeletedCells = useCallback(() => {
    if (!notebook || deletedCellHistoryRef.current.length === 0) return;

    const nextHistory = deletedCellHistoryRef.current.slice();
    const snapshots = nextHistory.pop();
    deletedCellHistoryRef.current = nextHistory;
    if (!snapshots || snapshots.length === 0) return;

    const result = restoreCellsByOriginalIndex(
      applyPendingChanges(notebook),
      snapshots,
      createCellId,
    );
    setNotebook(result.notebook);
    applySelectionState(result.selection);
    for (const cellId of result.restoredCellIds) {
      modifiedCellsRef.current.add(cellId);
    }
    markDirty();

    const firstRestoredCellId = result.restoredCellIds[0];
    if (firstRestoredCellId) {
      scrollToCellIdAfterLayout(firstRestoredCellId);
    }
  }, [
    applyPendingChanges,
    applySelectionState,
    notebook,
    scrollToCellIdAfterLayout,
    markDirty,
  ]);

  /**
   * Adds a new cell above or below the current cell
   */
  const handleAddCell = useCallback(
    (
      baseIndex: number | null, // Can be null if notebook is empty
      position: "above" | "below",
      cellType: CellType = CellType.CODE,
    ) => {
      if (!notebook) return null;
      const result = insertCellById(
        applyPendingChanges(notebook),
        getCellIdByIndex(notebook, baseIndex),
        position,
        cellType,
        createCellId,
      );
      setNotebook(result.notebook);
      applySelectionState(result.selection);
      markDirty();
      return {
        index: getCellIndexById(result.notebook, result.insertedCellId),
        cellId: result.insertedCellId,
      } satisfies AddedCellResult;
    },
    [applyPendingChanges, applySelectionState, notebook, markDirty],
  );

  /**
   * Changes the type of selected cells
   */
  const handleChangeCellTypes = useCallback(
    (indicesToChange: number[], targetType: CellType) => {
      if (!notebook || indicesToChange.length === 0) return;
      const targetIds = getCellIdsByIndices(notebook, indicesToChange);
      const result = changeCellTypesById(
        applyPendingChanges(notebook),
        targetIds,
        targetType,
      );
      for (const cellId of result.changedCellIds) {
        modifiedCellsRef.current.add(cellId);
      }
      if (result.changedCellIds.length > 0) {
        setNotebook(result.notebook);
        applySelectionState(result.selection);
        markDirty();
      }
    },
    [applyPendingChanges, applySelectionState, notebook, markDirty],
  );

  /**
   * Handles cell actions from the action bar (buttons on the cell)
   */
  const handleCellAction = useCallback(
    (action: string, cellIndexFromAction: number) => {
      if (!notebook) return;
      const currentCellType =
        notebook.cells[cellIndexFromAction]?.cell_type || CellType.CODE;
      const actionCellId = getCellIdByIndex(notebook, cellIndexFromAction);
      if (!actionCellId) return;
      // Ensure the action targets the clicked cell by setting selection and cursor
      applySelectionState(singleCellSelection(actionCellId));
      setTimeout(() => scrollToCell(cellIndexFromAction), 0); // Ensure it is visible

      switch (action) {
        case "run":
          handleRunCell([cellIndexFromAction]);
          break;
        case "run-and-advance":
          handleRunCell([cellIndexFromAction]);
          {
            const nextCellIndex = cellIndexFromAction + 1;
            if (nextCellIndex < notebook.cells.length) {
              selectCellByIndex(nextCellIndex);
              setTimeout(() => scrollToCell(nextCellIndex), 0);
            } else {
              const newAddedCell = handleAddCell(
                cellIndexFromAction,
                "below",
                CellType.CODE,
              );
              if (newAddedCell !== null && newAddedCell.index !== -1) {
                scrollToCellIdAfterLayout(newAddedCell.cellId, "end");
              }
            }
          }
          break;
        case "run-all-above":
          const aboveIndices = Array.from(
            { length: cellIndexFromAction },
            (_, i) => i,
          );
          const codeIndicesAbove = notebook.cells
            .map((cell, idx) =>
              cell.cell_type === CellType.CODE && aboveIndices.includes(idx)
                ? idx
                : -1,
            )
            .filter((idx) => idx !== -1);
          handleRunCell(codeIndicesAbove);
          break;
        case "run-cell-and-below":
          const belowIndices = Array.from(
            { length: notebook.cells.length - cellIndexFromAction },
            (_, i) => i + cellIndexFromAction,
          );
          const codeIndicesBelow = notebook.cells
            .map((cell, idx) =>
              cell.cell_type === CellType.CODE && belowIndices.includes(idx)
                ? idx
                : -1,
            )
            .filter((idx) => idx !== -1);
          handleRunCell(codeIndicesBelow);
          break;
        case "move-up":
          handleMoveCell(cellIndexFromAction, "up");
          break;
        case "move-down":
          handleMoveCell(cellIndexFromAction, "down");
          break;
        case "duplicate-cell": // This is effectively duplicate cell from action bar
          {
            const result = duplicateCellById(
              applyPendingChanges(notebook),
              actionCellId,
              createCellId,
            );
            setNotebook(result.notebook);
            applySelectionState(result.selection);
            markDirty();
            const duplicatedCellId = result.duplicatedCellId;
            if (duplicatedCellId) {
              scrollToCellIdAfterLayout(duplicatedCellId, "end");
            }
          }
          break;
        case "copy-cell":
          handleCopySelectedCellsToClipboard([cellIndexFromAction]);
          break;
        case "delete":
          handleDeleteSelectedCells([cellIndexFromAction]);
          break;
        case "cut-cell":
          handleCopySelectedCellsToClipboard([cellIndexFromAction]);
          handleDeleteSelectedCells([cellIndexFromAction]);
          break;
        case "add-cell": // Add below
          const newCellBelow = handleAddCell(
            cellIndexFromAction,
            "below",
            currentCellType,
          );
          if (newCellBelow !== null && newCellBelow.index !== -1) {
            scrollToCellIdAfterLayout(newCellBelow.cellId, "end");
          }
          break;
        case "add-cell-above":
          const newCellAbove = handleAddCell(
            cellIndexFromAction,
            "above",
            currentCellType,
          );
          if (newCellAbove !== null && newCellAbove.index !== -1) {
            scrollToCellIdAfterLayout(newCellAbove.cellId, "start");
          }
          break;
        case "change-type":
          const targetType =
            currentCellType === CellType.CODE
              ? CellType.MARKDOWN
              : CellType.CODE;
          handleChangeCellTypes([cellIndexFromAction], targetType);
          break;
        case "mute-cell":
          handleChangeCellTypes([cellIndexFromAction], CellType.RAW);
          break;
        case "unmute-cell":
          handleChangeCellTypes([cellIndexFromAction], CellType.CODE);
          break;
        case "toggle-app-view":
          capturePendingCellSources();
          setNotebook((prevNotebook) => {
            if (!prevNotebook) return null;

            const notebookWithChanges = applyPendingChanges(prevNotebook);
            const currentCell = notebookWithChanges.cells[cellIndexFromAction];
            if (!currentCell) return prevNotebook;

            const isCodeCell = currentCell.cell_type === CellType.CODE;
            if (isCodeCell && !currentCell.outputs?.length) {
              return notebookWithChanges;
            }

            const references: NotebookAppViewReference[] = isCodeCell
              ? currentCell.outputs!.map((_, outputIndex) => ({
                  kind: "output",
                  cellIndex: cellIndexFromAction,
                  outputIndex,
                }))
              : [{ kind: "markdown", cellIndex: cellIndexFromAction }];
            const allReferencesPresent = references.every((reference) =>
              isNotebookAppViewReferenceInNotebook(
                notebookWithChanges,
                reference,
              ),
            );

            return references.reduce(
              (nextNotebook, reference) =>
                allReferencesPresent
                  ? removeNotebookAppViewReference(nextNotebook, reference)
                  : addNotebookAppViewReference(nextNotebook, reference),
              notebookWithChanges,
            );
          });
          markDirty();
          break;
        case "clear-outputs":
          setNotebook((prevNotebook) => {
            if (!prevNotebook) return null;
            if (
              !prevNotebook.cells[cellIndexFromAction] ||
              prevNotebook.cells[cellIndexFromAction].cell_type !==
              CellType.CODE
            )
              return prevNotebook;
            const cells = prevNotebook.cells.slice();
            const updatedCell: any = { ...cells[cellIndexFromAction] };
            updatedCell.outputs = [];
            updatedCell.execution_count = null;
            cells[cellIndexFromAction] = updatedCell;
            return { ...prevNotebook, cells };
          });
          break;
        default:
          // Handle actions with parameters (e.g., "clear-single-output:0")
          if (action.startsWith("clear-single-output:")) {
            const outputIndex = parseInt(action.split(":")[1], 10);
            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;
              const cells = prevNotebook.cells.slice();
              const cell = cells[cellIndexFromAction] as any;
              if (cell && cell.outputs && cell.outputs[outputIndex]) {
                const newOutputs = cell.outputs.slice();
                newOutputs.splice(outputIndex, 1);
                cells[cellIndexFromAction] = { ...cell, outputs: newOutputs };
                return { ...prevNotebook, cells } as any;
              }
              return prevNotebook;
            });
          } else if (action.startsWith("toggle-output-app-view:")) {
            const outputIndex = parseInt(action.split(":")[1], 10);
            if (Number.isNaN(outputIndex)) {
              return;
            }

            capturePendingCellSources();
            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;

              const notebookWithChanges = applyPendingChanges(prevNotebook);
              const currentCell =
                notebookWithChanges.cells[cellIndexFromAction];
              if (
                !currentCell ||
                currentCell.cell_type !== CellType.CODE ||
                !currentCell.outputs?.[outputIndex]
              ) {
                return notebookWithChanges;
              }

              const reference: NotebookAppViewReference = {
                kind: "output",
                cellIndex: cellIndexFromAction,
                outputIndex,
              };
              return isNotebookAppViewReferenceInNotebook(
                notebookWithChanges,
                reference,
              )
                ? removeNotebookAppViewReference(notebookWithChanges, reference)
                : addNotebookAppViewReference(notebookWithChanges, reference);
            });
            markDirty();
          } else if (action.startsWith("hide-single-output:")) {
            const outputIndex = parseInt(action.split(":")[1], 10);
            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;
              const cells = prevNotebook.cells.slice();
              const cell = cells[cellIndexFromAction] as any;
              if (cell && cell.outputs && cell.outputs[outputIndex]) {
                const out = { ...cell.outputs[outputIndex] } as any;
                out.metadata = out.metadata || {};
                out.metadata.orion = {
                  ...(out.metadata.orion || {}),
                  hidden: true,
                };
                const newOutputs = cell.outputs.slice();
                newOutputs[outputIndex] = out;
                cells[cellIndexFromAction] = { ...cell, outputs: newOutputs };
                return { ...prevNotebook, cells } as any;
              }
              return prevNotebook;
            });
          } else if (action.startsWith("unhide-single-output:")) {
            const outputIndex = parseInt(action.split(":")[1], 10);
            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;
              const cells = prevNotebook.cells.slice();
              const cell = cells[cellIndexFromAction] as any;
              if (cell && cell.outputs && cell.outputs[outputIndex]) {
                const out = { ...cell.outputs[outputIndex] } as any;
                if (out.metadata?.orion) {
                  const newOrion = { ...out.metadata.orion } as any;
                  delete newOrion.hidden;
                  if (Object.keys(newOrion).length === 0) {
                    const newMeta = { ...out.metadata } as any;
                    delete newMeta.orion;
                    out.metadata = Object.keys(newMeta).length
                      ? newMeta
                      : undefined;
                  } else {
                    out.metadata = { ...(out.metadata || {}), orion: newOrion };
                  }
                }
                const newOutputs = cell.outputs.slice();
                newOutputs[outputIndex] = out;
                cells[cellIndexFromAction] = { ...cell, outputs: newOutputs };
                return { ...prevNotebook, cells } as any;
              }
              return prevNotebook;
            });
          } else if (action.startsWith("set-output-collapsed:")) {
            const [, outputIndexStr, collapsedStr] = action.split(":");
            const outputIndex = parseInt(outputIndexStr, 10);
            const collapsed = collapsedStr === "true";
            if (Number.isNaN(outputIndex)) {
              return;
            }

            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;
              const cells = prevNotebook.cells.slice();
              const cell = cells[cellIndexFromAction] as any;
              if (cell && cell.outputs && cell.outputs[outputIndex]) {
                const out = { ...cell.outputs[outputIndex] } as any;
                out.metadata = out.metadata || {};
                out.metadata.orion = {
                  ...(out.metadata.orion || {}),
                  isCollapsed: collapsed,
                };
                const newOutputs = cell.outputs.slice();
                newOutputs[outputIndex] = out;
                cells[cellIndexFromAction] = { ...cell, outputs: newOutputs };
                return { ...prevNotebook, cells } as any;
              }
              return prevNotebook;
            });
            modifiedCellsRef.current.add(actionCellId);
            markDirty();
          }
          break;
      }
    },
    [
      notebook,
      handleRunCell,
      handleMoveCell,
      handleDeleteSelectedCells,
      handleCopySelectedCellsToClipboard,
      handleAddCell,
      handleChangeCellTypes,
      scrollToCell,
      scrollToCellIdAfterLayout,
      capturePendingCellSources,
      applyPendingChanges,
      markDirty,
    ],
  );

  /**
   * Requests that the right-sidebar chat composer attach this notebook cell.
   */
  const handleMentionCell = useCallback(
    (cellIndex: number) => {
      const cellId = cellIdForIndex(cellIndex);
      const source =
        (cellId ? pendingCellChangesRef.current.get(cellId) : undefined) ??
        notebook?.cells[cellIndex]?.source.join("") ??
        "";
      window.dispatchEvent(
        new CustomEvent("orion:mention-notebook-cell", {
          detail: {
            notebookPath: filepath,
            cellIndex,
            preview: source,
          },
        }),
      );
    },
    [cellIdForIndex, filepath, notebook?.cells],
  );

  /** Removes a markdown cell or output from App View metadata. */
  const handleRemoveAppViewReference = useCallback(
    (reference: NotebookAppViewReference) => {
      capturePendingCellSources();
      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        return removeNotebookAppViewReference(
          applyPendingChanges(prevNotebook),
          reference,
        );
      });
      markDirty();
    },
    [applyPendingChanges, capturePendingCellSources, markDirty],
  );

  /** Restores a markdown cell or output that was just removed from App View metadata. */
  const handleRestoreAppViewReference = useCallback(
    (reference: NotebookAppViewReference) => {
      capturePendingCellSources();
      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        return addNotebookAppViewReference(
          applyPendingChanges(prevNotebook),
          reference,
        );
      });
      markDirty();
    },
    [applyPendingChanges, capturePendingCellSources, markDirty],
  );

  // Effect for handling global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!notebook) return; // Wait for notebook to be loaded
      if (activeNotebookView !== "notebook") return;
      if (event.defaultPrevented) return;
      if (!isNotebookKeyboardScope(event, notebookRootRef.current)) return;

      const activeElement = document.activeElement as HTMLElement;
      const isInputFocused =
        isEditableKeyboardTarget(event.target) ||
        isEditableKeyboardTarget(activeElement);

      if (isAnyCellEditing || (isInputFocused && event.key !== "Escape")) {
        if (event.key === "Escape") {
          const editingCellId =
            (cellCursorId !== null && editingCellIds.has(cellCursorId)
              ? cellCursorId
              : Array.from(editingCellIds)[0]) ??
            cellCursorId;
          activeElement?.blur();
          focusNotebookCommandTarget(editingCellId);
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const N_CELLS = notebook.cells.length;
      if (event.key === "Escape") {
        applySelectionState({
          selectedCellIds: new Set(),
          selectionAnchorCellId: null,
          cellCursorId: null,
        });
        const mainContentArea = document.querySelector(
          ".notebook-editor-content-area",
        ) as HTMLElement;
        if (mainContentArea) mainContentArea.focus();
        event.preventDefault();
        return;
      }

      if (
        event.key.toLowerCase() === "h" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        setShowNotebookShortcutsDialog(true);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        N_CELLS === 0 &&
        !["a", "A", "b", "B", "v", "V", "z", "Z"].includes(event.key)
      ) {
        // If no cells, only allow add, paste, or restore operations.
        if (event.key !== "Escape") event.preventDefault(); // Prevent other defaults if no cells
        return;
      }

      let preventDefault = true;
      const D_DOUBLE_PRESS_TIMEOUT = 400;

      // Current cursor position (or 0 if null and there are cells)
      const currentCursor = cellCursorIndex ?? (N_CELLS > 0 ? 0 : -1);
      if (
        currentCursor === -1 &&
        !["a", "A", "b", "B", "v", "V", "z", "Z"].includes(event.key)
      ) {
        // Should not happen if N_CELLS > 0 check above is working, but as a safe guard.
        return;
      }

      let nextCursorIndex = currentCursor;
      let currentAnchorIndex = selectionAnchorIndex;
      let newSelectedIndices = new Set(selectedCellIndices);
      let scrollTargetIndex: number | null = null;
      let scrollTargetCellId: CellId | null = null;
      let scrollAlignment: CellScrollAlignment = "start";
      const applyIndexSelection = (
        cursorIndex: number | null,
        anchorIndex: number | null,
        selectedIndices: Iterable<number>,
      ) => {
        setCellCursorId(getCellIdByIndex(notebook, cursorIndex));
        setSelectionAnchorCellId(getCellIdByIndex(notebook, anchorIndex));
        setSelectedCellIds(
          new Set(getCellIdsByIndices(notebook, selectedIndices)),
        );
      };

      const isOptionOnlyShortcut =
        event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey;

      if (isOptionOnlyShortcut) {
        if (event.code === "KeyA") {
          const codeIndicesAbove = notebook.cells
            .map((cell, idx) =>
              cell.cell_type === CellType.CODE && idx < currentCursor
                ? idx
                : -1,
            )
            .filter((idx) => idx !== -1);
          handleRunCell(codeIndicesAbove);
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.code === "KeyB") {
          const codeIndicesBelow = notebook.cells
            .map((cell, idx) =>
              cell.cell_type === CellType.CODE && idx >= currentCursor
                ? idx
                : -1,
            )
            .filter((idx) => idx !== -1);
          handleRunCell(codeIndicesBelow);
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.code === "ArrowUp" || event.code === "ArrowDown") {
          handleMoveCell(
            currentCursor,
            event.code === "ArrowUp" ? "up" : "down",
          );
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      switch (event.key) {
        case "ArrowUp":
          nextCursorIndex = Math.max(0, currentCursor - 1);
          if (event.shiftKey) {
            if (currentAnchorIndex === null) currentAnchorIndex = currentCursor; // Start selection from current cursor
            newSelectedIndices.clear();
            const start = Math.min(currentAnchorIndex, nextCursorIndex);
            const end = Math.max(currentAnchorIndex, nextCursorIndex);
            for (let i = start; i <= end; i++) newSelectedIndices.add(i);
          } else {
            newSelectedIndices.clear();
            newSelectedIndices.add(nextCursorIndex);
            currentAnchorIndex = nextCursorIndex; // Reset anchor
          }
          applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
          scrollTargetIndex = nextCursorIndex;
          scrollAlignment = "start";
          break;

        case "ArrowDown":
          nextCursorIndex = Math.min(N_CELLS - 1, currentCursor + 1);
          if (event.shiftKey) {
            if (currentAnchorIndex === null) currentAnchorIndex = currentCursor; // Start selection
            newSelectedIndices.clear();
            const start = Math.min(currentAnchorIndex, nextCursorIndex);
            const end = Math.max(currentAnchorIndex, nextCursorIndex);
            for (let i = start; i <= end; i++) newSelectedIndices.add(i);
          } else {
            newSelectedIndices.clear();
            newSelectedIndices.add(nextCursorIndex);
            currentAnchorIndex = nextCursorIndex; // Reset anchor
          }
          applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
          scrollTargetIndex = nextCursorIndex;
          scrollAlignment = "end";
          break;

        case "PageUp":
          nextCursorIndex = Math.max(0, currentCursor - 10); // Example: 10 cells up
          // Similar shift/non-shift logic as ArrowUp
          if (event.shiftKey) {
            if (currentAnchorIndex === null) currentAnchorIndex = currentCursor;
            newSelectedIndices.clear();
            const start = Math.min(currentAnchorIndex, nextCursorIndex);
            const end = Math.max(currentAnchorIndex, nextCursorIndex);
            for (let i = start; i <= end; i++) newSelectedIndices.add(i);
          } else {
            newSelectedIndices.clear();
            newSelectedIndices.add(nextCursorIndex);
            currentAnchorIndex = nextCursorIndex;
          }
          applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
          scrollTargetIndex = nextCursorIndex;
          scrollAlignment = "start";
          break;

        case "PageDown":
          nextCursorIndex = Math.min(N_CELLS - 1, currentCursor + 10); // Example: 10 cells down
          if (event.shiftKey) {
            if (currentAnchorIndex === null) currentAnchorIndex = currentCursor;
            newSelectedIndices.clear();
            const start = Math.min(currentAnchorIndex, nextCursorIndex);
            const end = Math.max(currentAnchorIndex, nextCursorIndex);
            for (let i = start; i <= end; i++) newSelectedIndices.add(i);
          } else {
            newSelectedIndices.clear();
            newSelectedIndices.add(nextCursorIndex);
            currentAnchorIndex = nextCursorIndex;
          }
          applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
          scrollTargetIndex = nextCursorIndex;
          scrollAlignment = "end";
          break;

        case "Home":
          if (event.ctrlKey || event.metaKey) {
            // Ctrl/Cmd + Home: Jump to first cell
            nextCursorIndex = 0;
            if (event.shiftKey) {
              // And select range to it
              if (currentAnchorIndex === null)
                currentAnchorIndex = currentCursor;
              newSelectedIndices.clear();
              const start = Math.min(currentAnchorIndex, nextCursorIndex);
              const end = Math.max(currentAnchorIndex, nextCursorIndex);
              for (let i = start; i <= end; i++) newSelectedIndices.add(i);
            } else {
              newSelectedIndices.clear();
              newSelectedIndices.add(nextCursorIndex);
              currentAnchorIndex = nextCursorIndex;
            }
            applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
            scrollTargetIndex = nextCursorIndex;
            scrollAlignment = "start";
          }
          // Simple Home without Ctrl/Cmd could also go to first cell, or top of current cell if applicable.
          // For now, only handling Ctrl/Cmd + Home.
          else {
            preventDefault = false;
          }
          break;

        case "End":
          if (event.ctrlKey || event.metaKey) {
            // Ctrl/Cmd + End: Jump to last cell
            nextCursorIndex = N_CELLS - 1;
            if (event.shiftKey) {
              // And select range to it
              if (currentAnchorIndex === null)
                currentAnchorIndex = currentCursor;
              newSelectedIndices.clear();
              const start = Math.min(currentAnchorIndex, nextCursorIndex);
              const end = Math.max(currentAnchorIndex, nextCursorIndex);
              for (let i = start; i <= end; i++) newSelectedIndices.add(i);
            } else {
              newSelectedIndices.clear();
              newSelectedIndices.add(nextCursorIndex);
              currentAnchorIndex = nextCursorIndex;
            }
            applyIndexSelection(nextCursorIndex, currentAnchorIndex, newSelectedIndices);
            scrollTargetIndex = nextCursorIndex;
            scrollAlignment = "end";
          } else {
            preventDefault = false;
          }
          break;

        case "d": // Lowercase d for the check
          if (event.metaKey || event.ctrlKey) break; // Avoid conflict with browser dev tools, etc.
          const currentTime = Date.now();
          if (
            currentTime - lastDKeyPressTimeRef.current <
            D_DOUBLE_PRESS_TIMEOUT
          ) {
            if (selectedCellIndices.size > 0) {
              handleDeleteSelectedCells();
            }
            lastDKeyPressTimeRef.current = 0;
          } else {
            lastDKeyPressTimeRef.current = currentTime;
            preventDefault = false;
          }
          break;

        case "z":
        case "Z":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          handleRestoreDeletedCells();
          break;

        case "a":
        case "A":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          const addedCellA = handleAddCell(
            cellCursorIndex,
            "above",
            CellType.CODE,
          );
          if (addedCellA !== null && addedCellA.index !== -1) {
            scrollTargetCellId = addedCellA.cellId;
            scrollAlignment = "start";
          }
          break;

        case "b":
        case "B":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          const addedCellB = handleAddCell(
            cellCursorIndex,
            "below",
            CellType.CODE,
          );
          if (addedCellB !== null && addedCellB.index !== -1) {
            scrollTargetCellId = addedCellB.cellId;
            scrollAlignment = "end";
          }
          break;

        case "c":
        case "C":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          handleCopySelectedCellsToClipboard();
          preventDefault = false;
          break;

        case "x":
        case "X":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          if (selectedCellIndices.size > 0) {
            handleCopySelectedCellsToClipboard();
            handleDeleteSelectedCells();
          }
          preventDefault = false;
          break;

        case "v":
        case "V":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          if (copiedCells.length > 0 && notebook) {
            const pasteAbove = event.altKey;
            let insertAtIndex =
              cellCursorIndex !== null
                ? pasteAbove
                  ? cellCursorIndex
                  : cellCursorIndex + 1
                : 0;
            if (N_CELLS === 0) insertAtIndex = 0; // If empty, always insert at 0

            const result = pasteCellsAtIndex(
              applyPendingChanges(notebook),
              copiedCells,
              insertAtIndex,
              createCellId,
            );
            setNotebook(result.notebook);
            applySelectionState(result.selection);
            for (const cellId of result.pastedCellIds) {
              modifiedCellsRef.current.add(cellId);
            }
            markDirty();

            const firstPastedId = result.pastedCellIds[0];
            if (firstPastedId) {
              const firstPastedIndex = getCellIndexById(
                result.notebook,
                firstPastedId,
              );
              if (firstPastedIndex >= 0) {
                scrollToCellIdAfterLayout(firstPastedId, "end");
              }
            }
          }
          preventDefault = false;
          break;

        case "m":
        case "M":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          if (selectedCellIndices.size > 0) {
            handleChangeCellTypes(
              Array.from(selectedCellIndices),
              CellType.MARKDOWN,
            );
          }
          break;

        case "y":
        case "Y":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          if (selectedCellIndices.size > 0) {
            handleChangeCellTypes(
              Array.from(selectedCellIndices),
              CellType.CODE,
            );
          }
          break;

        case "i":
        case "I":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          if (currentCursor >= 0) {
            handleMentionCell(currentCursor);
          }
          break;

        case "Enter":
          if (event.metaKey || event.ctrlKey) {
            handleRunCell();
          } else if (event.shiftKey) {
            handleRunCell();
            const lastRunIndex =
              cellCursorIndex !== null
                ? cellCursorIndex
                : N_CELLS > 0
                  ? N_CELLS - 1
                  : -1;
            if (lastRunIndex !== -1) {
              const nextCellToSelect = lastRunIndex + 1;
              if (nextCellToSelect < N_CELLS) {
                selectCellByIndex(nextCellToSelect);
                scrollTargetIndex = nextCellToSelect;
                scrollAlignment = "end";
              } else {
                const newAddedCell = handleAddCell(
                  lastRunIndex,
                  "below",
                  CellType.CODE,
                );
                if (newAddedCell !== null && newAddedCell.index !== -1) {
                  scrollTargetCellId = newAddedCell.cellId;
                  scrollAlignment = "end";
                }
              }
            }
          } else {
            // Plain Enter on a selected cell should enter edit mode
            if (cellCursorId !== null) {
              const cellRef = cellComponentRefs.current.get(cellCursorId);
              if (cellRef) {
                cellRef.focusSource();
              }
            }
          }
          break;

        default:
          preventDefault = false;
          break;
      }

      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (scrollTargetCellId !== null) {
        scrollToCellIdAfterLayout(scrollTargetCellId, scrollAlignment);
      } else if (scrollTargetIndex !== null) {
        setTimeout(
          () => scrollToCell(scrollTargetIndex, undefined, scrollAlignment),
          0,
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    notebook,
    activeNotebookView,
    selectedCellIndices,
    selectionAnchorIndex,
    cellCursorIndex,
    cellCursorId,
    isAnyCellEditing,
    editingCellIds,
    handleCellSelect,
    handleAddCell,
    handleDeleteSelectedCells,
    handleRestoreDeletedCells,
    handleMoveCell,
    handleChangeCellTypes,
    handleRunCell,
    handleMentionCell,
    focusNotebookCommandTarget,
    copiedCells,
    setCopiedCells,
    setShowNotebookShortcutsDialog,
    scrollToCell,
    scrollToCellIdAfterLayout,
    handleCopySelectedCellsToClipboard,
    applyPendingChanges,
    applySelectionState,
    markDirty,
    selectCellByIndex,
  ]);

  useEffect(() => {
    if (activeNotebookView !== "notebook") {
      return;
    }

    if (cellCursorId !== null && cellRefs.current.get(cellCursorId)) {
      const cellElement = cellRefs.current.get(cellCursorId);
      const activeElement = document.activeElement;
      const notebookRoot = notebookRootRef.current;
      const focusIsInsideNotebook =
        activeElement instanceof Node &&
        notebookRoot !== null &&
        notebookRoot.contains(activeElement);
      const focusIsOnPage = activeElement === document.body;

      if (!focusIsInsideNotebook && !focusIsOnPage) {
        return;
      }

      // Only focus the wrapper if focus is not already inside this cell,
      // to avoid stealing focus from an editor (e.g. Monaco) that the user just clicked on.
      if (cellElement && !cellElement.contains(activeElement)) {
        cellElement.focus({ preventScroll: true });
      }
    }
  }, [activeNotebookView, cellCursorId]);

  return (
    <>
      <div
        ref={notebookRootRef}
        data-keyboard-scope="notebook"
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar"
      >
        {/* Notebook Toolbar */}
        {/* 
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 shadow-sm">
          <NotebookToolbar
            onRunAll={handleRunAll} // This would now dispatch an event or be handled by parent
            onRestartKernel={handleRestartKernel} // Dispatch event or handled by parent
            onStopKernel={handleStopKernel} // Dispatch event or handled by parent
            onKernelSelect={handleKernelSelect} // This can still trigger local dialogs, which then call parent setters
            kernelStatus={parentKernelStatus || "disconnected"} // Use parent status
            currentKernel={parentCurrentKernel} // Use parent kernel
            availableKernels={availableKernels} // Can be local if dialogs are local
            isRunning={parentIsRunning || false} // Use parent running state
          />
        </div>
        */}

        {/* Kernel Selection Dialog */}
        <KernelSelectionDialog
          open={showKernelDialog}
          onOpenChange={setShowKernelDialog}
          availableKernels={availableKernels}
          onKernelSelect={handleStartKernel}
        />

        {/* Kernel Connection Dialog */}
        <KernelConnectionDialog
          open={showConnectionDialog}
          onOpenChange={setShowConnectionDialog}
          onConnect={handleConnectToKernel} // This dialog's connect should ideally call a prop that interacts with page.tsx
          error={connectionError}
        />

        {/* Running Kernel Dialog */}
        <RunningKernelDialog
          open={showRunningKernelDialog}
          onOpenChange={setShowRunningKernelDialog}
          onConnect={handleConnectToRunningKernel}
          kernelService={parentKernelService || null}
        />

        <NotebookShortcutsDialog
          open={showNotebookShortcutsDialog}
          onOpenChange={setShowNotebookShortcutsDialog}
        />

        <NotebookPublishDialog
          open={publishDialogOpen}
          onOpenChange={setPublishDialogOpen}
          defaultTitle={getNotebookDefaultTitle()}
          onPublish={handlePublishNotebook}
        />

        {/* Remove focus outline for the notebook editor content area and its focusable children */}
        <style jsx global>{`
          .notebook-editor-content-area:focus,
          .notebook-editor-content-area:focus-visible,
          .notebook-editor-content-area *:focus {
            outline: none !important;
            box-shadow: none !important;
          }
        `}</style>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
          {loading ? (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-sidebar",
                !notebookScrollbarVisible && "scrollbar-hide",
              )}
            >
              <div className="flex h-[80vh] items-center justify-center">
                <Orbit
                  strokeWidth={1.5}
                  className="h-16 w-16 animate-spin text-gray-500"
                />
              </div>
            </div>
          ) : error ? (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-sidebar",
                !notebookScrollbarVisible && "scrollbar-hide",
              )}
            >
              <Card>
                <CardContent className="py-6">
                  <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
                    {error}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : notebook ? (
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                aria-hidden={activeNotebookView !== "app"}
                inert={activeNotebookView !== "app" ? true : undefined}
                className={cn(
                  "absolute inset-0 flex min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden transition-opacity duration-150",
                  !notebookScrollbarVisible && "scrollbar-hide",
                  activeNotebookView === "app"
                    ? "opacity-100"
                    : "invisible pointer-events-none opacity-0",
                )}
              >
                <NotebookAppView
                  notebook={notebook}
                  notebookPath={filepath}
                  businessMode={businessMode}
                  businessEditMode={businessEditMode}
                  undoRemovalEnabled={activeNotebookView === "app"}
                  onSaveMarkdownCell={
                    businessMode ? handleSaveBusinessMarkdownCell : undefined
                  }
                  onNotebookViewRequest={() =>
                    onActiveNotebookViewChange?.("notebook")
                  }
                  onRemoveAppViewReference={handleRemoveAppViewReference}
                  onRestoreAppViewReference={handleRestoreAppViewReference}
                  onOrionUiStateChange={handleOrionUiStateChange}
                  onOrionUiAction={handleOrionUiAction}
                  onOrionUiTableRequest={handleOrionUiTableRequest}
                  onOrionUiTableMetadataChange={
                    handleOrionUiTableMetadataChange
                  }
                />
              </div>
              <div
                aria-hidden={activeNotebookView !== "notebook"}
                inert={activeNotebookView !== "notebook" ? true : undefined}
                className={cn(
                  "notebook-editor-scroll [container-type:size] absolute inset-0 w-full overflow-y-auto overflow-x-hidden bg-sidebar transition-opacity duration-150",
                  !notebookScrollbarVisible && "scrollbar-hide",
                  activeNotebookView === "notebook"
                    ? "opacity-100"
                    : "invisible pointer-events-none opacity-0",
                )}
              >
                <div className="space-y-6 pb-[50cqh]">
                  {showSubagentOptions &&
                    subagentValidation.issues.length > 0 ? (
                    <Alert className="mx-3 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                      <AlertTitle className="text-sm">
                        Sub-agent notebook structure needs attention
                      </AlertTitle>
                      <AlertDescription>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                          {subagentValidation.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {notebook.cells.length === 0 ? (
                    <div className="flex h-[60vh] items-center justify-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="text-center space-y-2">
                          <h3 className="text-lg font-medium text-muted-foreground">
                            No cells in this notebook
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Get started by creating your first cell
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            const newCell = handleAddCell(
                              null,
                              "below",
                              CellType.CODE,
                            );
                            if (newCell !== null && newCell.index !== -1) {
                              scrollToCellIdAfterLayout(newCell.cellId, "end");
                            }
                          }}
                          variant="outline"
                          size="lg"
                          className="gap-2"
                        >
                          <Plus className="h-5 w-5" />
                          Create Cell
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="jp-Notebook space-y-3 p-3 notebook-editor-content-area"
                      data-notebook-export-root="notebook"
                      tabIndex={-1}
                    >
                      {showSubagentOptions ? (
                        <TooltipProvider delayDuration={250}>
                          <div className="flex flex-wrap items-center justify-start gap-2 px-1 pb-1">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Model
                            </Label>
                            <SubagentOptionTooltip text="Optional model catalog id used whenever this sub-agent runs. Select inherit to use the parent chat model.">
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                                aria-label="Model ID help"
                              >
                                <HelpCircle className="h-3 w-3" />
                              </button>
                            </SubagentOptionTooltip>
                            <Popover
                              open={subagentModelComboboxOpen}
                              onOpenChange={setSubagentModelComboboxOpen}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={subagentModelComboboxOpen}
                                  className="h-7 w-[260px] max-w-full justify-between px-2 text-xs font-normal"
                                >
                                  <span className="min-w-0 truncate">
                                    {subagentModelId
                                      ? (selectedSubagentModel?.modelId ??
                                        subagentModelId)
                                      : "Inherit parent model"}
                                  </span>
                                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-[320px] p-0"
                                align="start"
                              >
                                <Command>
                                  <CommandInput
                                    placeholder="Search model ids..."
                                    className="h-8 text-xs"
                                  />
                                  <CommandList className="max-h-[260px]">
                                    <CommandEmpty>
                                      No models found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        value="inherit parent model"
                                        onSelect={() => {
                                          handleUpdateSubagentMetadata({
                                            model: "",
                                          });
                                          setSubagentModelComboboxOpen(false);
                                        }}
                                        className="text-xs"
                                      >
                                        <Check
                                          className={cn(
                                            "h-3.5 w-3.5",
                                            subagentModelId
                                              ? "opacity-0"
                                              : "opacity-100",
                                          )}
                                        />
                                        <span>Inherit parent model</span>
                                      </CommandItem>
                                      {subagentModelOptions.map((model) => {
                                        const isSelected =
                                          subagentModelId === model.modelId;
                                        return (
                                          <CommandItem
                                            key={model.modelId}
                                            value={`${model.modelId} ${model.label} ${model.providerId}`}
                                            onSelect={() => {
                                              handleUpdateSubagentMetadata({
                                                model: model.modelId,
                                              });
                                              setSubagentModelComboboxOpen(
                                                false,
                                              );
                                            }}
                                            className="text-xs"
                                          >
                                            <Check
                                              className={cn(
                                                "h-3.5 w-3.5",
                                                isSelected
                                                  ? "opacity-100"
                                                  : "opacity-0",
                                              )}
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                              {model.modelId}
                                            </span>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>

                            <Switch
                              id="subagent-auto-discover"
                              checked={!subagentDisableModelInvocation}
                              onCheckedChange={(checked) =>
                                handleUpdateSubagentMetadata({
                                  disableModelInvocation: !checked,
                                })
                              }
                              aria-label="Toggle auto-discover"
                              className="h-5 w-9 data-[state=checked]:[&>span]:translate-x-4 data-[state=unchecked]:[&>span]:translate-x-0 [&>span]:h-4 [&>span]:w-4"
                            />
                            <Label
                              htmlFor="subagent-auto-discover"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Discoverable
                            </Label>
                            <SubagentOptionTooltip text="When enabled, the parent agent can call this sub-agent based on the user's request. When disabled, it can only be invoked with its slash command.">
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                                aria-label="Auto-discover help"
                              >
                                <HelpCircle className="h-3 w-3" />
                              </button>
                            </SubagentOptionTooltip>
                          </div>
                        </TooltipProvider>
                      ) : null}
                      {notebook.cells.map((cell, index) => {
                        const cellId = getCellId(cell) ?? `cell-${index}`;
                        return (
                          <div
                            key={cellId}
                            ref={(el) => {
                              cellRefs.current.set(cellId, el);
                            }}
                            className={cn(
                              "jp-Cell",
                              cellCursorIndex === index &&
                              !isAnyCellEditing &&
                              "cell-cursor-active",
                            )}
                            tabIndex={-1}
                          >
                            <NotebookCell
                              cell={cell}
                              notebookMetadata={notebook.metadata}
                              notebookPath={filepath}
                              cellIndex={index}
                              onCellModified={handleCellModified}
                              onUpdateCell={handleUpdateCell}
                              onCellSelect={handleCellSelect}
                              onCellMouseDownCapture={handleCellMouseDownCapture}
                              onCellAction={handleCellAction}
                              isSelected={selectedCellIndices.has(index)}
                              onEditingModeChange={handleEditingModeChange}
                              onUpdateCellMetadata={handleUpdateCellMetadata}
                              onUpdateCellData={handleUpdateCellData}
                              onRegisterRef={registerCellRef}
                              onContentChange={handleCellContentChange}
                              onMentionCell={handleMentionCell}
                              onOrionUiStateChange={handleOrionUiStateChange}
                              onOrionUiAction={handleOrionUiAction}
                              onOrionUiTableRequest={handleOrionUiTableRequest}
                              validationIssue={subagentValidation.cellIssues.get(
                                index,
                              )}
                              presentationHideAllCellInputs={
                                presentationHideAllCellInputs
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-sidebar",
                !notebookScrollbarVisible && "scrollbar-hide",
              )}
            >
              <Card>
                <CardContent className="py-6">
                  <div className="p-3 bg-yellow-50 text-yellow-600 rounded-md text-sm">
                    No notebook data available
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
