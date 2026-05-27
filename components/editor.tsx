"use client";

import { useEffect } from "react";

import { EmptyEditorCard } from "@/components/empty-editor-card";
import { WelcomeInstructionsCard } from "@/components/welcome-instructions-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveOrionEditorDefinition } from "@/components/editors/editor-definitions";
import { useTextFileModel } from "@/components/editors/use-text-file-model";
import type { KernelStatus, KernelInfo, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { OpenDocumentSnapshotProvider } from "@/lib/agent/open-document-snapshots";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";

interface EditorFileReference {
  name: string;
  path: string;
  openAsText?: boolean;
}

interface EditorProps {
  /**
   * Path to the file to be displayed (Jupyter-relative path)
   */
  filepath: string | null;
  /** Treat notebook files as plain JSON in Monaco instead of the notebook editor. */
  openNotebookAsText?: boolean;
  // Kernel related props
  kernelService?: KernelService | null;
  currentKernel?: KernelInfo | null;
  kernelStatus?: KernelStatus;
  isRunning?: boolean;
  executionCountRef?: MutableRefObject<number>;
  onKernelStatusChange?: Dispatch<SetStateAction<KernelStatus>>;
  onCurrentKernelChange?: Dispatch<SetStateAction<KernelInfo | null>>;
  onIsRunningChange?: Dispatch<SetStateAction<boolean>>;
  onNotebookChange?: (notebook: NotebookType | null) => void;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onTextSnapshotGetterChange?: (
    getter: OpenDocumentSnapshotProvider["getTextSnapshot"] | null,
  ) => void;
  onNotebookSnapshotGetterChange?: (
    getter: OpenDocumentSnapshotProvider["getNotebookSnapshot"] | null,
  ) => void;
  /**
   * Called when opening a file fails so the parent can restore the previous selection.
   */
  onFileLoadError?: (failedFilepath: string) => boolean | void;
  /** True when a workspace folder is selected in the Files panel (not merely connected). */
  hasWorkspace?: boolean;
  hasServerConnection?: boolean;
  onConnectServer?: () => void;
  /** Currently selected workspace folder path, or null when no workspace is open. */
  workspaceDirectory?: string | null;
  /** Files to show in the connected empty-editor state. */
  recentFiles?: EditorFileReference[];
  /** Opens a file from the connected empty-editor state. */
  onOpenFile?: (file: EditorFileReference) => void;
  /** Changes the selected workspace from the connected empty-editor state. */
  onWorkspaceChange?: (path: string) => void;
  /**
   * Notebook only: hide all code cell inputs in the UI without persisting to metadata.
   */
  presentationHideAllCellInputs?: boolean;
}

/**
 * Resolves and renders the active Orion editor for the selected file.
 * Notebooks use the notebook editor; Markdown and text files share Monaco-backed
 * text state for loading, saving, and dirty tracking.
 */
export function Editor({
  filepath,
  openNotebookAsText = false,
  kernelService,
  currentKernel,
  kernelStatus,
  isRunning,
  executionCountRef,
  onKernelStatusChange,
  onCurrentKernelChange,
  onIsRunningChange,
  onNotebookChange,
  onUnsavedChangesChange,
  onTextSnapshotGetterChange,
  onNotebookSnapshotGetterChange,
  onFileLoadError,
  hasWorkspace = false,
  hasServerConnection = false,
  onConnectServer,
  workspaceDirectory,
  recentFiles,
  onOpenFile,
  onWorkspaceChange,
  presentationHideAllCellInputs,
}: EditorProps) {
  const activeEditor = resolveOrionEditorDefinition({
    path: filepath ?? undefined,
    openAsText: openNotebookAsText,
  });
  const isTextBackedEditor =
    activeEditor?.id === "text" || activeEditor?.id === "markdown";

  const textFileModel = useTextFileModel({
    filepath: isTextBackedEditor ? filepath : null,
    openNotebookAsText,
    kernelService,
    onUnsavedChangesChange,
    onFileLoadError,
  });
  const saveTextFile = textFileModel.saveFile;

  useEffect(() => {
    onTextSnapshotGetterChange?.(
      isTextBackedEditor ? textFileModel.getSnapshot : null,
    );
    return () => {
      onTextSnapshotGetterChange?.(null);
    };
  }, [isTextBackedEditor, onTextSnapshotGetterChange, textFileModel.getSnapshot]);

  useEffect(() => {
    if (activeEditor?.id !== "notebook") {
      onNotebookSnapshotGetterChange?.(null);
    }
  }, [activeEditor?.id, onNotebookSnapshotGetterChange]);

  useEffect(() => {
    const handleSaveFile = () => {
      void saveTextFile();
    };

    window.addEventListener("saveFile", handleSaveFile as EventListener);

    return () => {
      window.removeEventListener("saveFile", handleSaveFile as EventListener);
    };
  }, [saveTextFile]);

  const ActiveEditor = activeEditor?.Editor;
  const editorContent =
    filepath && ActiveEditor ? (
      <ActiveEditor
        filepath={filepath}
        openNotebookAsText={openNotebookAsText}
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
        onNotebookSnapshotGetterChange={onNotebookSnapshotGetterChange}
        presentationHideAllCellInputs={presentationHideAllCellInputs}
        textFileModel={textFileModel}
      />
    ) : !hasServerConnection || !hasWorkspace ? (
      <WelcomeInstructionsCard
        jupyterConnected={hasServerConnection}
        workspaceOpen={hasWorkspace}
        onConnectServer={onConnectServer}
      />
    ) : (
      <EmptyEditorCard
        kernelService={kernelService}
        recentFiles={recentFiles}
        workspaceDirectory={workspaceDirectory}
        onOpenFile={onOpenFile}
        onWorkspaceChange={onWorkspaceChange}
      />
    );

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
        {editorContent}
      </div>
      <Dialog
        open={textFileModel.showErrorDialog}
        onOpenChange={textFileModel.setShowErrorDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>File Operation Error</DialogTitle>
            <DialogDescription>
              {textFileModel.errorDialogMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => textFileModel.setShowErrorDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
