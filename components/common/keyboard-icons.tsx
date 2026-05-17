"use client";

import React from "react";
import {
  Command,
  Option,
  ArrowBigUp,
  CornerDownLeft,
  ChevronUp,
  Square,
} from "lucide-react";
import { useIsMac } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

export { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

interface KeyboardIconProps {
  className?: string;
}

export const AltOrOption = ({ className }: KeyboardIconProps) => {
  const isMac = useIsMac();
  if (isMac) {
    return <Option className={cn("h-4 w-4", className)} />;
  }
  // Callers often pass fixed icon sizing (e.g. h-3 w-3 from tooltips); labels must ignore it.
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center text-xs leading-none whitespace-nowrap",
        className,
        "!h-auto !min-h-0 !w-auto",
      )}
    >
      Alt
    </span>
  );
};

export const CmdOrCtrl = ({ className }: KeyboardIconProps) => {
  const isMac = useIsMac();
  if (isMac) {
    return <Command className={cn("h-4 w-4", className)} />;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center text-xs leading-none whitespace-nowrap",
        className,
        "!h-auto !min-h-0 !w-auto",
      )}
    >
      Ctrl
    </span>
  );
};

export const Shift = ({ className }: KeyboardIconProps) => {
  return <ArrowBigUp className={cn("h-4 w-4", className)} />;
};

export const Enter = ({ className }: KeyboardIconProps) => {
  return <CornerDownLeft className={cn("h-4 w-4", className)} />;
};

export const Control = ({ className }: KeyboardIconProps) => {
  const isMac = useIsMac();
  if (isMac) {
    return <ChevronUp className={cn("h-4 w-4", className)} />;
  }
  return null;
};

export const WindowsKey = ({ className }: KeyboardIconProps) => {
  const isMac = useIsMac();
  if (!isMac) {
    return <Square className={cn("h-4 w-4", className)} />;
  }
  return null;
};
