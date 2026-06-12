"use client";

import { Loader2 } from "lucide-react";

interface PublishedNotebookDownloadOverlayProps {
  open: boolean;
}

/** Blocking overlay shown while Orion downloads a published notebook source. */
export function PublishedNotebookDownloadOverlay({
  open,
}: PublishedNotebookDownloadOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/65 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Downloading published notebook"
    >
      <section className="flex w-[min(92vw,360px)] items-center gap-3 rounded-lg border bg-background p-5 shadow-lg">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        <div>
          <h2 className="font-medium">Downloading notebook</h2>
          <p className="text-sm text-muted-foreground">
            Preparing the source notebook for local import...
          </p>
        </div>
      </section>
    </div>
  );
}
