"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Monaco } from "@monaco-editor/react";
import { extname } from "path";
import { toast } from "sonner";

import { getMonacoLanguageForFilepath } from "@/lib/editor/monaco-language";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { isOrionHomeEditorPath } from "@/lib/local/orion-home-editor-path";
import {
  isPersonalContextEditorPath,
  PERSONAL_CONTEXT_FILE_CHANGED_EVENT,
} from "@/lib/onboarding/personal-context-editor-path";
import {
  loadPersonalContextFileFromApi,
  savePersonalContextFileToApi,
} from "@/lib/onboarding/personal-context-file.client";
import { isUserSettingsEditorPath } from "@/lib/settings/user-settings-editor-path";
import {
  loadUserSettingsRawFileFromApi,
  saveUserSettingsRawFileToApi,
} from "@/lib/settings/user-settings-file.client";
import { isSkillDefinitionPath } from "@/lib/skills/paths";
import {
  type OpenDocumentSaveResult,
  type TextDocumentSnapshot,
} from "@/lib/agent/open-document-snapshots";
import { isRuleFilePath } from "@/lib/agent/rules";
import {
  dispatchActiveDocumentDeleted,
  dispatchActiveDocumentRenamed,
  useActiveDocumentSync,
  type ActiveDocumentSyncController,
  type ActiveDocumentSyncState,
} from "@/hooks/use-active-document-sync";

interface UseTextFileModelOptions {
  filepath: string | null;
  openNotebookAsText?: boolean;
  kernelService?: KernelService | null;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onFileLoadError?: (failedFilepath: string, error?: unknown) => boolean | void;
}

export interface TextFileModelState {
  fileContent: string;
  fileLanguage: string;
  pathExtension: string;
  showErrorDialog: boolean;
  errorDialogMessage: string;
  setShowErrorDialog: (show: boolean) => void;
  setFileContent: (content: string) => void;
  markDirty: () => void;
  documentSyncState: ActiveDocumentSyncState;
  getSnapshot: (path: string) => TextDocumentSnapshot | null;
  saveOpenDocumentIfDirty: (path: string) => Promise<OpenDocumentSaveResult>;
  saveFile: () => Promise<void>;
  reloadDiskVersion: () => Promise<void>;
  handleRunInTerminal: (code: string) => void;
  handleMonacoMount: (_editor: unknown, monaco: Monaco) => void;
}

/**
 * Loads, tracks, and saves Monaco-backed file content through Jupyter
 * ContentsManager. Used by both plain text and Markdown editors.
 */
