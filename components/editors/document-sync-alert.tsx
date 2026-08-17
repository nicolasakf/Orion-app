"use client";

import { AlertTriangle, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActiveDocumentSyncState } from "@/hooks/use-active-document-sync";

interface DocumentSyncAlertProps {
  state: ActiveDocumentSyncState;
  onSaveEditorVersion: () => Promise<unknown> | void;
  onReloadDiskVersion: () => Promise<unknown> | void;
}

/** Shows a persistent, explicit resolution UI for disk/editor conflicts. */
export function DocumentSyncAlert({
  state,
  onSaveEditorVersion,
  onReloadDiskVersion,
}: DocumentSyncAlertProps) {
  if (
    state.status !== "conflicted" &&
    state.status !== "deleted" &&
    state.status !== "renamed"
  ) {
    return null;
  }

  const title =
    state.status === "conflicted"
      ? "This file changed on disk"
      : state.status === "renamed"
        ? "This file was renamed"
        : "This file was deleted on disk";
  const description =
    state.status === "conflicted"
      ? "Orion kept your unsaved editor changes. Save to keep this version, or reload to use the version on disk."
      : state.status === "renamed"
        ? `The file is now at ${state.newPath}. Your current editor content has not been discarded.`
        : "Your current editor content has not been discarded. Saving will recreate the file at this path.";

  return (
    <div className="min-w-0 shrink-0 px-2 pt-2">
      <div
        role="alert"
        className="corner-squircle flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs [&_svg]:size-3.5"
            onClick={() => void onSaveEditorVersion()}
          >
            <Save />
            Save editor version
          </Button>
          {state.status !== "deleted" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs [&_svg]:size-3.5"
              onClick={() => void onReloadDiskVersion()}
            >
              <RefreshCw />
              Reload disk version
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
