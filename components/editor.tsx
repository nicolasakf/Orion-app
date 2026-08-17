"use client";

import { useEffect, useState } from "react";

import { EmptyEditorCard } from "@/components/empty-editor-card";
import { EditorLargeFileWarningCard } from "@/components/editor-large-file-warning-card";
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
import { DocumentSyncAlert } from "@/components/editors/document-sync-alert";
import { useTextFileModel } from "@/components/editors/use-text-file-model";
import { LARGE_FILE_WARNING_THRESHOLD_BYTES } from "@/lib/editor/large-file-warning";
import { isUserSettingsEditorPath } from "@/lib/settings/user-settings-editor-path";
import type { KernelStatus, KernelInfo, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type {
  OpenDocumentSaveResult,
  OpenDocumentSnapshotProvider,
} from "@/lib/agent/open-document-snapshots";
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
  /** When true, the empty editor shows business-mode shortcuts and actions. */
  businessMode?: boolean;
  /** Enables direct App View cell interactions from the Business shell's Edit toggle. */
  businessEditMode?: boolean;
  /** Opens the business-mode new-analysis naming dialog. */
  onNewAnalysis?: () => void;
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
  /** Reports an unresolved disk/editor divergence so autosave can pause. */
  onDocumentConflictChange?: (hasConflict: boolean) => void;
  onTextSnapshotGetterChange?: (
    getter: OpenDocumentSnapshotProvider["getTextSnapshot"] | null,
  ) => void;
  onNotebookSnapshotGetterChange?: (
    getter: OpenDocumentSnapshotProvider["getNotebookSnapshot"] | null,
  ) => void;
  onTextSaveHandlerChange?: (
    handler: ((path: string) => Promise<OpenDocumentSaveResult>) | null,
  ) => void;
  onNotebookSaveHandlerChange?: (
    handler: ((path: string) => Promise<OpenDocumentSaveResult>) | null,
  ) => void;
  /**
   * Called when opening a file fails so the parent can restore the previous selection.
   */
  onFileLoadError?: (failedFilepath: string, error?: unknown) => boolean | void;
  /**
   * Called when the user cancels an editor open before the file content loads.
   */
  onFileOpenCancel?: (filepath: string) => void;
  /** True when a workspace folder is selected in the Files panel (not merely connected). */
  hasWorkspace?: boolean;
  hasServerConnection?: boolean;
  canPromptForRuntime?: boolean;
  onConnectServer?: () => void;
  /** Currently selected workspace folder path, or null when no workspace is open. */
  workspaceDirectory?: string | null;
  /** Files to show in the connected empty-editor state. */
  recentFiles?: EditorFileReference[];
  /** Projects to show before a project is selected. */
  recentProjectPaths?: string[];
  /** Opens a file from the connected empty-editor state. */
  onOpenFile?: (file: EditorFileReference) => void;
  /** Changes the selected workspace from the connected empty-editor state. */
  onWorkspaceChange?: (path: string) => void;
  /**
   * Notebook only: hide all code cell inputs in the UI without persisting to metadata.
   */
  presentationHideAllCellInputs?: boolean;
  /** Notebook only: updates the transient global hide-input presentation state. */
  onSetPresentationHideAllCellInputs?: (hidden: boolean) => void;
}

/**
 * Resolves and renders the active Orion editor for the selected file.
 * Notebooks use the notebook editor; Markdown and text files share Monaco-backed
 * text state for loading, saving, and dirty tracking.
 */
