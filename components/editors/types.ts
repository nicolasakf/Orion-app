import type React from "react";

import type { TextFileModelState } from "@/components/editors/use-text-file-model";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { EditorDefinition as BaseEditorDefinition } from "@/lib/editor/editor-registry";
import type { KernelInfo, KernelStatus, NotebookType } from "@/lib/types";

export interface EditorRuntimeProps {
  filepath: string;
  openNotebookAsText?: boolean;
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
  presentationHideAllCellInputs?: boolean;
  textFileModel?: TextFileModelState;
}

export interface EditorToolbarProps {
  currentKernel: KernelInfo | null;
  kernelStatus: KernelStatus;
  isRunning: boolean;
  presentationHideAllCellInputs: boolean;
  onRunAll: (stopOnError?: boolean) => void;
  onStopKernel: () => void | Promise<void>;
  onRestartKernel: () => void | Promise<void>;
  onRestartAndRunAll: () => void | Promise<void>;
  onTogglePresentationHideAllCellInputs: () => void;
}

export interface OrionEditorDefinition extends BaseEditorDefinition {
  Editor: React.ComponentType<EditorRuntimeProps>;
  Toolbar?: React.ComponentType<EditorToolbarProps>;
}
