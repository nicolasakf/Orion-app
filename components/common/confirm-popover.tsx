"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ConfirmPopoverProps {
  children: React.ReactElement;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  confirmVariant?: ButtonProps["variant"];
  disabled?: boolean;
  isConfirming?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: React.ComponentPropsWithoutRef<typeof PopoverContent>["align"];
  side?: React.ComponentPropsWithoutRef<typeof PopoverContent>["side"];
  className?: string;
}

/**
 * Lightweight confirmation UI that stays anchored to the action trigger.
 * Useful for local, low-friction confirmations where a full modal is too invasive.
 */
export function ConfirmPopover({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  confirmVariant = "destructive",
  disabled = false,
  isConfirming = false,
  open: controlledOpen,
  onOpenChange,
  align = "center",
  side = "bottom",
  className,
}: ConfirmPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const isBusy = isSubmitting || isConfirming;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const handleConfirm = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    if (disabled || isBusy) return;
    try {
      setIsSubmitting(true);
      await Promise.resolve(onConfirm());
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={cn("w-64 p-2.5", className)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <p className="text-xs font-semibold leading-snug">{title}</p>
          {description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
              disabled={isBusy}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleConfirm}
              disabled={disabled || isBusy}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
