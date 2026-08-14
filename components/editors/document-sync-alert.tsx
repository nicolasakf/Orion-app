"use client";

import { AlertTriangle, RefreshCw, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <Alert className="mx-2 mt-2 shrink-0 border-amber-500/50 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{description}</span>
        <span className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void onSaveEditorVersion()}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save editor version
          </Button>
          {state.status !== "deleted" ? (
            <Button size="sm" variant="outline" onClick={() => void onReloadDiskVersion()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Reload disk version
            </Button>
          ) : null}
        </span>
      </AlertDescription>
    </Alert>
  );
}
