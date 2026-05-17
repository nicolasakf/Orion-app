"use client";

import type React from "react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { NotebookAppView } from "@/components/notebook/notebook-app-view";
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
import {
  ensureAppViewLayout,
  getNotebookAppViewMetadata,
  isCellInAppView,
  isOutputInAppView,
  withCellAppEnabled,
  withNotebookAppViewMetadata,
  withOutputAppEnabled,
  type NotebookAppCell,
  type NotebookAppViewMetadata,
} from "@/lib/notebook/app-view";
import {
  KernelSelectionDialog,
  KernelConnectionDialog,
  RunningKernelDialog,
} from "./kernel-dialogs";

interface NotebookEditorProps {
  /**
   * Path to the .ipynb file to display (Jupyter-relative path)
   */
  filepath: string;
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
  /**
   * When true, code cell inputs are hidden in the UI only (does not change notebook metadata).
   */
  presentationHideAllCellInputs?: boolean;
  activeNotebookView?: "notebook" | "app";
  onActiveNotebookViewChange?: (view: "notebook" | "app") => void;
  // Callbacks for actions that are now handled in the parent (page.tsx)
  // These will be invoked by custom events dispatched from here
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns true when a notebook path opts into sub-agent settings via filename. */
function isSubagentNotebookPath(filepath: string): boolean {
  const name = filepath.split("/").pop() ?? filepath;
  return name.toLowerCase().endsWith(".agent.ipynb");
}

function getSubagentMetadata(
  metadata: NotebookType["metadata"] | undefined,
): Record<string, unknown> | null {
  if (!metadata || !isRecord(metadata.orion)) return null;
  return isRecord(metadata.orion.subagent) ? metadata.orion.subagent : null;
}

function getSubagentModelId(
  metadata: NotebookType["metadata"] | undefined,
): string {
  const subagent = getSubagentMetadata(metadata);
  return typeof subagent?.model === "string" ? subagent.model : "";
}

/** Returns a notebook cell source string with surrounding whitespace removed. */
function sourceText(cell: NotebookCellType | undefined): string {
  return Array.isArray(cell?.source) ? cell.source.join("").trim() : "";
}

/** Removes an optional expected markdown heading before validating body text. */
function stripAllowedLeadingHeading(
  markdown: string,
  allowedHeadings: ReadonlySet<string>,
): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return "";

  const firstLine = lines[firstContentIndex].trim();
  const heading = firstLine.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (!heading) return markdown.trim();

  const normalizedHeading = heading[1]
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  if (!allowedHeadings.has(normalizedHeading)) return markdown.trim();

  firstContentIndex += 1;
  while (
    firstContentIndex < lines.length &&
    lines[firstContentIndex].trim().length === 0
  ) {
    firstContentIndex += 1;
  }

  return lines.slice(firstContentIndex).join("\n").trim();
}

/** Returns true when the first non-empty markdown line is an H1. */
function startsWithH1(markdown: string): boolean {
  const firstNonEmptyLine = markdown
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  return /^#\s+.+/.test(firstNonEmptyLine?.trim() ?? "");
}

interface SubagentNotebookValidation {
  issues: string[];
  cellIssues: Map<number, string>;
}

/** Checks the required first three cells for `.agent.ipynb` sub-agent notebooks. */
function validateSubagentNotebookStructure(
  notebook: NotebookType | null,
): SubagentNotebookValidation {
  const issues: string[] = [];
  const cellIssues = new Map<number, string>();
  if (!notebook) return { issues, cellIssues };

  const firstCell = notebook.cells[0];
  if (!firstCell) {
    issues.push("Cell 0 is missing. Add a markdown cell with an H1 label.");
  } else if (firstCell.cell_type !== CellType.MARKDOWN) {
    const message =
      "Cell 0 must be a markdown cell with an H1 label, such as # Data Profiler.";
    issues.push(message);
    cellIssues.set(0, message);
  } else if (!startsWithH1(sourceText(firstCell))) {
    const message =
      "Cell 0 must start with an H1 label, such as # Data Profiler.";
    issues.push(message);
    cellIssues.set(0, message);
  }

  const secondCell = notebook.cells[1];
  if (!secondCell) {
    issues.push(
      "Cell 1 is missing. Add a markdown cell with the sub-agent description.",
    );
  } else if (secondCell.cell_type !== CellType.MARKDOWN) {
    const message = "Cell 1 must be a markdown description cell.";
    issues.push(message);
    cellIssues.set(1, message);
  } else {
    const description = stripAllowedLeadingHeading(
      sourceText(secondCell),
      new Set(["description"]),
    );
    if (!description) {
      const message =
        "Cell 1 needs a non-empty description after any optional Description heading.";
      issues.push(message);
      cellIssues.set(1, message);
    }
  }

  const thirdCell = notebook.cells[2];
  if (!thirdCell) {
    issues.push(
      "Cell 2 is missing. Add a markdown cell with the sub-agent system prompt.",
    );
  } else if (thirdCell.cell_type !== CellType.MARKDOWN) {
    const message = "Cell 2 must be a markdown system prompt cell.";
    issues.push(message);
    cellIssues.set(2, message);
  } else {
    const systemPrompt = stripAllowedLeadingHeading(
      sourceText(thirdCell),
      new Set(["system prompt", "system"]),
    );
    if (!systemPrompt) {
      const message =
        "Cell 2 needs a non-empty system prompt after any optional System Prompt heading.";
      issues.push(message);
      cellIssues.set(2, message);
    }
  }

  return { issues, cellIssues };
}

