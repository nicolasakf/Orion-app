"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { NotebookEditor } from "@/components/notebook/notebook-editor";
import { MonacoEditor } from "@/components/monaco-editor";
import { WelcomeInstructionsCard } from "@/components/welcome-instructions-card";
import { Monaco } from "@monaco-editor/react";
import { extname } from "path";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KernelStatus, KernelInfo, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import { isSkillDefinitionPath } from "@/lib/skills/paths";
import { useNotebookViewMode } from "@/contexts/notebook-view-mode-context";

// Add a global declaration for monaco
declare global {
  interface Window {
    monaco?: Monaco;
  }
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
  /**
   * Called when opening a file fails so the parent can restore the previous selection.
   */
  onFileLoadError?: (failedFilepath: string) => boolean | void;
  /** True when a workspace folder is selected in the Files panel (not merely connected). */
  hasWorkspace?: boolean;
  hasServerConnection?: boolean;
  onConnectServer?: () => void;
  /**
   * Notebook only: hide all code cell inputs in the UI without persisting to metadata.
   */
  presentationHideAllCellInputs?: boolean;
}

const MONACO_LANGUAGE_BY_EXTENSION: Partial<Record<string, string>> = {
  bash: "shell",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  htm: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  less: "less",
  lua: "lua",
  md: "markdown",
  markdown: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  ps1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scss: "scss",
  sh: "shell",
  sql: "sql",
  swift: "swift",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

/**
 * Resolves a Monaco language id without depending on Monaco already being mounted.
 */
function getLanguageForExtension(extension: string): string {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  const fallbackLanguage =
    MONACO_LANGUAGE_BY_EXTENSION[normalizedExtension] ?? "plaintext";

  if (
    typeof window === "undefined" ||
    !window.monaco ||
    !window.monaco.languages
  ) {
    return fallbackLanguage;
  }

  const languages = window.monaco.languages.getLanguages();
  const monacoExtension = `.${normalizedExtension}`;
  const foundLang = languages.find((lang) =>
    lang.extensions?.includes(monacoExtension),
  );

  return foundLang?.id ?? fallbackLanguage;
}

/**
 * Component that handles rendering different types of files based on their extension
 * Currently supports .ipynb files and other text files via Monaco Editor.
 * Language for text files is inferred using Monaco's language services.
 * A dialog is shown if there's an error reading the file.
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
  onFileLoadError,
  hasWorkspace = false,
  hasServerConnection = false,
  onConnectServer,
  presentationHideAllCellInputs,
}: EditorProps) {
  const { notebookViewMode, setNotebookViewMode } = useNotebookViewMode();
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLanguage, setFileLanguage] = useState<string>("plaintext");
  const [showErrorDialog, setShowErrorDialog] = useState<boolean>(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState<string>("");

  // Tracks whether the Monaco-based file has unsaved changes (not used for notebooks)
  const isMonacoDirtyRef = useRef(false);

  /** Marks the Monaco file as dirty and notifies parent (once per transition). */
  const markMonacoDirty = useCallback(() => {
    if (!isMonacoDirtyRef.current) {
      isMonacoDirtyRef.current = true;
      onUnsavedChangesChange?.(true);
    }
  }, [onUnsavedChangesChange]);

  /** Marks the Monaco file as clean and notifies parent (once per transition). */
  const markMonacoClean = useCallback(() => {
    if (isMonacoDirtyRef.current) {
      isMonacoDirtyRef.current = false;
      onUnsavedChangesChange?.(false);
    }
  }, [onUnsavedChangesChange]);

  /** Extension from path (synchronous). Must match render branch; do not rely on effect-updated state. */
  const pathExtension = filepath
    ? extname(filepath).slice(1).toLowerCase()
    : "";

  useEffect(() => {
    const loadFile = async () => {
      if (filepath && kernelService) {
        const currentExt = pathExtension;
        if (currentExt === "ipynb" && !openNotebookAsText) {
          return; // Notebook files are handled by the NotebookEditor component
        }

        try {
          setFileLanguage(
            currentExt === "ipynb" && openNotebookAsText
              ? "json"
              : getLanguageForExtension(currentExt),
          );

          // Read file content via Jupyter's ContentsManager
          const contentsManager = kernelService.getContentsManager();
          const model = await contentsManager.get(
            filepath,
            currentExt === "ipynb" && openNotebookAsText
              ? { content: true }
              : { content: true, format: "text" },
          );
          const content =
            typeof model.content === "string"
              ? model.content
              : JSON.stringify(model.content, null, 2);
          setFileContent(content);
          // File just loaded — no unsaved changes
          isMonacoDirtyRef.current = false;
          onUnsavedChangesChange?.(false);
        } catch (error) {
          console.error("Error loading or processing file:", error);
          const handledExternally = onFileLoadError?.(filepath) === true;
          if (handledExternally) {
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : "An unknown error occurred.";
          setErrorDialogMessage(
            `Failed to load file '${filepath}'. Reason: ${message}`,
          );
          setShowErrorDialog(true); // Show dialog for file read error
        }
      } else {
        // Clear content if no filepath or kernelService
        setFileContent("");
        setFileLanguage("plaintext");
        isMonacoDirtyRef.current = false;
        onUnsavedChangesChange?.(false);
      }
    };

    loadFile();
  }, [
    filepath,
    pathExtension,
    kernelService,
    onFileLoadError,
    onUnsavedChangesChange,
    openNotebookAsText,
  ]);

  /**
   * Saves the current file content via Jupyter's ContentsManager
   */
  const saveFile = useCallback(async () => {
    // Notebooks saving is handled by the NotebookEditor unless opened as text.
    if (
      kernelService &&
      filepath &&
      (pathExtension !== "ipynb" || openNotebookAsText)
    ) {
      if (!isMonacoDirtyRef.current) {
        return;
      }
      try {
        const contentsManager = kernelService.getContentsManager();
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
        markMonacoClean();
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
    }
  }, [
    kernelService,
    filepath,
    pathExtension,
    openNotebookAsText,
    fileContent,
    markMonacoClean,
  ]);

  // Listen for save file events
  useEffect(() => {
    const handleSaveFile = () => {
      saveFile();
    };

    window.addEventListener("saveFile", handleSaveFile as EventListener);

    return () => {
      window.removeEventListener("saveFile", handleSaveFile as EventListener);
    };
  }, [saveFile]);

  /**
   * Dispatches a custom event to the TerminalPanel requesting code execution.
   * For .R and .py files, includes a preLaunch command so a new terminal
   * automatically starts the appropriate REPL before pasting the code.
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

  const FileOperationErrorDialog = () => {
    return (
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>File Operation Error</DialogTitle>
            <DialogDescription>{errorDialogMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  let editorContent: ReactNode = null;

  if (filepath) {
    if (pathExtension === "ipynb" && !openNotebookAsText) {
      editorContent = (
        <NotebookEditor
          filepath={filepath}
          // Pass through kernel props
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
          presentationHideAllCellInputs={presentationHideAllCellInputs}
          activeNotebookView={notebookViewMode}
          onActiveNotebookViewChange={setNotebookViewMode}
        />
      );
    } else {
      editorContent = (
        <MonacoEditor
          value={fileContent}
          onChange={(value) => {
            setFileContent(value);
            markMonacoDirty();
          }}
          language={fileLanguage}
          lightThemeOverride={{
            colors: {
              "editor.background": "#F5F5F5",
            },
          }}
          darkThemeOverride={{
            colors: {
              "editor.background": "#131316",
            },
          }}
          height="100%"
          className="w-full h-full"
          isNotebook={false}
          onRunInTerminal={handleRunInTerminal}
          referencePath={filepath}
        />
      );
    }
  } else if (!hasServerConnection || !hasWorkspace) {
    editorContent = (
      <WelcomeInstructionsCard
        jupyterConnected={hasServerConnection}
        workspaceOpen={hasWorkspace}
        onConnectServer={onConnectServer}
      />
    );
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
        {editorContent}
      </div>
      <FileOperationErrorDialog />
    </>
  );
}