export function useTextFileModel({
  filepath,
  openNotebookAsText = false,
  kernelService,
  onUnsavedChangesChange,
  onFileLoadError,
}: UseTextFileModelOptions): TextFileModelState {
  const [fileContent, setFileContentState] = useState<string>("");
  const [fileLanguage, setFileLanguage] = useState<string>("plaintext");
  const [showErrorDialog, setShowErrorDialog] = useState<boolean>(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState<string>("");
  const isDirtyRef = useRef(false);
  const dirtyVersionRef = useRef(0);
  const fileContentRef = useRef("");
  const documentSyncRef = useRef<ActiveDocumentSyncController | null>(null);
  const preserveDirtyRenameToRef = useRef<string | null>(null);

  const pathExtension = filepath
    ? extname(filepath).slice(1).toLowerCase()
    : "";

  /** Marks the file as dirty and notifies the page once per transition. */
  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      onUnsavedChangesChange?.(true);
    }
  }, [onUnsavedChangesChange]);

  /** Marks the file as clean and notifies the page once per transition. */
  const markClean = useCallback(() => {
    if (isDirtyRef.current) {
      isDirtyRef.current = false;
      onUnsavedChangesChange?.(false);
    }
  }, [onUnsavedChangesChange]);

  /** Updates content without changing dirty state. */
  const setFileContent = useCallback((content: string) => {
    fileContentRef.current = content;
    setFileContentState(content);
  }, []);

  /**
   * Loads the current file from Orion's backing store and updates editor state.
   */
  const loadFileFromSource = useCallback(
    async (
      targetPath: string,
      expectedDirtyVersion?: number,
    ): Promise<boolean> => {
      if (!filepath) {
        fileContentRef.current = "";
        setFileContentState("");
        setFileLanguage("plaintext");
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        return true;
      }

      if (!isOrionHomeEditorPath(filepath) && !kernelService) {
        fileContentRef.current = "";
        setFileContentState("");
        setFileLanguage("plaintext");
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        return true;
      }

      try {
        setFileLanguage(
          isUserSettingsEditorPath(filepath)
            ? "json"
            : isPersonalContextEditorPath(filepath)
              ? "markdown"
              : pathExtension === "ipynb" && openNotebookAsText
                ? "json"
                : getMonacoLanguageForFilepath(filepath),
        );

        if (isUserSettingsEditorPath(filepath)) {
          const file = await loadUserSettingsRawFileFromApi();
          fileContentRef.current = file.content;
          setFileContentState(file.content);
          isDirtyRef.current = false;
          onUnsavedChangesChange?.(false);
          return true;
        }

        if (isPersonalContextEditorPath(filepath)) {
          const file = await loadPersonalContextFileFromApi();
          fileContentRef.current = file.content;
          setFileContentState(file.content);
          isDirtyRef.current = false;
          onUnsavedChangesChange?.(false);
          return true;
        }

        const contentsManager = kernelService!.getContentsManager();
        const model = await contentsManager.get(
          filepath,
          pathExtension === "ipynb" && openNotebookAsText
            ? { content: true }
            : { content: true, format: "text" },
        );
        const content =
          typeof model.content === "string"
            ? model.content
            : JSON.stringify(model.content, null, 2);

        // Never replace edits made while an external reload was awaiting I/O.
        if (
          expectedDirtyVersion !== undefined &&
          dirtyVersionRef.current !== expectedDirtyVersion
        ) {
          return false;
        }

        fileContentRef.current = content;
        setFileContentState(content);
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        documentSyncRef.current?.recordLoadedModel(model);
        return true;
      } catch (error) {
        console.error("Error loading or processing file:", error);
        const handledExternally = onFileLoadError?.(targetPath, error) === true;
        if (handledExternally) return false;

        const message =
          error instanceof Error
            ? error.message
            : "An unknown error occurred.";
        setErrorDialogMessage(
          `Failed to load file '${targetPath}'. Reason: ${message}`,
        );
        setShowErrorDialog(true);
        return false;
      }
    },
    [
      filepath,
      pathExtension,
      kernelService,
      onFileLoadError,
      onUnsavedChangesChange,
      openNotebookAsText,
    ],
  );

  useEffect(() => {
    if (
      preserveDirtyRenameToRef.current === filepath &&
      isDirtyRef.current
    ) {
      preserveDirtyRenameToRef.current = null;
      return;
    }
    void loadFileFromSource(filepath ?? "");
  }, [filepath, loadFileFromSource]);

  useEffect(() => {
    if (!isPersonalContextEditorPath(filepath)) return;

    const handlePersonalContextFileChanged = () => {
      if (isDirtyRef.current) return;
      void loadFileFromSource(filepath ?? "");
    };

    window.addEventListener(
      PERSONAL_CONTEXT_FILE_CHANGED_EVENT,
      handlePersonalContextFileChanged,
    );
    return () => {
      window.removeEventListener(
        PERSONAL_CONTEXT_FILE_CHANGED_EVENT,
        handlePersonalContextFileChanged,
      );
    };
  }, [filepath, loadFileFromSource]);

  const documentSync = useActiveDocumentSync({
    path:
      filepath && !isOrionHomeEditorPath(filepath)
        ? filepath
        : null,
    contentsManager: kernelService?.getContentsManager() ?? null,
    isDirty: () => isDirtyRef.current,
    onReload: async () => {
      const dirtyVersionBeforeReload = dirtyVersionRef.current;
      const loaded = await loadFileFromSource(
        filepath ?? "",
        dirtyVersionBeforeReload,
      );
      if (!loaded) throw new Error(`Could not reload '${filepath ?? ""}'.`);
    },
    onDeleted: (source) => {
      if (isDirtyRef.current || !filepath) return;
      if (source === "contents-manager") {
        dispatchActiveDocumentDeleted({ path: filepath });
        return;
      }
      const error = Object.assign(new Error(`File '${filepath}' no longer exists.`), {
        response: { status: 404 },
      });
      onFileLoadError?.(filepath, error);
    },
    onRenamed: (newPath) => {
      if (!filepath) return;
      if (isDirtyRef.current) {
        preserveDirtyRenameToRef.current = newPath;
      }
      dispatchActiveDocumentRenamed({ oldPath: filepath, newPath });
    },
  });
  documentSyncRef.current = documentSync;

  /**
   * Return the active in-memory text buffer for agent tools.
   */
  const getSnapshot = useCallback(
    (path: string): TextDocumentSnapshot | null => {
      if (!filepath || path !== filepath) return null;
      return {
        content: fileContentRef.current,
        dirty: isDirtyRef.current,
        source: "editor-buffer",
      };
    },
    [filepath],
  );

  /**
   * Persists the active dirty text buffer when it matches the requested path.
   */
  const saveOpenDocumentIfDirty = useCallback(
    async (path: string): Promise<OpenDocumentSaveResult> => {
      if (!filepath || path !== filepath) return { status: "not-open" };
      if (!isDirtyRef.current) return { status: "clean" };
      if (!isOrionHomeEditorPath(filepath) && !kernelService) {
        return {
          status: "error",
          message: "Cannot save the open text editor without a Jupyter connection.",
        };
      }
      if (pathExtension === "ipynb" && !openNotebookAsText) {
        return { status: "not-open" };
      }

      try {
        const contentToSave = fileContentRef.current;
        const dirtyVersionToSave = dirtyVersionRef.current;
        if (isUserSettingsEditorPath(filepath)) {
          await saveUserSettingsRawFileToApi(contentToSave);
          if (dirtyVersionRef.current === dirtyVersionToSave) {
            markClean();
          }
          window.dispatchEvent(new CustomEvent("orion:user-settings-file-changed"));
          console.log("User settings file saved successfully");
          return { status: "saved" };
        }

        if (isPersonalContextEditorPath(filepath)) {
          await savePersonalContextFileToApi(contentToSave);
          if (dirtyVersionRef.current === dirtyVersionToSave) {
            markClean();
          }
          window.dispatchEvent(new CustomEvent(PERSONAL_CONTEXT_FILE_CHANGED_EVENT));
          console.log("Personal context file saved successfully");
          return { status: "saved" };
        }

        const contentsManager = kernelService!.getContentsManager();
        const writeFile = () =>
          pathExtension === "ipynb" && openNotebookAsText
            ? contentsManager.save(filepath, {
                type: "notebook",
                format: "json",
                content: JSON.parse(contentToSave) as unknown,
              })
            : contentsManager.save(filepath, {
                type: "file",
                format: "text",
                content: contentToSave,
              });
        const documentSyncController = documentSyncRef.current;
        if (documentSyncController) {
          await documentSyncController.runLocalWrite(writeFile);
        } else {
          await writeFile();
        }

        if (dirtyVersionRef.current === dirtyVersionToSave) {
          markClean();
        }
        if (isSkillDefinitionPath(filepath)) {
          window.dispatchEvent(
            new CustomEvent("orion:skills-changed", {
              detail: { path: filepath },
            }),
          );
        }
        if (isRuleFilePath(filepath)) {
          window.dispatchEvent(
            new CustomEvent("orion:rules-changed", {
              detail: { path: filepath },
            }),
          );
        }
        console.log("File saved successfully");
        return { status: "saved" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error saving file:", error);
        if (isPersonalContextEditorPath(filepath)) {
          toast.error(message);
        }
        return { status: "error", message };
      }
    },
    [
      kernelService,
      filepath,
      pathExtension,
      openNotebookAsText,
      markClean,
    ],
  );

  /** Saves current text content through Jupyter ContentsManager or the settings file API. */
  const saveFile = useCallback(async () => {
    if (!filepath) return;
    await saveOpenDocumentIfDirty(filepath);
  }, [filepath, saveOpenDocumentIfDirty]);

  /** Discards the editor buffer only after explicit user confirmation. */
  const reloadDiskVersion = useCallback(async (): Promise<void> => {
    if (
      isDirtyRef.current &&
      !window.confirm("Discard your unsaved editor changes and reload the version on disk?")
    ) {
      return;
    }
    await documentSync.reloadDiskVersion();
  }, [documentSync]);

  /**
   * Sends code to the terminal and starts a language REPL for Python/R files
   * when the target terminal session is new.
   */
  const handleRunInTerminal = useCallback(
    (code: string) => {
      const preLaunch =
        pathExtension === "r"
          ? "R"
          : pathExtension === "py"
            ? "python"
            : undefined;
      window.dispatchEvent(
        new CustomEvent("orion:run-in-terminal", {
          detail: { code, preLaunch },
        }),
      );
    },
    [pathExtension],
  );

  /** Re-resolves language once Monaco has loaded its registry. */
  const handleMonacoMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      if (filepath) {
        setFileLanguage(
          pathExtension === "ipynb" && openNotebookAsText
            ? "json"
            : getMonacoLanguageForFilepath(filepath, monaco),
        );
      }
    },
    [filepath, openNotebookAsText, pathExtension],
  );

  return {
    fileContent,
    fileLanguage,
    pathExtension,
    showErrorDialog,
    errorDialogMessage,
    setShowErrorDialog,
    setFileContent,
    markDirty,
    documentSyncState: documentSync.state,
    getSnapshot,
    saveOpenDocumentIfDirty,
    saveFile,
    reloadDiskVersion,
    handleRunInTerminal,
    handleMonacoMount,
  };
}
