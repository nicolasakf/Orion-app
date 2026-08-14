import type { NotebookType } from "@/lib/types";

/** Origin label for content supplied by Orion's in-memory editor state. */
export type OpenDocumentSnapshotSource = "editor-buffer";

/** Active editor document family used when saving dirty buffers before tool writes. */
export type OpenDocumentKind = "text" | "notebook";

/** Outcome of asking an open editor document to persist its dirty buffer. */
export type OpenDocumentSaveStatus = "saved" | "clean" | "not-open" | "error";

/** Result returned after attempting to save an open editor document. */
export interface OpenDocumentSaveResult {
  status: OpenDocumentSaveStatus;
  message?: string;
}

/** Current contents of a Monaco-backed text document open in Orion. */
export interface TextDocumentSnapshot {
  content: string;
  dirty: boolean;
  source: OpenDocumentSnapshotSource;
}

/** Current contents of a notebook document open in Orion. */
export interface NotebookDocumentSnapshot {
  notebook: NotebookType;
  dirty: boolean;
  source: OpenDocumentSnapshotSource;
}

/** Supplies live editor snapshots to agent tools before they fall back to disk. */
export interface OpenDocumentSnapshotProvider {
  getTextSnapshot: (path: string) => TextDocumentSnapshot | null;
  getNotebookSnapshot: (path: string) => NotebookDocumentSnapshot | null;
  saveOpenDocumentIfDirty: (
    path: string,
    kind: OpenDocumentKind,
  ) => Promise<OpenDocumentSaveResult>;
}