/** Returns true when the notebook sub-agent should be hidden from model-chosen delegation. */
function getSubagentDisableModelInvocation(
  metadata: NotebookType["metadata"] | undefined,
): boolean {
  const subagent = getSubagentMetadata(metadata);
  return typeof subagent?.["disable-model-invocation"] === "boolean"
    ? subagent["disable-model-invocation"]
    : false;
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

interface SubagentModelOption {
  modelId: string;
  label: string;
  providerId: string;
}

/**
 * Component that displays a Jupyter notebook from a specified filepath
 */
export function NotebookEditor({
  filepath,
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
  presentationHideAllCellInputs,
  activeNotebookView: controlledActiveNotebookView,
  onActiveNotebookViewChange,
}: NotebookEditorProps) {
  const [notebook, setNotebook] = useState<NotebookType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCellIndices, setSelectedCellIndices] = useState<Set<number>>(
    new Set(),
  );
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<
    number | null
  >(null);
  const [cellCursorIndex, setCellCursorIndex] = useState<number | null>(null);
  const [editingCellIndices, setEditingCellIndices] = useState<Set<number>>(
    new Set(),
  );

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
  const [connectionError, setConnectionError] = useState("");
  const [subagentModelComboboxOpen, setSubagentModelComboboxOpen] =
    useState(false);
  const [subagentModelOptions, setSubagentModelOptions] = useState<
    SubagentModelOption[]
  >([]);

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const notebookRootRef = useRef<HTMLDivElement | null>(null);
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

  // Use a ref to track modified cells instead of state to avoid re-renders
  const modifiedCellsRef = useRef<Set<number>>(new Set());

  // NEW: Store pending cell content changes without causing rerenders
  const pendingCellChangesRef = useRef<Map<number, string>>(new Map());

  // Track whether there are unsaved changes so we can notify the parent once per transition
  const isUnsavedRef = useRef(false);

  /** Marks the notebook as having unsaved changes and notifies the parent (once per transition). */
  const markDirty = useCallback(() => {
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
    Map<number, { getSource: () => string; focusSource: () => void }>
  >(new Map());

  // Clipboard for copy/paste
  const [copiedCells, setCopiedCells] = useState<NotebookCellType[]>([]);
  const activeNotebookView = controlledActiveNotebookView ?? "notebook";
  const previousActiveNotebookViewRef = useRef(activeNotebookView);
  // For 'D' twice to delete
  const lastDKeyPressTimeRef = useRef<number>(0);

  /** When false, the notebook scroll area keeps overflow but hides the scrollbar (see Appearance). */
  const notebookScrollbarVisible = useOrionSetting(
    (s) => s.notebook.scrollbarVisible,
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

        // Ensure stable IDs for each cell under metadata.orion.id
        const withIds = (() => {
          const nbCopy = {
            ...parsedNotebook,
            cells: [...parsedNotebook.cells],
          };
          for (let i = 0; i < nbCopy.cells.length; i++) {
            const cell = nbCopy.cells[i];
            const metadata = cell.metadata || {};
            const orion = metadata.orion || {};
            if (!orion.id) {
              const newId =
                typeof crypto !== "undefined" && (crypto as any).randomUUID
                  ? (crypto as any).randomUUID()
                  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
              nbCopy.cells[i] = {
                ...cell,
                metadata: {
                  ...metadata,
                  orion: {
                    ...orion,
                    id: newId,
                  },
                },
              } as any;
            }
          }
          return nbCopy;
        })();

        setNotebook(withIds);
        // Clear modified cells when loading a new notebook
        modifiedCellsRef.current = new Set();
        markClean();
        // Initialize cursor and anchor
        if (withIds && withIds.cells.length > 0) {
          setCellCursorIndex(0);
          setSelectionAnchorIndex(0);
          setSelectedCellIndices(new Set([0]));
        } else {
          setCellCursorIndex(null);
          setSelectionAnchorIndex(null);
          setSelectedCellIndices(new Set());
        }
      } catch (err) {
        console.error("Error loading notebook:", err);
        setError(
          `Failed to load the notebook: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setLoading(false);
      }
    };

    loadNotebook();
  }, [filepath, parentKernelService]);

  // Notify parent when notebook changes
  useEffect(() => {
    if (onNotebookChange) {
      onNotebookChange(notebook);
    }
  }, [notebook, onNotebookChange]);

  /**
   * Tracks which cells have been modified using a ref to avoid re-renders
   */
  const handleCellModified = useCallback(
    (cellIndex: number) => {
      // Simply add to the ref without causing a re-render
      modifiedCellsRef.current.add(cellIndex);
      markDirty();
    },
    [markDirty],
  );

  /**
   * Register a cell component reference for direct access during save and focus
   */
  const registerCellRef = useCallback(
    (
      cellIndex: number,
      ref: { getSource: () => string; focusSource: () => void } | null,
    ) => {
      if (ref) {
        cellComponentRefs.current.set(cellIndex, ref);
      } else {
        cellComponentRefs.current.delete(cellIndex);
      }
    },
    [],
  );

  /**
   * NEW: Store cell content changes in a ref instead of updating state immediately
   * This is called by cells when they have local changes
   */
  const handleCellContentChange = useCallback(
    (cellIndex: number, source: string) => {
      pendingCellChangesRef.current.set(cellIndex, source);
    },
    [],
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
        updatedNotebook.cells[cellIndex].metadata = metadata;
        return updatedNotebook;
      });

      // Mark the cell as modified so it gets saved
      modifiedCellsRef.current.add(cellIndex);
      markDirty();
    },
    [notebook, markDirty],
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
        updatedNotebook.cells[cellIndex] = cell;
        return updatedNotebook;
      });

      pendingCellChangesRef.current.set(cellIndex, cell.source.join(""));
      markDirty();
    },
    [notebook, markDirty],
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

      modifiedCellsRef.current.add(cellIndex);
      markDirty();
    },
    [markDirty],
  );

  /**
   * Updates the notebook with changes from a specific cell
   * Only called when we need to sync cell state with the notebook (e.g., during save)
   */
  const handleUpdateCell = useCallback(
    (cellIndex: number, source: string) => {
      if (!notebook) return;

      // Store the change in pending changes instead of updating state immediately
      pendingCellChangesRef.current.set(cellIndex, source);
    },
    [notebook],
  );

  /**
   * NEW: Apply all pending changes to create a new notebook object
   * This is only called during save to minimize state updates
   */
  const applyPendingChanges = useCallback(
    (currentNotebook: NotebookType): NotebookType => {
      if (pendingCellChangesRef.current.size === 0) {
        return currentNotebook;
      }

      // Create a deep copy of the notebook
      const updatedNotebook = JSON.parse(JSON.stringify(currentNotebook));

      // Apply all pending changes
      pendingCellChangesRef.current.forEach((source, cellIndex) => {
        if (cellIndex < updatedNotebook.cells.length) {
          // Split the source into lines to match Jupyter notebook format
          const lines = source
            .split("\n")
            .map((line, index, array) =>
              index === array.length - 1 ? line : line + "\n",
            );

          // Update the cell's source
          updatedNotebook.cells[cellIndex].source = lines;
        }
      });

      return updatedNotebook;
    },
    [],
  );

  /**
   * Captures the latest mounted cell editor text before leaving notebook editing surfaces.
   */
  const capturePendingCellSources = useCallback(() => {
    modifiedCellsRef.current.forEach((cellIndex) => {
      const cellRef = cellComponentRefs.current.get(cellIndex);
      if (cellRef) {
        pendingCellChangesRef.current.set(cellIndex, cellRef.getSource());
      }
    });
  }, []);

  /**
   * Persists App View layout changes in top-level notebook metadata.
   */
  const handleAppViewChange = useCallback(
    (appView: NotebookAppViewMetadata) => {
      capturePendingCellSources();
      setNotebook((prevNotebook) => {
        if (!prevNotebook) {
          return prevNotebook;
        }
        return withNotebookAppViewMetadata(
          applyPendingChanges(prevNotebook),
          appView,
        );
      });
      markDirty();
    },
    [applyPendingChanges, capturePendingCellSources, markDirty],
  );

  /**
   * Removes a markdown cell or individual code output from App View without
   * deleting its saved layout entry.
   */
  const handleRemoveAppViewItem = useCallback(
    (appCell: NotebookAppCell) => {
      capturePendingCellSources();
      setNotebook((prevNotebook) => {
        if (!prevNotebook) {
          return prevNotebook;
        }

        const notebookWithChanges = applyPendingChanges(prevNotebook);
        const cells = notebookWithChanges.cells.slice();
        const currentCell = cells[appCell.cellIndex];
        if (!currentCell) {
          return prevNotebook;
        }

        cells[appCell.cellIndex] =
          appCell.kind === "output" && appCell.outputIndex !== undefined
            ? withOutputAppEnabled(currentCell, appCell.outputIndex, false)
            : withCellAppEnabled(currentCell, false);

        return {
          ...notebookWithChanges,
          cells,
        };
      });
      modifiedCellsRef.current.add(appCell.cellIndex);
      markDirty();
    },
    [applyPendingChanges, capturePendingCellSources, markDirty],
  );

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
   * Saves the current notebook to disk
   * NEW: Direct approach without custom events or timeouts
   */
  const saveNotebook = useEffect(() => {
    const handleSaveFile = async () => {
      if (!parentKernelService || !notebook) {
        return;
      }

      try {
        // Get the latest content from all modified cells directly
        modifiedCellsRef.current.forEach((cellIndex) => {
          const cellRef = cellComponentRefs.current.get(cellIndex);
          if (cellRef) {
            const currentSource = cellRef.getSource();
            pendingCellChangesRef.current.set(cellIndex, currentSource);
          }
        });

        // Apply all pending changes to create the final notebook
        const notebookToSave = applyPendingChanges(notebook);

        // Write to file via Jupyter's ContentsManager
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

        // Keep local notebook state aligned with what was persisted.
        // This prevents a later "clean" save (e.g. on file switch) from writing an older snapshot.
        setNotebook(notebookToSave);

        // Clear pending changes and modified cells after successful save
        pendingCellChangesRef.current.clear();
        modifiedCellsRef.current.clear();
        markClean();

        console.log("Notebook saved successfully");
      } catch (error) {
        console.error("Error saving notebook:", error);
      }
    };

    // Listen for save file events
    const handleSaveFileEvent = () => {
      handleSaveFile();
    };

    window.addEventListener("saveFile", handleSaveFileEvent as EventListener);

    return () => {
      window.removeEventListener(
        "saveFile",
        handleSaveFileEvent as EventListener,
      );
    };
  }, [parentKernelService, filepath, notebook, applyPendingChanges, markClean]);

  /**
   * Listen for agentNotebookModified events dispatched when the Orion agent
   * modifies the notebook via Jupyter's ContentsManager. Re-reads from
   * ContentsManager to sync the editor with the agent's changes.
   */
  useEffect(() => {
    if (!parentKernelService) {
      return;
    }

    const handleAgentModified = async () => {
      try {
        const contentsManager = parentKernelService.getContentsManager();
        const model = await contentsManager.get(filepath, { content: true });
        const parsedNotebook = parseNotebook(JSON.stringify(model.content));

        // Preserve stable orion IDs on re-load
        const withIds = {
          ...parsedNotebook,
          cells: parsedNotebook.cells.map((cell) => {
            const metadata = cell.metadata || {};
            const orion = (metadata as any).orion || {};
            if (!orion.id) {
              const newId =
                typeof crypto !== "undefined" && (crypto as any).randomUUID
                  ? (crypto as any).randomUUID()
                  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
              return {
                ...cell,
                metadata: { ...metadata, orion: { ...orion, id: newId } },
              } as typeof cell;
            }
            return cell;
          }),
        };

        setNotebook(withIds);
        modifiedCellsRef.current = new Set();
        markClean();
      } catch (err) {
        console.error(
          "Failed to reload notebook after agent modification:",
          err,
        );
      }
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
  }, [parentKernelService, filepath, markClean]);

  /**
   * Navigates to a cell (and optionally a specific output within it).
   * If the target is already fully visible in its scroll container the method
   * only updates selection state without scrolling; otherwise it scrolls the
   * target to the top of the visible area.
   */
  const scrollToCell = useCallback(
    (cellIndex: number, outputIndex?: number) => {
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
        targetElement = cellRefs.current[cellIndex];
      }

      if (!targetElement) return;

      // Find the nearest scrollable ancestor
      const getScrollContainer = (el: HTMLElement): HTMLElement => {
        let parent = el.parentElement;
        while (parent) {
          const overflow = window.getComputedStyle(parent).overflowY;
          if (overflow === "auto" || overflow === "scroll") return parent;
          parent = parent.parentElement;
        }
        return document.documentElement as HTMLElement;
      };

      const container = getScrollContainer(targetElement);
      const targetRect = targetElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const isFullyVisible =
        targetRect.top >= containerRect.top &&
        targetRect.bottom <= containerRect.bottom;

      if (!isFullyVisible) {
        // Scroll the target to the top of the scroll container viewport
        targetElement.scrollIntoView({ behavior: "instant", block: "start" });
      }
    },
    [notebook],
  );

  useEffect(() => {
    if (notebook) {
      const sections = buildNotebookMinimap(notebook.cells);
      // Initialize refs array with the correct length
      cellRefs.current = cellRefs.current.slice(0, notebook.cells.length);

      // Broadcast the updated minimap data to any listeners (e.g. page.tsx → LeftSidebar)
      window.dispatchEvent(
        new CustomEvent("notebookMinimapUpdate", {
          detail: { sections, notebook },
        }),
      );
    }
  }, [notebook]);

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
        setSelectedCellIndices(new Set([newCellIndex]));
        setCellCursorIndex(newCellIndex);
        setSelectionAnchorIndex(newCellIndex);
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
  }, [scrollToCell]);

  /**
   * Handles selecting a cell
   */
  const handleCellSelect = useCallback(
    (cellIndex: number, event?: React.MouseEvent | React.KeyboardEvent) => {
      if (!notebook) return;
      const newCursorIndex = cellIndex;

      if (event?.shiftKey && selectionAnchorIndex !== null) {
        setCellCursorIndex(newCursorIndex);
        const start = Math.min(selectionAnchorIndex, newCursorIndex);
        const end = Math.max(selectionAnchorIndex, newCursorIndex);
        const newSelected = new Set<number>();
        for (let i = start; i <= end; i++) {
          newSelected.add(i);
        }
        setSelectedCellIndices(newSelected);
      } else if (event?.metaKey || event?.ctrlKey) {
        setSelectedCellIndices((prevSelectedIndices) => {
          const newSelected = new Set(prevSelectedIndices);
          if (newSelected.has(newCursorIndex)) {
            newSelected.delete(newCursorIndex);
          } else {
            newSelected.add(newCursorIndex);
          }
          // Update anchor and cursor based on new selection state
          if (newSelected.size === 1) {
            const singleIndex = Array.from(newSelected)[0];
            setCellCursorIndex(singleIndex);
            setSelectionAnchorIndex(singleIndex);
          } else if (newSelected.size > 1) {
            setCellCursorIndex(newCursorIndex); // Cursor is the last clicked one
            // Anchor could be the first item in sorted selection or remain based on prior state
            // For simplicity with ctrl/cmd clicks, let's set anchor to the current cursor if it's now part of selection
            if (newSelected.has(newCursorIndex)) {
              // If multiple selected, set anchor to the earliest selected item in the group containing the cursor.
              // This part can be complex. A simpler approach: if selectionAnchorIndex is not in newSelected, update it.
              if (
                selectionAnchorIndex === null ||
                !newSelected.has(selectionAnchorIndex)
              ) {
                const sortedSelected = Array.from(newSelected).sort(
                  (a, b) => a - b,
                );
                setSelectionAnchorIndex(sortedSelected[0]);
              }
            } else if (selectionAnchorIndex === newCursorIndex) {
              // if we just deselected the anchor
              const sortedSelected = Array.from(newSelected).sort(
                (a, b) => a - b,
              );
              setSelectionAnchorIndex(
                sortedSelected.length > 0 ? sortedSelected[0] : null,
              );
            }
          } else {
            // size is 0
            setCellCursorIndex(null);
            setSelectionAnchorIndex(null);
          }
          return newSelected;
        });
      } else {
        // Normal click
        setSelectedCellIndices(new Set([newCursorIndex]));
        setCellCursorIndex(newCursorIndex);
        setSelectionAnchorIndex(newCursorIndex);
      }
      // Ensure clicked cell is visible
      // scrollToCell(newCursorIndex);
    },
    [notebook, selectionAnchorIndex, scrollToCell],
  );

  /**
   * Handles changes to a cell's editing mode status
   */
  const handleEditingModeChange = useCallback(
    (cellIndex: number, isEditing: boolean) => {
      setEditingCellIndices((prevEditingIndices) => {
        const newEditingIndices = new Set(prevEditingIndices);
        if (isEditing) {
          newEditingIndices.add(cellIndex);
        } else {
          newEditingIndices.delete(cellIndex);
        }
        return newEditingIndices;
      });
    },
    [],
  );

  const isAnyCellEditing = editingCellIndices.size > 0;

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
   * Prepares the list of { index, source } pairs for execution,
   * resolving the latest source from cell component refs when available.
   */
  const prepareCellsForExecution = useCallback(
    (indices: number[]): { index: number; source: string }[] => {
      if (!notebook) return [];
      return indices
        .filter((idx) => {
          const cell = notebook.cells[idx];
          return cell && cell.cell_type === CellType.CODE;
        })
        .map((idx) => {
          const cell = notebook.cells[idx];
          const cellRef = cellComponentRefs.current.get(idx);
          const source = cellRef
            ? cellRef.getSource()
            : Array.isArray(cell.source)
              ? cell.source.join("")
              : "";
          return { index: idx, source };
        });
    },
    [notebook],
  );

  /**
   * Runs a specific cell or selected cells.
   *
   * Delegates execution to the standalone `runCells` utility which handles
   * sequential execution, output mapping, error detection, and stop-on-error
   * (matching Jupyter Notebook v7 / JupyterLab behavior).
   *
   * @param indicesToRun - Cell indices to run. If undefined, runs all selected cells.
   * @param stopOnError - Whether to stop on first cell error. Defaults to true for
   *   batch operations (run all, run all above/below) and false for explicit
   *   multi-select runs.
   */
  const handleRunCell = useCallback(
    async (indicesToRun?: number[] | number, stopOnError = true) => {
      if (!notebook || !parentKernelService || !parentKernelService.isReady()) {
        console.warn("Cannot run cell: kernel not ready");
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

      parentSetIsRunning?.(true);

      try {
        await runCellsBatch({
          kernelService: parentKernelService,
          cells: cellsToRun,
          stopOnError,

          onCellStart: (idx) => {
            // Clear outputs and set cell to RUNNING
            const cellRef = cellComponentRefs.current.get(idx);
            const source = cellRef
              ? cellRef.getSource()
              : Array.isArray(notebook.cells[idx]?.source)
                ? notebook.cells[idx].source.join("")
                : "";

            setNotebook((prev) => {
              if (!prev || idx < 0 || idx >= prev.cells.length) return prev;
              const prevCell = prev.cells[idx];
              const updatedCell = {
                ...prevCell,
                source: source
                  .split("\n")
                  .map((line, i, arr) =>
                    i === arr.length - 1 ? line : line + "\n",
                  ),
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

            modifiedCellsRef.current.add(idx);
            markDirty();
          },

          onCellOutput: (idx, output) => {
            // Append output to the cell in real time
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
            // Update cell execution count and parent ref
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
            // Update execution info with final status and timing
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
      } catch (error) {
        console.error("Error executing cells:", error);
      } finally {
        parentSetIsRunning?.(false);
      }
    },
    [
      notebook,
      selectedCellIndices,
      parentKernelService,
      parentSetIsRunning,
      parentExecutionCountRef,
      prepareCellsForExecution,
      updateExecutionInfo,
    ],
  );

  /**
   * Runs all code cells in the notebook sequentially.
   *
   * @param stopOnError - If true (default), stops on first cell error
   *   (matching Jupyter Notebook v7 behavior). If false, continues
   *   executing remaining cells regardless of errors.
   */
  const handleRunAll = useCallback(
    (stopOnError = true) => {
      if (!notebook) return;
      const allIndices = notebook.cells
        .map((cell, idx) => (cell.cell_type === CellType.CODE ? idx : -1))
        .filter((idx) => idx !== -1);
      handleRunCell(allIndices, stopOnError);
    },
    [notebook, handleRunCell],
  );

  // Listen for runAllCells events from the toolbar
  useEffect(() => {
    const handleRunAllCellsEvent = (e: CustomEvent) => {
      const stopOnError = e.detail?.stopOnError ?? true;
      handleRunAll(stopOnError);
    };

    window.addEventListener(
      "runAllCells",
      handleRunAllCellsEvent as EventListener,
    );

    return () => {
      window.removeEventListener(
        "runAllCells",
        handleRunAllCellsEvent as EventListener,
      );
    };
  }, [handleRunAll]);

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
      if (!notebook || cellCursorIndex === null) return;
      const currentIdx = cellIndexToMove; // Use the explicitly passed index

      const newOrderedIndex =
        direction === "up"
          ? Math.max(0, currentIdx - 1)
          : Math.min(notebook.cells.length - 1, currentIdx + 1);

      if (newOrderedIndex === currentIdx) return;

      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        const cells = prevNotebook.cells.slice();
        const tmp = cells[currentIdx];
        cells[currentIdx] = cells[newOrderedIndex];
        cells[newOrderedIndex] = tmp;
        return { ...prevNotebook, cells };
      });

      setSelectedCellIndices(new Set([newOrderedIndex]));
      setCellCursorIndex(newOrderedIndex);
      setSelectionAnchorIndex(newOrderedIndex);

      // NEW: When cells are moved, we need to update our refs mapping
      // Transfer any pending changes to the new indices
      const currentChanges = pendingCellChangesRef.current.get(currentIdx);
      const swappedChanges = pendingCellChangesRef.current.get(newOrderedIndex);

      if (currentChanges !== undefined) {
        pendingCellChangesRef.current.set(newOrderedIndex, currentChanges);
      } else {
        pendingCellChangesRef.current.delete(newOrderedIndex);
      }

      if (swappedChanges !== undefined) {
        pendingCellChangesRef.current.set(currentIdx, swappedChanges);
      } else {
        pendingCellChangesRef.current.delete(currentIdx);
      }

      modifiedCellsRef.current.add(currentIdx);
      modifiedCellsRef.current.add(newOrderedIndex);
      markDirty();
      setTimeout(() => scrollToCell(newOrderedIndex), 0);
    },
    [notebook, scrollToCell, cellCursorIndex, markDirty],
  );

  /**
   * Copies selected cells, or explicit target cells when invoked from a cell action.
   */
  const handleCopySelectedCellsToClipboard = useCallback(
    (indicesToCopy?: number[]) => {
      const targetIndices = indicesToCopy ?? Array.from(selectedCellIndices);
      if (!notebook || targetIndices.length === 0) return;
      const cellsToCopy = targetIndices
        .sort((a, b) => a - b)
        .map((index) => JSON.parse(JSON.stringify(notebook.cells[index])));
      setCopiedCells(cellsToCopy);
    },
    [notebook, selectedCellIndices],
  );

  /**
   * Deletes selected cells, or explicit target cells when invoked from a cell action.
   */
  const handleDeleteSelectedCells = useCallback(
    (indicesToDelete?: number[]) => {
      const targetIndices = indicesToDelete ?? Array.from(selectedCellIndices);
      if (!notebook || targetIndices.length === 0) return;
      const indicesArray = targetIndices.sort((a, b) => b - a);
      const targetCursorIndex =
        indicesToDelete && indicesToDelete.length > 0
          ? Math.min(...indicesToDelete)
          : cellCursorIndex;
      let newCursorPosAfterDelete =
        targetCursorIndex !== null ? targetCursorIndex : 0;

      indicesArray.forEach((index) => {
        if (targetCursorIndex !== null && index < targetCursorIndex) {
          newCursorPosAfterDelete--;
        }
      });
      newCursorPosAfterDelete = Math.max(0, newCursorPosAfterDelete);

      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        // Apply any pending changes before deleting
        const notebookWithChanges = applyPendingChanges(prevNotebook);
        const cells = notebookWithChanges.cells.slice();
        for (const index of indicesArray) {
          if (index >= 0 && index < cells.length) {
            cells.splice(index, 1);
          }
        }
        return { ...notebookWithChanges, cells } as any;
      });
      markDirty();

      // NEW: Clean up pending changes and refs for deleted cells
      indicesArray.forEach((index) => {
        pendingCellChangesRef.current.delete(index);
        modifiedCellsRef.current.delete(index);
        cellComponentRefs.current.delete(index);
      });

      // NEW: Adjust indices for remaining cells
      const deletedSet = new Set(indicesArray);
      const newPendingChanges = new Map<number, string>();
      const newModifiedCells = new Set<number>();
      const newCellRefs = new Map<
        number,
        { getSource: () => string; focusSource: () => void }
      >();

      pendingCellChangesRef.current.forEach((value, key) => {
        if (!deletedSet.has(key)) {
          const newIndex = key - indicesArray.filter((idx) => idx < key).length;
          newPendingChanges.set(newIndex, value);
        }
      });

      modifiedCellsRef.current.forEach((key) => {
        if (!deletedSet.has(key)) {
          const newIndex = key - indicesArray.filter((idx) => idx < key).length;
          newModifiedCells.add(newIndex);
        }
      });

      cellComponentRefs.current.forEach((value, key) => {
        if (!deletedSet.has(key)) {
          const newIndex = key - indicesArray.filter((idx) => idx < key).length;
          newCellRefs.set(newIndex, value);
        }
      });

      pendingCellChangesRef.current = newPendingChanges;
      modifiedCellsRef.current = newModifiedCells;
      cellComponentRefs.current = newCellRefs;

      if (notebook.cells.length - indicesArray.length > 0) {
        const finalCursorPos = Math.min(
          newCursorPosAfterDelete,
          notebook.cells.length - indicesArray.length - 1,
        );
        const newSelection = Math.max(0, finalCursorPos);
        setSelectedCellIndices(new Set([newSelection]));
        setCellCursorIndex(newSelection);
        setSelectionAnchorIndex(newSelection);
        setTimeout(() => scrollToCell(newSelection), 0);
      } else {
        setSelectedCellIndices(new Set());
        setCellCursorIndex(null);
        setSelectionAnchorIndex(null);
      }
    },
    [
      notebook,
      selectedCellIndices,
      cellCursorIndex,
      scrollToCell,
      applyPendingChanges,
      markDirty,
    ],
  );

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
      let newCellActualIndex = -1;

      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;
        const cells = prevNotebook.cells.slice();

        if (baseIndex === null) {
          // Adding to an empty notebook
          newCellActualIndex = 0;
        } else {
          newCellActualIndex = position === "above" ? baseIndex : baseIndex + 1;
        }
        newCellActualIndex = Math.max(
          0,
          Math.min(newCellActualIndex, cells.length),
        );

        const newId =
          typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const newCell: NotebookCellType = {
          cell_type: cellType,
          metadata: { orion: { id: newId } },
          source: [""],
        } as any;
        if (newCell.cell_type === CellType.CODE) {
          (newCell as any).outputs = [];
          (newCell as any).execution_count = null;
        }
        cells.splice(newCellActualIndex, 0, newCell);
        return { ...prevNotebook, cells };
      });
      markDirty();
      // Return index for selection by caller
      return newCellActualIndex;
    },
    [notebook, markDirty],
  );

  /**
   * Changes the type of selected cells
   */
  const handleChangeCellTypes = useCallback(
    (indicesToChange: number[], targetType: CellType) => {
      if (!notebook || indicesToChange.length === 0) return;
      setNotebook((prevNotebook) => {
        if (!prevNotebook) return null;

        // Apply any pending changes first
        const notebookWithChanges = applyPendingChanges(prevNotebook);

        const cells = notebookWithChanges.cells.slice();
        let changed = false;
        indicesToChange.forEach((index) => {
          const cell = cells[index];
          if (cell && cell.cell_type !== targetType) {
            const updated: any = { ...cell, cell_type: targetType };
            if (targetType === CellType.CODE) {
              updated.outputs = updated.outputs || [];
              updated.execution_count = updated.execution_count || null;
            } else {
              delete updated.outputs;
              delete updated.execution_count;
            }
            cells[index] = updated;
            modifiedCellsRef.current.add(index);
            changed = true;
          }
        });

        // Clear pending changes since we've applied them
        if (changed) {
          pendingCellChangesRef.current.clear();
          markDirty();
        }

        return changed ? { ...notebookWithChanges, cells } : prevNotebook;
      });
    },
    [notebook, applyPendingChanges, markDirty],
  );

  /**
   * Handles cell actions from the action bar (buttons on the cell)
   */
  const handleCellAction = useCallback(
    (action: string, cellIndexFromAction: number) => {
      if (!notebook) return;
      const currentCellType =
        notebook.cells[cellIndexFromAction]?.cell_type || CellType.CODE;
      // Ensure the action targets the clicked cell by setting selection and cursor
      setSelectedCellIndices(new Set([cellIndexFromAction]));
      setCellCursorIndex(cellIndexFromAction);
      setSelectionAnchorIndex(cellIndexFromAction);
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
              setSelectedCellIndices(new Set([nextCellIndex]));
              setCellCursorIndex(nextCellIndex);
              setSelectionAnchorIndex(nextCellIndex);
              setTimeout(() => scrollToCell(nextCellIndex), 0);
            } else {
              const newAddedIdx = handleAddCell(
                cellIndexFromAction,
                "below",
                CellType.CODE,
              );
              if (newAddedIdx !== null && newAddedIdx !== -1) {
                setSelectedCellIndices(new Set([newAddedIdx]));
                setCellCursorIndex(newAddedIdx);
                setSelectionAnchorIndex(newAddedIdx);
                setTimeout(() => scrollToCell(newAddedIdx), 0);
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
          setNotebook((prevNotebook) => {
            if (!prevNotebook) return null;
            const updatedNotebook = JSON.parse(JSON.stringify(prevNotebook));
            const newCell = JSON.parse(
              JSON.stringify(updatedNotebook.cells[cellIndexFromAction]),
            );
            const newCopiedCellIdx = cellIndexFromAction + 1;
            updatedNotebook.cells.splice(newCopiedCellIdx, 0, newCell);
            // Select the newly copied cell
            setSelectedCellIndices(new Set([newCopiedCellIdx]));
            setCellCursorIndex(newCopiedCellIdx);
            setSelectionAnchorIndex(newCopiedCellIdx);
            setTimeout(() => scrollToCell(newCopiedCellIdx), 0);
            return updatedNotebook;
          });
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
          const newIdxBelow = handleAddCell(
            cellIndexFromAction,
            "below",
            currentCellType,
          );
          if (newIdxBelow !== null && newIdxBelow !== -1) {
            setSelectedCellIndices(new Set([newIdxBelow]));
            setCellCursorIndex(newIdxBelow);
            setSelectionAnchorIndex(newIdxBelow);
            setTimeout(() => scrollToCell(newIdxBelow), 0);
          }
          break;
        case "add-cell-above":
          const newIdxAbove = handleAddCell(
            cellIndexFromAction,
            "above",
            currentCellType,
          );
          if (newIdxAbove !== null && newIdxAbove !== -1) {
            setSelectedCellIndices(new Set([newIdxAbove]));
            setCellCursorIndex(newIdxAbove);
            setSelectionAnchorIndex(newIdxAbove);
            setTimeout(() => scrollToCell(newIdxAbove), 0);
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
            const cells = notebookWithChanges.cells.slice();
            const currentCell = cells[cellIndexFromAction];
            if (!currentCell) return prevNotebook;

            const isCodeCell = currentCell.cell_type === CellType.CODE;
            if (isCodeCell && !currentCell.outputs?.length) {
              return notebookWithChanges;
            }

            const nextEnabled = isCodeCell
              ? !currentCell.outputs!.every((_, outputIndex) =>
                  isOutputInAppView(currentCell, outputIndex),
                )
              : !isCellInAppView(currentCell);
            cells[cellIndexFromAction] = isCodeCell
              ? currentCell.outputs!.reduce(
                  (updatedCell, _, outputIndex) =>
                    withOutputAppEnabled(updatedCell, outputIndex, nextEnabled),
                  currentCell,
                )
              : withCellAppEnabled(currentCell, nextEnabled);

            let nextNotebook: NotebookType = {
              ...notebookWithChanges,
              cells,
            };

            if (nextEnabled) {
              nextNotebook = withNotebookAppViewMetadata(
                nextNotebook,
                ensureAppViewLayout(
                  nextNotebook.cells,
                  getNotebookAppViewMetadata(nextNotebook.metadata),
                ),
              );
            }

            return nextNotebook;
          });
          modifiedCellsRef.current.add(cellIndexFromAction);
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
              const cells = notebookWithChanges.cells.slice();
              const currentCell = cells[cellIndexFromAction];
              if (
                !currentCell ||
                currentCell.cell_type !== CellType.CODE ||
                !currentCell.outputs?.[outputIndex]
              ) {
                return notebookWithChanges;
              }

              const nextEnabled = !isOutputInAppView(currentCell, outputIndex);
              cells[cellIndexFromAction] = withOutputAppEnabled(
                currentCell,
                outputIndex,
                nextEnabled,
              );

              let nextNotebook: NotebookType = {
                ...notebookWithChanges,
                cells,
              };

              if (nextEnabled) {
                nextNotebook = withNotebookAppViewMetadata(
                  nextNotebook,
                  ensureAppViewLayout(
                    nextNotebook.cells,
                    getNotebookAppViewMetadata(nextNotebook.metadata),
                  ),
                );
              }

              return nextNotebook;
            });
            modifiedCellsRef.current.add(cellIndexFromAction);
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
      const source =
        pendingCellChangesRef.current.get(cellIndex) ??
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
    [filepath, notebook?.cells],
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
          activeElement?.blur();
        }
        return;
      }

      const N_CELLS = notebook.cells.length;
      if (event.key === "Escape") {
        setSelectedCellIndices(new Set());
        setSelectionAnchorIndex(null);
        const mainContentArea = document.querySelector(
          ".notebook-editor-content-area",
        ) as HTMLElement;
        if (mainContentArea) mainContentArea.focus();
        event.preventDefault();
        return;
      }

      if (
        N_CELLS === 0 &&
        !["a", "A", "b", "B", "v", "V"].includes(event.key)
      ) {
        // If no cells, only allow add or paste operations
        if (event.key !== "Escape") event.preventDefault(); // Prevent other defaults if no cells
        return;
      }

      let preventDefault = true;
      const D_DOUBLE_PRESS_TIMEOUT = 400;

      // Current cursor position (or 0 if null and there are cells)
      const currentCursor = cellCursorIndex ?? (N_CELLS > 0 ? 0 : -1);
      if (
        currentCursor === -1 &&
        !["a", "A", "b", "B", "v", "V"].includes(event.key)
      ) {
        // Should not happen if N_CELLS > 0 check above is working, but as a safe guard.
        return;
      }

      let nextCursorIndex = currentCursor;
      let currentAnchorIndex = selectionAnchorIndex;
      let newSelectedIndices = new Set(selectedCellIndices);

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
          setCellCursorIndex(nextCursorIndex);
          setSelectionAnchorIndex(currentAnchorIndex);
          setSelectedCellIndices(newSelectedIndices);
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
          setCellCursorIndex(nextCursorIndex);
          setSelectionAnchorIndex(currentAnchorIndex);
          setSelectedCellIndices(newSelectedIndices);
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
          setCellCursorIndex(nextCursorIndex);
          setSelectionAnchorIndex(currentAnchorIndex);
          setSelectedCellIndices(newSelectedIndices);
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
          setCellCursorIndex(nextCursorIndex);
          setSelectionAnchorIndex(currentAnchorIndex);
          setSelectedCellIndices(newSelectedIndices);
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
            setCellCursorIndex(nextCursorIndex);
            setSelectionAnchorIndex(currentAnchorIndex);
            setSelectedCellIndices(newSelectedIndices);
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
            setCellCursorIndex(nextCursorIndex);
            setSelectionAnchorIndex(currentAnchorIndex);
            setSelectedCellIndices(newSelectedIndices);
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

        case "a":
        case "A":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          const addedIndexA = handleAddCell(
            cellCursorIndex,
            "above",
            CellType.CODE,
          );
          if (addedIndexA !== null && addedIndexA !== -1) {
            setSelectedCellIndices(new Set([addedIndexA]));
            setCellCursorIndex(addedIndexA);
            setSelectionAnchorIndex(addedIndexA);
          }
          break;

        case "b":
        case "B":
          if (event.metaKey || event.ctrlKey) {
            preventDefault = false;
            break;
          }
          const addedIndexB = handleAddCell(
            cellCursorIndex,
            "below",
            CellType.CODE,
          );
          if (addedIndexB !== null && addedIndexB !== -1) {
            setSelectedCellIndices(new Set([addedIndexB]));
            setCellCursorIndex(addedIndexB);
            setSelectionAnchorIndex(addedIndexB);
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

            const newPastedIndices: number[] = [];
            setNotebook((prevNotebook) => {
              if (!prevNotebook) return null;

              // Apply any pending changes before pasting
              const notebookWithChanges = applyPendingChanges(prevNotebook);

              const cells = notebookWithChanges.cells.slice();
              let currentInsertPos = insertAtIndex;
              copiedCells.forEach((cellToPaste) => {
                // Ensure pasted cell has an ID
                const metadata = cellToPaste.metadata || {};
                const orion = metadata.orion || {};
                const id =
                  orion.id ||
                  (typeof crypto !== "undefined" && (crypto as any).randomUUID
                    ? (crypto as any).randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
                const cloned: any = JSON.parse(JSON.stringify(cellToPaste));
                cloned.metadata = {
                  ...(cloned.metadata || {}),
                  orion: { ...(cloned.metadata?.orion || {}), id },
                };
                cells.splice(currentInsertPos, 0, cloned);
                newPastedIndices.push(currentInsertPos);
                currentInsertPos++;
              });
              return { ...notebookWithChanges, cells } as any;
            });

            // NEW: Adjust indices for existing pending changes and refs
            if (newPastedIndices.length > 0) {
              const numPasted = copiedCells.length;

              // Create new maps to store adjusted indices
              const newPendingChanges = new Map<number, string>();
              const newModifiedCells = new Set<number>();
              const newCellRefs = new Map<
                number,
                { getSource: () => string; focusSource: () => void }
              >();

              // Adjust existing indices that are >= insertAtIndex
              pendingCellChangesRef.current.forEach((value, key) => {
                if (key >= insertAtIndex) {
                  newPendingChanges.set(key + numPasted, value);
                } else {
                  newPendingChanges.set(key, value);
                }
              });

              modifiedCellsRef.current.forEach((key) => {
                if (key >= insertAtIndex) {
                  newModifiedCells.add(key + numPasted);
                } else {
                  newModifiedCells.add(key);
                }
              });

              cellComponentRefs.current.forEach((value, key) => {
                if (key >= insertAtIndex) {
                  newCellRefs.set(key + numPasted, value);
                } else {
                  newCellRefs.set(key, value);
                }
              });

              // Update refs with adjusted indices
              pendingCellChangesRef.current = newPendingChanges;
              modifiedCellsRef.current = newModifiedCells;
              cellComponentRefs.current = newCellRefs;
              markDirty();

              // Clear pending changes since we've applied them
              pendingCellChangesRef.current.clear();

              setSelectedCellIndices(new Set(newPastedIndices));
              setCellCursorIndex(newPastedIndices[0]);
              setSelectionAnchorIndex(newPastedIndices[0]);
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
                setSelectedCellIndices(new Set([nextCellToSelect]));
                setCellCursorIndex(nextCellToSelect);
                setSelectionAnchorIndex(nextCellToSelect);
              } else {
                const newAddedIndex = handleAddCell(
                  lastRunIndex,
                  "below",
                  CellType.CODE,
                );
                if (newAddedIndex !== null && newAddedIndex !== -1) {
                  setSelectedCellIndices(new Set([newAddedIndex]));
                  setCellCursorIndex(newAddedIndex);
                  setSelectionAnchorIndex(newAddedIndex);
                }
              }
            }
          } else {
            // Plain Enter on a selected cell should enter edit mode
            if (cellCursorIndex !== null) {
              const cellRef = cellComponentRefs.current.get(cellCursorIndex);
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
      // After processing key, ensure the cell cursor is visible
      if (
        cellCursorIndex !== null &&
        (event.key.startsWith("Arrow") ||
          event.key.startsWith("Page") ||
          event.key === "Home" ||
          event.key === "End" ||
          event.key === "Enter" ||
          event.key === "a" ||
          event.key === "A" ||
          event.key === "b" ||
          event.key === "B")
      ) {
        setTimeout(() => scrollToCell(cellCursorIndex), 0);
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
    isAnyCellEditing,
    editingCellIndices,
    handleCellSelect,
    handleAddCell,
    handleDeleteSelectedCells,
    handleChangeCellTypes,
    handleRunCell,
    handleMentionCell,
    copiedCells,
    setCopiedCells,
    scrollToCell,
    handleCopySelectedCellsToClipboard,
    applyPendingChanges,
    markDirty,
  ]);

  useEffect(() => {
    if (activeNotebookView !== "notebook") {
      return;
    }

    if (cellCursorIndex !== null && cellRefs.current[cellCursorIndex]) {
      const cellElement = cellRefs.current[cellCursorIndex];
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
        cellElement.focus();
      }
    }
  }, [activeNotebookView, cellCursorIndex]);

  return (
    <>
      <div
        ref={notebookRootRef}
        data-keyboard-scope="notebook"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {/* Notebook Toolbar */}
        {/* 
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 shadow-sm">
          <NotebookToolbar
            onRunAll={handleRunAll} // This would now dispatch an event or be handled by parent
            onRestartKernel={handleRestartKernel} // Dispatch event or handled by parent
            onStopKernel={handleStopKernel} // Dispatch event or handled by parent
            onRestartAndRunAll={handleRestartAndRunAll} // Dispatch event or handled by parent
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

        {/* Remove focus outline for the notebook editor content area and its focusable children */}
        <style jsx global>{`
          .notebook-editor-content-area:focus,
          .notebook-editor-content-area:focus-visible,
          .notebook-editor-content-area *:focus {
            outline: none !important;
            box-shadow: none !important;
          }
        `}</style>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
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
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
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
                  onAppViewChange={handleAppViewChange}
                  onRemoveAppItem={handleRemoveAppViewItem}
                  onNotebookViewRequest={() =>
                    onActiveNotebookViewChange?.("notebook")
                  }
                />
              </div>
              <div
                aria-hidden={activeNotebookView !== "notebook"}
                inert={activeNotebookView !== "notebook" ? true : undefined}
                className={cn(
                  "notebook-editor-scroll [container-type:size] absolute inset-0 w-full overflow-y-auto overflow-x-hidden transition-opacity duration-150",
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
                            const newIndex = handleAddCell(
                              null,
                              "below",
                              CellType.CODE,
                            );
                            if (newIndex !== null && newIndex !== -1) {
                              setSelectedCellIndices(new Set([newIndex]));
                              setCellCursorIndex(newIndex);
                              setSelectionAnchorIndex(newIndex);
                              setTimeout(() => scrollToCell(newIndex), 0);
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
                      className="space-y-3 p-3 notebook-editor-content-area"
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
                      {notebook.cells.map((cell, index) => (
                        <div
                          key={index}
                          ref={(el) => {
                            cellRefs.current[index] = el;
                          }}
                          className={cn(
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
                            onCellAction={handleCellAction}
                            isSelected={selectedCellIndices.has(index)}
                            onEditingModeChange={handleEditingModeChange}
                            onUpdateCellMetadata={handleUpdateCellMetadata}
                            onUpdateCellData={handleUpdateCellData}
                            onRegisterRef={registerCellRef}
                            onContentChange={handleCellContentChange}
                            onMentionCell={handleMentionCell}
                            validationIssue={subagentValidation.cellIssues.get(
                              index,
                            )}
                            presentationHideAllCellInputs={
                              presentationHideAllCellInputs
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
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
