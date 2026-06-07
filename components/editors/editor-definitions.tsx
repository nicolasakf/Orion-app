"use client";

import dynamic from "next/dynamic";

import { MarkdownEditorToolbar } from "@/components/editors/markdown-editor-toolbar";
import { NotebookEditorToolbar } from "@/components/editors/notebook-editor-toolbar";
import type {
  EditorRuntimeProps,
  OrionEditorDefinition,
} from "@/components/editors/types";
import { useNotebookViewMode } from "@/contexts/notebook-view-mode-context";
import {
  BUILT_IN_EDITOR_DEFINITIONS,
  resolveEditorDefinition,
  type EditorFileReference,
} from "@/lib/editor/editor-registry";

const NotebookEditor = dynamic(
  () => import("@/components/notebook/notebook-editor").then((mod) => mod.NotebookEditor),
  { ssr: false }
);
const TextFileEditor = dynamic(
  () => import("@/components/editors/text-file-editor").then((mod) => mod.TextFileEditor),
  { ssr: false }
);
const MarkdownFileEditor = dynamic(
  () =>
    import("@/components/editors/markdown-file-editor").then(
      (mod) => mod.MarkdownFileEditor
    ),
  { ssr: false }
);

const baseDefinitionById = Object.fromEntries(
  BUILT_IN_EDITOR_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** Renders the notebook editor surface. */
function NotebookEditorSurface({
  filepath,
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
  onNotebookSnapshotGetterChange,
  onNotebookSaveHandlerChange,
  presentationHideAllCellInputs,
}: EditorRuntimeProps) {
  const { notebookViewMode, setNotebookViewMode } = useNotebookViewMode();

  return (
    <NotebookEditor
      filepath={filepath}
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
      onNotebookSaveHandlerChange={onNotebookSaveHandlerChange}
      presentationHideAllCellInputs={presentationHideAllCellInputs}
      activeNotebookView={notebookViewMode}
      onActiveNotebookViewChange={setNotebookViewMode}
    />
  );
}

/** Renders the generic text editor surface. */
function TextEditorSurface({ filepath, textFileModel }: EditorRuntimeProps) {
  if (!textFileModel) return null;
  return <TextFileEditor filepath={filepath} model={textFileModel} />;
}

/** Renders the Markdown editor surface. */
function MarkdownEditorSurface({ filepath, textFileModel }: EditorRuntimeProps) {
  if (!textFileModel) return null;
  return <MarkdownFileEditor filepath={filepath} model={textFileModel} />;
}

export const ORION_EDITOR_DEFINITIONS: OrionEditorDefinition[] = [
  {
    ...baseDefinitionById.notebook,
    Editor: NotebookEditorSurface,
    Toolbar: NotebookEditorToolbar,
  },
  {
    ...baseDefinitionById.markdown,
    Editor: MarkdownEditorSurface,
    Toolbar: MarkdownEditorToolbar,
  },
  {
    ...baseDefinitionById.text,
    Editor: TextEditorSurface,
  },
];

/**
 * Resolves the active UI editor definition for the selected file.
 */
export function resolveOrionEditorDefinition(
  file: EditorFileReference | null | undefined,
): OrionEditorDefinition | null {
  const baseDefinition = resolveEditorDefinition(file);
  if (!baseDefinition) return null;

  return (
    ORION_EDITOR_DEFINITIONS.find(
      (definition) => definition.id === baseDefinition.id,
    ) ?? null
  );
}
