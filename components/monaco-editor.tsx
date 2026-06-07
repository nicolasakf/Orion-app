"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import type { EditorProps, Monaco, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor/esm/vs/editor/editor.api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useOrionSetting } from "@/hooks/use-orion-settings";
import { useTheme } from "next-themes";
import { registerPythonLanguageWithMultilineFStringFix } from "@/lib/editor/python-monaco-tokenizer";

const MonacoReactEditor = dynamic<EditorProps>(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  { ssr: false }
);

// Custom theme definitions
const customLightTheme: editor.IStandaloneThemeData = {
  base: "vs" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "#008000", fontStyle: "italic" }, // Green comments
    { token: "keyword", foreground: "#0000FF", fontStyle: "bold" }, // Blue keywords
    { token: "string", foreground: "#A31515" }, // Red strings
    { token: "number", foreground: "#098658" }, // Green numbers
    { token: "type", foreground: "#267F99" }, // Teal types
    { token: "function", foreground: "#795E26" }, // Brown functions
    { token: "variable", foreground: "#001080" }, // Dark blue variables
  ],
  colors: {
    "editor.background": "#F7F7F7",
    "editor.foreground": "#000000",
    "editorLineNumber.foreground": "#808080",
    "editorLineNumber.activeForeground": "#000000",
    "editor.selectionBackground": "#ADD6FF",
    "editor.selectionHighlightBackground": "#E0E0E0",
    "editor.lineHighlightBackground": "#F7F7F7",
    "editorCursor.foreground": "#000000",
    "editorWhitespace.foreground": "#BFBFBF",
    "editorIndentGuide.background": "#D3D3D3",
    "editorIndentGuide.activeBackground": "#939393",
  },
};

const customDarkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "#6A9955", fontStyle: "italic" }, // Green comments
    { token: "keyword", foreground: "#569CD6", fontStyle: "bold" }, // Light blue keywords
    { token: "string", foreground: "#CE9178" }, // Orange strings
    { token: "number", foreground: "#B5CEA8" }, // Light green numbers
    { token: "type", foreground: "#4EC9B0" }, // Cyan types
    { token: "function", foreground: "#DCDCAA" }, // Yellow functions
    { token: "variable", foreground: "#9CDCFE" }, // Light blue variables
  ],
  colors: {
    "editor.background": "#1E1E1E",
    "editor.foreground": "#D4D4D4",
    "editorLineNumber.foreground": "#858585",
    "editorLineNumber.activeForeground": "#C6C6C6",
    "editor.selectionBackground": "#264F78",
    "editor.selectionHighlightBackground": "#3A3D41",
    "editor.lineHighlightBackground": "#2A2D2E",
    "editorCursor.foreground": "#AEAFAD",
    "editorWhitespace.foreground": "#404040",
    "editorIndentGuide.background": "#404040",
    "editorIndentGuide.activeBackground": "#707070",
  },
};

/**
 * MonacoEditorProps interface that extends EditorProps from monaco-editor.
 *
 * @interface MonacoEditorProps
 * @extends {EditorProps}
 * @property {string} value - The initial value of the editor
 * @property {(value: string) => void} onChange - Function called when editor content changes
 * @property {string} [language="javascript"] - The language for syntax highlighting
 * @property {string} [height="auto"] - The height of the editor. When set to "auto", will adjust based on content
 * @property {string} [className] - Additional CSS classes
 * @property {OnMount} [onMount] - Function called when editor is mounted
 * @property {number} [minHeight=100] - Minimum height when in auto mode
 * @property {number|null} [maxHeight=null] - Maximum height when in auto mode, or null for unlimited height
 * @property {boolean} [isNotebook=false] - Whether the editor is displaying a notebook file
 * @property {() => void} [onEditorFocus] - Function called when editor is focused
 * @property {() => void} [onEditorBlur] - Function called when editor is blurred
 * @property {(code: string) => void} [onRunInTerminal] - Called with selected text (or current line) when Cmd+Enter is pressed in non-notebook mode
 * @property {string} [referencePath] - Jupyter-relative path used when Cmd+I attaches the current selection to chat
 * @property {number} [referenceNotebookCellIndex] - Notebook cell index when the selection belongs to a cell source editor
 * @property {"on" | "off"} [wordWrapOverride] - When set, overrides global editor word wrap (e.g. per-cell markdown toggle)
 * @property {boolean} [suppressHorizontalScrollbar] - When true, hides horizontal scrollbar so wrapped text stays within container width
 */
