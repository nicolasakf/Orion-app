"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FileNotFoundDialogProps {
  open: boolean;
  /** Jupyter-relative path that could not be loaded. */
  filepath: string;
  onOpenChange: (open: boolean) => void;
}

/** Derives a display name from a Jupyter-relative path. */
function deriveFileNameFromPath(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/**
 * Shown when the editor cannot load a file because it no longer exists.
 */
export function FileNotFoundDialog({
  open,
  filepath,
  onOpenChange,
}: FileNotFoundDialogProps) {
  const filename = deriveFileNameFromPath(filepath);
  const description =
    filename !== filepath
      ? `"${filename}" (${filepath}) could not be found. It may have been moved or deleted.`
      : `"${filepath}" could not be found. It may have been moved or deleted.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>File not found</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => onOpenChange(false)}
            shortcut="Enter"
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
