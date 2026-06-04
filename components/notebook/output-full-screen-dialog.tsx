"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface OutputFullScreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Full-screen dialog for viewing notebook cell output content.
 */
export function OutputFullScreenDialog({
  open,
  onOpenChange,
  children,
}: OutputFullScreenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-h-[98vh] max-w-[98vw] w-fit overflow-auto border-0 p-2"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
