"use client";

import { MonacoEditor } from "@/components/monaco-editor";
import type { TextFileModelState } from "@/components/editors/use-text-file-model";

interface TextFileEditorProps {
  filepath: string;
  model: TextFileModelState;
}

/** Renders a Monaco-backed text file editor. */
export function TextFileEditor({ filepath, model }: TextFileEditorProps) {
  return (
    <MonacoEditor
      value={model.fileContent}
      onChange={(value) => {
        model.setFileContent(value);
        model.markDirty();
      }}
      language={model.fileLanguage}
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
      onRunInTerminal={model.handleRunInTerminal}
      onMount={model.handleMonacoMount}
      referencePath={filepath}
    />
  );
}
