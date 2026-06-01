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
        className="max-w-[98vw] max-h-[98vh] w-full p-4 overflow-auto border-0"
      >
        <div className="w-full min-h-0 max-h-[95vh] overflow-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
