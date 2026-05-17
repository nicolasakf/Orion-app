"use client";

import type { JSX } from "react";
import { useMemo } from "react";
import { MonacoEditor } from "@/components/monaco-editor";
import type { NotebookMimeRendererProps } from "./types";

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Render JSON outputs in a read-only Monaco editor with folding and search.
 */
export function JsonOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const json = useMemo(() => formatJson(value), [value]);

  return (
    <div className="orion-json-monaco rounded-md border bg-white dark:bg-black">
      <MonacoEditor
        value={json}
        onChange={() => {}}
        language="json"
        height="auto"
        minHeight={96}
        maxHeight={480}
        isNotebook
        options={{
          readOnly: true,
          domReadOnly: true,
          folding: true,
          lineNumbers: "off",
          minimap: { enabled: false },
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          renderLineHighlight: "none",
          scrollBeyondLastLine: false,
          wordWrap: "off",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          padding: {
            top: 10,
            bottom: 10,
          },
        }}
      />
    </div>
  );
}
