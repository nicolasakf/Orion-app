"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Monaco } from "@monaco-editor/react";
import { extname } from "path";

import { getMonacoLanguageForFilepath } from "@/lib/editor/monaco-language";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { isUserSettingsEditorPath } from "@/lib/settings/user-settings-editor-path";
import {
  loadUserSettingsRawFileFromApi,
  saveUserSettingsRawFileToApi,
} from "@/lib/settings/user-settings-file.client";
import { isSkillDefinitionPath } from "@/lib/skills/paths";
import {
  ORION_AGENT_FILE_MODIFIED_EVENT,
  type OpenDocumentSaveResult,
  type TextDocumentSnapshot,
} from "@/lib/agent/open-document-snapshots";
import { isRuleFilePath } from "@/lib/agent/rules";

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
  getSnapshot: (path: string) => TextDocumentSnapshot | null;
  saveOpenDocumentIfDirty: (path: string) => Promise<OpenDocumentSaveResult>;
  saveFile: () => Promise<void>;
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
    async (targetPath: string): Promise<boolean> => {
      if (!filepath) {
        fileContentRef.current = "";
        setFileContentState("");
        setFileLanguage("plaintext");
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        return true;
      }

      if (!isUserSettingsEditorPath(filepath) && !kernelService) {
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

        fileContentRef.current = content;
        setFileContentState(content);
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
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
    void loadFileFromSource(filepath ?? "");
  }, [filepath, loadFileFromSource]);

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

  useEffect(() => {
    const handleAgentFileModified = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: unknown }>).detail;
      if (!filepath || detail?.path !== filepath) return;
      void loadFileFromSource(filepath);
    };

    window.addEventListener(
      ORION_AGENT_FILE_MODIFIED_EVENT,
      handleAgentFileModified as EventListener,
    );
    return () => {
      window.removeEventListener(
        ORION_AGENT_FILE_MODIFIED_EVENT,
        handleAgentFileModified as EventListener,
      );
    };
  }, [filepath, loadFileFromSource]);

  /**
   * Persists the active dirty text buffer when it matches the requested path.
   */
  const saveOpenDocumentIfDirty = useCallback(
    async (path: string): Promise<OpenDocumentSaveResult> => {
      if (!filepath || path !== filepath) return { status: "not-open" };
      if (!isDirtyRef.current) return { status: "clean" };
      if (!isUserSettingsEditorPath(filepath) && !kernelService) {
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

        const contentsManager = kernelService!.getContentsManager();
        if (pathExtension === "ipynb" && openNotebookAsText) {
          await contentsManager.save(filepath, {
            type: "notebook",
            format: "json",
            content: JSON.parse(contentToSave) as unknown,
          });
        } else {
          await contentsManager.save(filepath, {
            type: "file",
            format: "text",
            content: contentToSave,
          });
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
    getSnapshot,
    saveOpenDocumentIfDirty,
    saveFile,
    handleRunInTerminal,
    handleMonacoMount,
  };
}
