"use client";

import * as React from "react";
import { FolderOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PublishedNotebookImportDialogProps {
  open: boolean;
  filename: string;
  onFilenameChange: (filename: string) => void;
  jupyterRootDirectory: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseLocation: () => void | Promise<void>;
}

/** Shows the local save handoff before opening the OS-native save picker. */
export function PublishedNotebookImportDialog({
  open,
  filename,
  onFilenameChange,
  jupyterRootDirectory,
  saving,
  onOpenChange,
  onChooseLocation,
}: PublishedNotebookImportDialogProps) {
  const defaultPath = jupyterRootDirectory
    ? `${jupyterRootDirectory.replace(/[/\\]+$/, "")}/${filename}`
    : filename;
  const canChooseLocation = filename.trim().length > 0 && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save published notebook</DialogTitle>
          <DialogDescription>
            Choose where to save this notebook before Orion opens it in the
            editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="published-notebook-filename">Filename</Label>
          <Input
            id="published-notebook-filename"
            value={filename}
            disabled={saving}
            onChange={(event) => onFilenameChange(event.target.value)}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Default location
          </div>
          <div className="mt-1 break-all font-mono text-sm">{defaultPath}</div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canChooseLocation}
            onClick={() => {
              void onChooseLocation();
            }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            Choose save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
