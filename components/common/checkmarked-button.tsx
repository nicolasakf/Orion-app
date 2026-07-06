"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CHECKMARKED_BUTTON_SUCCESS_MS = 700;
const CHECKMARKED_ICON_ANIMATION_CLASS = "animate-in zoom-in-50 duration-100";

interface CheckmarkedIconProps {
  checked: boolean;
  icon: React.ReactNode;
  className?: string;
  iconClassName?: string;
  checkClassName?: string;
}

interface CheckmarkedButtonProps extends Omit<ButtonProps, "children"> {
  checked: boolean;
  icon: React.ReactNode;
  iconClassName?: string;
  checkClassName?: string;
  children?: React.ReactNode;
}

/**
 * Adds the shared checkmark feedback animation to an icon without changing the surrounding button.
 */
export function CheckmarkedIcon({
  checked,
  icon,
  className,
  iconClassName,
  checkClassName,
}: CheckmarkedIconProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)} aria-hidden>
      {checked ? (
        <Check
          className={cn(
            CHECKMARKED_ICON_ANIMATION_CLASS,
            "text-green-500",
            iconClassName,
            checkClassName,
          )}
        />
      ) : (
        renderAnimatedIcon(icon, iconClassName)
      )}
    </span>
  );
}

/**
 * Standard icon button that briefly flips to the shared green checkmark feedback state.
 */
export const CheckmarkedButton = React.forwardRef<HTMLButtonElement, CheckmarkedButtonProps>(
  (
    {
      checked,
      icon,
      iconClassName,
      checkClassName,
      children,
      ...buttonProps
    },
    ref,
  ) => (
    <Button ref={ref} {...buttonProps}>
      <CheckmarkedIcon
        checked={checked}
        icon={icon}
        iconClassName={iconClassName}
        checkClassName={checkClassName}
      />
      {children}
    </Button>
  ),
);

CheckmarkedButton.displayName = "CheckmarkedButton";

/**
 * Tracks the transient success state and clears its timer when the owner unmounts.
 */
export function useCheckmarkedFeedback(durationMs = CHECKMARKED_BUTTON_SUCCESS_MS) {
  const [checked, setChecked] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetCheckmark = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setChecked(false);
  }, []);

  const showCheckmark = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setChecked(true);
    timeoutRef.current = setTimeout(() => {
      setChecked(false);
      timeoutRef.current = null;
    }, durationMs);
  }, [durationMs]);

  React.useEffect(() => resetCheckmark, [resetCheckmark]);

  return { checked, resetCheckmark, showCheckmark };
}

/**
 * Applies the canonical checkmark-button entrance animation to the caller's icon.
 */
function renderAnimatedIcon(icon: React.ReactNode, iconClassName?: string) {
  if (!React.isValidElement<{ className?: string }>(icon)) {
    return icon;
  }

  return React.cloneElement(icon, {
    className: cn(CHECKMARKED_ICON_ANIMATION_CLASS, icon.props.className, iconClassName),
  });
}
