"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FullscreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fontSize: number;
  children: React.ReactNode;
}

/** Fullscreen dialog wrapper for the table */
export function FullscreenDialog({
  open,
  onOpenChange,
  fontSize,
  children,
}: FullscreenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between"></DialogTitle>
        </DialogHeader>
        <div
          className="overflow-auto h-full"
          style={{ fontSize: `${fontSize}px` }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
