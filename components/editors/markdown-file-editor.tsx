"use client";

import { useEffect } from "react";

import { TextFileEditor } from "@/components/editors/text-file-editor";
import type { TextFileModelState } from "@/components/editors/use-text-file-model";
import { MarkdownRenderer } from "@/components/notebook/markdown-renderer";
import { useMarkdownEditorViewMode } from "@/contexts/markdown-editor-view-mode-context";

interface MarkdownFileEditorProps {
  filepath: string;
  model: TextFileModelState;
}

/** Renders Markdown source in Monaco or a live preview of the unsaved buffer. */
export function MarkdownFileEditor({ filepath, model }: MarkdownFileEditorProps) {
  const { markdownEditorViewMode, setMarkdownEditorViewMode } =
    useMarkdownEditorViewMode();

  useEffect(() => {
    setMarkdownEditorViewMode("edit");
  }, [filepath, setMarkdownEditorViewMode]);

  if (markdownEditorViewMode === "preview") {
    return (
      <div className="h-full overflow-auto bg-sidebar px-6 py-5">
        <MarkdownRenderer source={model.fileContent} />
      </div>
    );
  }

  return <TextFileEditor filepath={filepath} model={model} />;
}