interface MonacoEditorProps extends Omit<EditorProps, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: string;
  className?: string;
  onMount?: OnMount;
  minHeight?: number;
  maxHeight?: number | null;
  isNotebook?: boolean;
  onEditorFocus?: () => void;
  onEditorBlur?: () => void;
  lightThemeOverride?: Partial<editor.IStandaloneThemeData>;
  darkThemeOverride?: Partial<editor.IStandaloneThemeData>;
  onRunInTerminal?: (code: string) => void;
  referencePath?: string;
  referenceNotebookCellIndex?: number;
  wordWrapOverride?: "on" | "off";
  suppressHorizontalScrollbar?: boolean;
}

/**
 * Monaco Editor component which provides a code editor similar to VS Code
 * with auto-height adjustment based on content.
 *
 * @param {MonacoEditorProps} props - Component props
 * @returns {React.ReactElement} Rendered Monaco Editor component
 */
export function MonacoEditor({
  value,
  onChange,
  language = "javascript",
  height = "auto",
  className,
  onMount,
  minHeight = 10,
  maxHeight = null,
  isNotebook = false,
  onEditorFocus,
  onEditorBlur,
  lightThemeOverride,
  darkThemeOverride,
  onRunInTerminal,
  referencePath,
  referenceNotebookCellIndex,
  wordWrapOverride,
  suppressHorizontalScrollbar = false,
  ...props
}: MonacoEditorProps): React.ReactElement {
  const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
  const [editorValue, setEditorValue] = useState<string>(value);
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(false);
  const [editorHeight, setEditorHeight] = useState<string>(
    height === "auto" ? `${minHeight}px` : height
  );
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const { resolvedTheme } = useTheme();
  const editorSettings = useOrionSetting((settings) => settings.editor);
  const wordWrapEffective = wordWrapOverride ?? editorSettings.wordWrap;

  // Keep a stable ref to onRunInTerminal so the registered keybinding always calls the latest prop
  const onRunInTerminalRef = useRef(onRunInTerminal);
  useEffect(() => {
    onRunInTerminalRef.current = onRunInTerminal;
  }, [onRunInTerminal]);

  const referenceContextRef = useRef({ referencePath, referenceNotebookCellIndex });
  useEffect(() => {
    referenceContextRef.current = { referencePath, referenceNotebookCellIndex };
  }, [referenceNotebookCellIndex, referencePath]);

  /** Dispatches the active editor selection, or current line, as a chat attachment reference. */
  const dispatchSelectedReference = useCallback((): boolean => {
    const editor = editorInstanceRef.current;
    const model = editor?.getModel?.();
    const selection = editor?.getSelection?.();
    const context = referenceContextRef.current;
    if (!model || !selection || !context.referencePath) {
      return false;
    }

    let lineStart = selection.startLineNumber;
    let lineEnd = selection.endLineNumber;
    let selectedText = model.getValueInRange(selection);
    if (selection.isEmpty()) {
      const position = editor?.getPosition?.();
      if (!position) return false;
      lineStart = position.lineNumber;
      lineEnd = position.lineNumber;
      selectedText = model.getLineContent(position.lineNumber);
    }

    if (!selectedText.trim()) return false;

    window.dispatchEvent(
      new CustomEvent("orion:attach-editor-selection", {
        detail: {
          path: context.referencePath,
          lineStart,
          lineEnd,
          selectedText,
          notebookCellIndex: context.referenceNotebookCellIndex,
        },
      }),
    );
    return true;
  }, []);

  const finalLightTheme: editor.IStandaloneThemeData = {
    ...customLightTheme,
    ...lightThemeOverride,
    rules: [...customLightTheme.rules, ...(lightThemeOverride?.rules || [])],
    colors: {
      ...customLightTheme.colors,
      ...(lightThemeOverride?.colors || {}),
    },
  };

  const finalDarkTheme: editor.IStandaloneThemeData = {
    ...customDarkTheme,
    ...darkThemeOverride,
    rules: [...customDarkTheme.rules, ...(darkThemeOverride?.rules || [])],
    colors: { ...customDarkTheme.colors, ...(darkThemeOverride?.colors || {}) },
  };

  // Update editor value when prop value changes
  useEffect(() => {
    if (value !== editorValue) {
      setEditorValue(value);
    }
  }, [value, editorValue]);

  // Update editor height when content changes
  const updateEditorHeight = () => {
    if (height === "auto" && editorInstanceRef.current) {
      const contentHeight = editorInstanceRef.current.getContentHeight();
      const newHeight =
        maxHeight !== null
          ? Math.min(maxHeight, Math.max(minHeight, contentHeight))
          : Math.max(minHeight, contentHeight);
      setEditorHeight(`${newHeight}px`);
    }
  };

  // Set up listener for content size changes
  useEffect(() => {
    if (isEditorReady && editorInstanceRef.current && height === "auto") {
      const disposable =
        editorInstanceRef.current.onDidContentSizeChange(updateEditorHeight);

      // Initial height update
      updateEditorHeight();

      return () => {
        disposable?.dispose();
      };
    }
  }, [isEditorReady, height, minHeight, maxHeight]);

  // Prevent wheel events from being captured by the editor when not focused
  // but only for notebook files
  useEffect(() => {
    const editorElement = editorContainerRef.current;
    if (!editorElement) return;

    const handleWheel = (e: WheelEvent) => {
      if (!isEditorFocused && isNotebook) {
        // If editor is not focused and it's a notebook, prevent it from capturing the event
        e.stopPropagation();
      }
    };

    // Use capture phase to intercept the wheel event before Monaco gets it
    editorElement.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      editorElement.removeEventListener("wheel", handleWheel, {
        capture: true,
      });
    };
  }, [isEditorFocused, isNotebook]);

  /**
   * Handles editor mount
   *
   * @param {any} editor - The Monaco editor instance
   * @param {Monaco} monaco - The Monaco API
   */
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setIsEditorReady(true);
    editorInstanceRef.current = editor;

    // Define custom themes
    monaco.editor.defineTheme("orion-light", finalLightTheme);
    monaco.editor.defineTheme("orion-dark", finalDarkTheme);

    // Set the appropriate theme based on current app theme
    const currentTheme =
      resolvedTheme === "dark" ? "orion-dark" : "orion-light";
    monaco.editor.setTheme(currentTheme);

    // Configure editor settings
    editor.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
      autoIndent: "full",
      minimap: { enabled: editorSettings.minimapEnabled },
      fontSize: editorSettings.fontSize,
      wordWrap: wordWrapEffective,
      scrollbar: {
        vertical: height === "auto" ? "hidden" : "auto",
        verticalScrollbarSize: height === "auto" ? 0 : 10,
        horizontal: suppressHorizontalScrollbar ? "hidden" : "auto",
        alwaysConsumeMouseWheel: false,
      },
    });

    // Add focus and blur event listeners
    editor.onDidFocusEditorWidget(() => {
      setIsEditorFocused(true);
      onEditorFocus?.();
    });
    editor.onDidBlurEditorWidget(() => {
      setIsEditorFocused(false);
      onEditorBlur?.();
    });

    // Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux): send selection or current line to terminal.
    // Only active in non-notebook mode so notebook cell execution is not affected.
    if (!isNotebook) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          const model = editor.getModel();
          if (!model) return;

          const selection = editor.getSelection();
          let code: string;

          if (selection && !selection.isEmpty()) {
            code = model.getValueInRange(selection);
          } else {
            const position = editor.getPosition();
            if (!position) return;
            code = model.getLineContent(position.lineNumber);
            // Advance cursor one line (clamped by Monaco at EOF)
            editor.setPosition({
              lineNumber: position.lineNumber + 1,
              column: 1,
            });
          }

          onRunInTerminalRef.current?.(code);
        }
      );
    }

    // Cmd+I / Ctrl+I: attach the highlighted editor range to the chat composer.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      dispatchSelectedReference();
    });

    // Initial height adjustment
    if (height === "auto") {
      updateEditorHeight();
    }

    // Call user provided onMount if available
    if (onMount) {
      onMount(editor, monaco);
    }
  };

  // Navigate to a specific line when requested by the workspace search panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { line } = (e as CustomEvent<{ line: number }>).detail;
      const editor = editorInstanceRef.current;
      if (!editor || typeof line !== "number") return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    };
    window.addEventListener("orion:navigateToLine", handler);
    return () => window.removeEventListener("orion:navigateToLine", handler);
  }, []);

  // Focus the editor when the recent-files combobox commits a selection
  useEffect(() => {
    const handler = () => {
      editorInstanceRef.current?.focus();
    };
    window.addEventListener("orion:focusEditor", handler);
    return () => window.removeEventListener("orion:focusEditor", handler);
  }, []);

  // Update theme when app theme changes
  useEffect(() => {
    if (isEditorReady && editorInstanceRef.current) {
      const currentTheme =
        resolvedTheme === "dark" ? "orion-dark" : "orion-light";
      // Access monaco through the global window object or editor instance
      if (typeof window !== "undefined" && (window as any).monaco) {
        (window as any).monaco.editor.setTheme(currentTheme);
      }
    }
  }, [resolvedTheme, isEditorReady]);

  useEffect(() => {
    if (!isEditorReady || !editorInstanceRef.current) return;

    editorInstanceRef.current.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
      minimap: { enabled: editorSettings.minimapEnabled },
      fontSize: editorSettings.fontSize,
      wordWrap: wordWrapEffective,
      scrollbar: {
        vertical: height === "auto" ? "hidden" : "auto",
        verticalScrollbarSize: height === "auto" ? 0 : 10,
        horizontal: suppressHorizontalScrollbar ? "hidden" : "auto",
        alwaysConsumeMouseWheel: false,
      },
    });
  }, [
    editorSettings,
    height,
    isEditorReady,
    suppressHorizontalScrollbar,
    wordWrapEffective,
  ]);

  /** Keeps the editor layout in sync with container width (needed for word wrap in flex layouts). */
  useEffect(() => {
    if (!isEditorReady || !editorContainerRef.current || !editorInstanceRef.current)
      return;

    const editor = editorInstanceRef.current;
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        editor.layout();
      });
    });
    ro.observe(editorContainerRef.current);
    return () => {
      ro.disconnect();
    };
  }, [isEditorReady]);

  const handleBeforeMount = (monaco: Monaco) => {
    // Define themes early in beforeMount to ensure they're available
    monaco.editor.defineTheme("orion-light", finalLightTheme);
    monaco.editor.defineTheme("orion-dark", finalDarkTheme);
    registerPythonLanguageWithMultilineFStringFix(monaco);
  };

  /**
   * Handles editor value change
   *
   * @param {string | undefined} newValue - New editor content
   */
  const handleEditorChange = (newValue: string | undefined) => {
    const updatedValue = newValue ?? "";
    setEditorValue(updatedValue);
    onChange(updatedValue);
  };

  // Determine editor theme based on the app theme
  const editorTheme = resolvedTheme === "dark" ? "orion-dark" : "orion-light";

  return (
    <div
      ref={editorContainerRef}
      onKeyDownCapture={(event) => {
        const isAttachShortcut =
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "i";
        if (!isAttachShortcut) return;
        if (!dispatchSelectedReference()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      className={cn(
        "overflow-hidden",
        !isEditorFocused && "editor-not-focused",
        className
      )}
    >
      {!isEditorReady && (
        <Skeleton
          className={cn("w-full", height === "auto" ? editorHeight : height)}
        />
      )}
      <MonacoReactEditor
        height={editorHeight}
        language={language}
        value={editorValue}
        beforeMount={handleBeforeMount}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={editorTheme}
        options={{
          renderLineHighlight: "none",
          fontSize: editorSettings.fontSize,
          lineNumbers: "on",
          roundedSelection: true,
          scrollBeyondLastLine: false,
          wordWrap: wordWrapEffective,
          minimap: { enabled: editorSettings.minimapEnabled },
          tabSize: editorSettings.tabSize,
          insertSpaces: editorSettings.insertSpaces,
          scrollbar: {
            vertical: height === "auto" ? "hidden" : "auto",
            verticalScrollbarSize: height === "auto" ? 0 : 10,
            horizontal: suppressHorizontalScrollbar ? "hidden" : "auto",
            alwaysConsumeMouseWheel: false,
          },
          padding: {
            top: 16,
            bottom: 16,
          },
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
        }}
        {...props}
      />
    </div>
  );
}
