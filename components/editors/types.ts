import type React from "react";

import type { TextFileModelState } from "@/components/editors/use-text-file-model";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { EditorDefinition as BaseEditorDefinition } from "@/lib/editor/editor-registry";
import type { RunAllTriggerSource } from "@/lib/notebook/notebook-execution-events";
import type { KernelInfo, KernelStatus, NotebookType } from "@/lib/types";
import type {
  OpenDocumentSaveResult,
  OpenDocumentSnapshotProvider,
} from "@/lib/agent/open-document-snapshots";

export interface EditorRuntimeProps {
  filepath: string;
  openNotebookAsText?: boolean;
  businessMode?: boolean;
  /** Enables direct App View cell interactions from the Business shell's Edit toggle. */
  businessEditMode?: boolean;
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
  presentationHideAllCellInputs?: boolean;
  onSetPresentationHideAllCellInputs?: (hidden: boolean) => void;
  textFileModel?: TextFileModelState;
}

export interface EditorToolbarProps {
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  isRunning: boolean;
  presentationHideAllCellInputs: boolean;
  onRunAll: (stopOnError?: boolean, triggerSource?: RunAllTriggerSource) => void;
  onStopKernel: () => void | Promise<void>;
  onRestartKernel: () => void | Promise<void>;
  onTogglePresentationHideAllCellInputs: () => void;
}

export interface OrionEditorDefinition extends BaseEditorDefinition {
  Editor: React.ComponentType<EditorRuntimeProps>;
  Toolbar?: React.ComponentType<EditorToolbarProps>;
}
