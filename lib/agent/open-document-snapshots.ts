import type { NotebookType } from "@/lib/types";

/** Origin label for content supplied by Orion's in-memory editor state. */
export type OpenDocumentSnapshotSource = "editor-buffer";

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
}

/** Browser event emitted after an agent writes a non-notebook file. */
export const ORION_AGENT_FILE_MODIFIED_EVENT = "orion:agent-file-modified";
