"use client";

export const WORKSPACE_FILES_CHANGED_EVENT = "workspaceFilesChanged";

export interface WorkspaceFilesChangedDetail {
  folderPath: string;
}

/**
 * Notifies UI surfaces that a workspace folder listing should be refreshed.
 */
export function dispatchWorkspaceFilesChanged(folderPath: string): void {
  window.dispatchEvent(
    new CustomEvent<WorkspaceFilesChangedDetail>(WORKSPACE_FILES_CHANGED_EVENT, {
      detail: { folderPath },
    })
  );
}

/**
 * Extracts a typed workspace-files-changed payload from a DOM event.
 */
export function getWorkspaceFilesChangedDetail(
  event: Event
): WorkspaceFilesChangedDetail | null {
  const detail = (event as CustomEvent<Partial<WorkspaceFilesChangedDetail>>)
    .detail;

  if (!detail || typeof detail.folderPath !== "string") {
    return null;
  }

  return { folderPath: detail.folderPath };
}