export function Editor({
  filepath,
  openNotebookAsText = false,
  businessMode = false,
  businessEditMode = false,
  onNewAnalysis,
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
  onDocumentConflictChange,
  onTextSnapshotGetterChange,
  onNotebookSnapshotGetterChange,
  onTextSaveHandlerChange,
  onNotebookSaveHandlerChange,
  onFileLoadError,
  onFileOpenCancel,
  hasServerConnection = false,
  canPromptForRuntime = true,
  onConnectServer,
  workspaceDirectory,
  recentFiles,
  recentProjectPaths,
  onOpenFile,
  onWorkspaceChange,
  presentationHideAllCellInputs,
  onSetPresentationHideAllCellInputs,
}: EditorProps) {
  const activeEditor = resolveOrionEditorDefinition({
    path: filepath ?? undefined,
    openAsText: openNotebookAsText,
  });
  const isTextBackedEditor =
    activeEditor?.id === "text" || activeEditor?.id === "markdown";
  const [confirmedLargeFileKeys, setConfirmedLargeFileKeys] = useState<
    Set<string>
  >(() => new Set());
  const [largeFileWarning, setLargeFileWarning] = useState<{
    filepath: string;
    sizeBytes: number;
  } | null>(null);
  const [clearedLargeFileKeys, setClearedLargeFileKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const activeFileKey = filepath
    ? `${filepath}\u0000${openNotebookAsText ? "text" : "native"}`
    : null;
  const shouldCheckFileSize =
    !!filepath &&
    !!activeEditor &&
    !!kernelService &&
    !isUserSettingsEditorPath(filepath) &&
    (activeFileKey ? !confirmedLargeFileKeys.has(activeFileKey) : false);
  const shouldBlockEditorForLargeFile =
    !!filepath && largeFileWarning?.filepath === filepath;
  const isWaitingForFileSizeCheck =
    shouldCheckFileSize &&
    !!activeFileKey &&
    !clearedLargeFileKeys.has(activeFileKey) &&
    !shouldBlockEditorForLargeFile;
  const shouldGateEditorForFileSize =
    shouldBlockEditorForLargeFile || isWaitingForFileSizeCheck;

  const textFileModel = useTextFileModel({
    filepath:
      isTextBackedEditor && !shouldGateEditorForFileSize ? filepath : null,
    openNotebookAsText,
    kernelService,
    onUnsavedChangesChange,
    onFileLoadError,
  });
  const saveTextFile = textFileModel.saveFile;

  useEffect(() => {
    let cancelled = false;

    if (!shouldCheckFileSize || !filepath || !kernelService) {
      setLargeFileWarning((current) =>
        current?.filepath === filepath ? current : null,
      );
      return () => {
        cancelled = true;
      };
    }

    const checkFileSize = async () => {
      try {
        const contentsManager = kernelService.getContentsManager();
        const model = await contentsManager.get(filepath, { content: false });
        if (cancelled) return;

        const size =
          typeof model.size === "number" && Number.isFinite(model.size)
            ? model.size
            : null;
        if (size !== null && size >= LARGE_FILE_WARNING_THRESHOLD_BYTES) {
          setLargeFileWarning({ filepath, sizeBytes: size });
          return;
        }
        if (activeFileKey) {
          setClearedLargeFileKeys((current) => {
            const next = new Set(current);
            next.add(activeFileKey);
            return next;
          });
        }
        setLargeFileWarning((current) =>
          current?.filepath === filepath ? null : current,
        );
      } catch (error) {
        console.warn("Failed to check file size before opening editor:", error);
        if (!cancelled) {
          if (activeFileKey) {
            setClearedLargeFileKeys((current) => {
              const next = new Set(current);
              next.add(activeFileKey);
              return next;
            });
          }
          setLargeFileWarning((current) =>
            current?.filepath === filepath ? null : current,
          );
        }
      }
    };

    void checkFileSize();

    return () => {
      cancelled = true;
    };
  }, [activeFileKey, filepath, kernelService, shouldCheckFileSize]);

  /** Confirms that this large file should be loaded into the editor. */
  const handleOpenLargeFileAnyway = () => {
    if (!activeFileKey) return;
    setConfirmedLargeFileKeys((current) => {
      const next = new Set(current);
      next.add(activeFileKey);
      return next;
    });
    setLargeFileWarning(null);
  };

  /** Cancels opening the selected large file before loading content. */
  const handleCancelLargeFileOpen = () => {
    if (filepath) {
      onFileOpenCancel?.(filepath);
    }
    setLargeFileWarning(null);
  };

  useEffect(() => {
    if (!isTextBackedEditor) return;
    onDocumentConflictChange?.(
      textFileModel.documentSyncState.status === "conflicted",
    );
    return () => {
      onDocumentConflictChange?.(false);
    };
  }, [
    isTextBackedEditor,
    onDocumentConflictChange,
    textFileModel.documentSyncState.status,
  ]);

  useEffect(() => {
    onTextSnapshotGetterChange?.(
      isTextBackedEditor ? textFileModel.getSnapshot : null,
    );
    return () => {
      onTextSnapshotGetterChange?.(null);
    };
  }, [isTextBackedEditor, onTextSnapshotGetterChange, textFileModel.getSnapshot]);

  useEffect(() => {
    onTextSaveHandlerChange?.(
      isTextBackedEditor ? textFileModel.saveOpenDocumentIfDirty : null,
    );
    return () => {
      onTextSaveHandlerChange?.(null);
    };
  }, [
    isTextBackedEditor,
    onTextSaveHandlerChange,
    textFileModel.saveOpenDocumentIfDirty,
  ]);

  useEffect(() => {
    if (activeEditor?.id !== "notebook") {
      onNotebookSnapshotGetterChange?.(null);
      onNotebookSaveHandlerChange?.(null);
    }
  }, [
    activeEditor?.id,
    onNotebookSaveHandlerChange,
    onNotebookSnapshotGetterChange,
  ]);

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
    filepath && shouldBlockEditorForLargeFile && largeFileWarning ? (
      <EditorLargeFileWarningCard
        filepath={largeFileWarning.filepath}
        sizeBytes={largeFileWarning.sizeBytes}
        onOpenAnyway={handleOpenLargeFileAnyway}
        onCancel={handleCancelLargeFileOpen}
      />
    ) : filepath && isWaitingForFileSizeCheck ? (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-sidebar p-4 text-sm text-muted-foreground">
        Checking file size...
      </div>
    ) : filepath && ActiveEditor ? (
      <ActiveEditor
        filepath={filepath}
        openNotebookAsText={openNotebookAsText}
        businessMode={businessMode}
        businessEditMode={businessEditMode}
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
        onDocumentConflictChange={
          isTextBackedEditor ? undefined : onDocumentConflictChange
        }
        onFileLoadError={onFileLoadError}
        onNotebookSnapshotGetterChange={onNotebookSnapshotGetterChange}
        onNotebookSaveHandlerChange={onNotebookSaveHandlerChange}
        presentationHideAllCellInputs={presentationHideAllCellInputs}
        onSetPresentationHideAllCellInputs={onSetPresentationHideAllCellInputs}
        textFileModel={textFileModel}
      />
    ) : (
      <EmptyEditorCard
        kernelService={kernelService}
        recentFiles={recentFiles}
        recentProjectPaths={recentProjectPaths}
        workspaceDirectory={workspaceDirectory}
        hasServerConnection={hasServerConnection}
        canPromptForRuntime={canPromptForRuntime}
        onConnectServer={onConnectServer}
        onOpenFile={onOpenFile}
        onWorkspaceChange={onWorkspaceChange}
        businessMode={businessMode}
        onNewAnalysis={onNewAnalysis}
      />
    );

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
        {isTextBackedEditor ? (
          <DocumentSyncAlert
            state={textFileModel.documentSyncState}
            onSaveEditorVersion={textFileModel.saveFile}
            onReloadDiskVersion={textFileModel.reloadDiskVersion}
          />
        ) : null}
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
