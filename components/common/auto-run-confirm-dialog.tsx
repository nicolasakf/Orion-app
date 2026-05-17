"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AutoRunConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown when switching tool approval mode to "auto_run".
 * Explains the dangers and requires explicit user confirmation.
 */
export function AutoRunConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: AutoRunConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enable auto-run for tools?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to allow the agent to run code, execute cells, and send
            terminal commands without asking for confirmation each time.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert
          className={cn(
            "border-amber-500/50 bg-amber-500/5 text-amber-800 dark:text-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 [&>svg]:!text-amber-800 dark:[&>svg]:!text-amber-200"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Use with caution</AlertTitle>
          <AlertDescription>
            These tools can modify files, run arbitrary code, and affect your
            system. Only enable auto-run if you fully trust the agent&apos;s
            actions. You can switch back to &quot;Always ask&quot; at any time.
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Enable auto-run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
