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

interface UseTextFileModelOptions {
  filepath: string | null;
  openNotebookAsText?: boolean;
  kernelService?: KernelService | null;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onFileLoadError?: (failedFilepath: string) => boolean | void;
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

  const pathExtension = filepath
    ? extname(filepath).slice(1).toLowerCase()
    : "";

  /** Marks the file as dirty and notifies the page once per transition. */
  const markDirty = useCallback(() => {
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
    setFileContentState(content);
  }, []);

  useEffect(() => {
    const loadFile = async () => {
      if (!filepath) {
        setFileContentState("");
        setFileLanguage("plaintext");
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        return;
      }

      if (!isUserSettingsEditorPath(filepath) && !kernelService) {
        setFileContentState("");
        setFileLanguage("plaintext");
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
        return;
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
          setFileContentState(file.content);
          isDirtyRef.current = false;
          onUnsavedChangesChange?.(false);
          return;
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

        setFileContentState(content);
        isDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
      } catch (error) {
        console.error("Error loading or processing file:", error);
        const handledExternally = onFileLoadError?.(filepath) === true;
        if (handledExternally) return;

        const message =
          error instanceof Error
            ? error.message
            : "An unknown error occurred.";
        setErrorDialogMessage(
          `Failed to load file '${filepath}'. Reason: ${message}`,
        );
        setShowErrorDialog(true);
      }
    };

    void loadFile();
  }, [
    filepath,
    pathExtension,
    kernelService,
    onFileLoadError,
    onUnsavedChangesChange,
    openNotebookAsText,
  ]);

  /** Saves current text content through Jupyter ContentsManager or the settings file API. */
  const saveFile = useCallback(async () => {
    if (!filepath) return;
    if (!isUserSettingsEditorPath(filepath) && !kernelService) return;
    if (pathExtension === "ipynb" && !openNotebookAsText) return;
    if (!isDirtyRef.current) return;

    try {
      if (isUserSettingsEditorPath(filepath)) {
        await saveUserSettingsRawFileToApi(fileContent);
        markClean();
        window.dispatchEvent(new CustomEvent("orion:user-settings-file-changed"));
        console.log("User settings file saved successfully");
        return;
      }

      const contentsManager = kernelService!.getContentsManager();
      if (pathExtension === "ipynb" && openNotebookAsText) {
        await contentsManager.save(filepath, {
          type: "notebook",
          format: "json",
          content: JSON.parse(fileContent) as unknown,
        });
      } else {
        await contentsManager.save(filepath, {
          type: "file",
          format: "text",
          content: fileContent,
        });
      }

      markClean();
      if (isSkillDefinitionPath(filepath)) {
        window.dispatchEvent(
          new CustomEvent("orion:skills-changed", {
            detail: { path: filepath },
          }),
        );
      }
      console.log("File saved successfully");
    } catch (error) {
      console.error("Error saving file:", error);
    }
  }, [
    kernelService,
    filepath,
    pathExtension,
    openNotebookAsText,
    fileContent,
    markClean,
  ]);

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
    saveFile,
    handleRunInTerminal,
    handleMonacoMount,
  };
}
