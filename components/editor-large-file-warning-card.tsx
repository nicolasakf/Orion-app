"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatFileSize } from "@/lib/editor/large-file-warning";

interface EditorLargeFileWarningCardProps {
  filepath: string;
  sizeBytes: number;
  onOpenAnyway: () => void;
  onCancel: () => void;
}

/**
 * Warns before mounting an editor for a file large enough to slow the IDE.
 */
export function EditorLargeFileWarningCard({
  filepath,
  sizeBytes,
  onOpenAnyway,
  onCancel,
}: EditorLargeFileWarningCardProps) {
  const formattedSize = formatFileSize(sizeBytes);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-lg border-amber-500/40 bg-background shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-lg leading-6">
                This file is very large
              </CardTitle>
              <p className="break-words text-sm leading-6 text-muted-foreground">
                {filepath} is {formattedSize}. Opening it in the editor may make
                Orion slow or unresponsive.
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Are you sure you want to open this file?
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Size: {formattedSize}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onOpenAnyway}>Open anyway</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
