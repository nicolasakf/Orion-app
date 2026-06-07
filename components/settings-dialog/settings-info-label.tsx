"use client";

import { Info } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SettingsInfoIconProps {
  description: string;
  /** Accessible name when the icon is not paired with visible label text. */
  ariaLabel?: string;
  className?: string;
}

/** Info icon that reveals a setting description on hover. */
export function SettingsInfoIcon({
  description,
  ariaLabel = "More information",
  className,
}: SettingsInfoIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 rounded-sm text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
          aria-label={ariaLabel}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

interface SettingsInfoLabelProps {
  htmlFor?: string;
  label: string;
  description?: string;
  className?: string;
  labelClassName?: string;
}

/** Setting label with an optional info icon tooltip for the description. */
export function SettingsInfoLabel({
  htmlFor,
  label,
  description,
  className,
  labelClassName,
}: SettingsInfoLabelProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor} className={labelClassName}>
        {label}
      </Label>
      {description ? (
        <SettingsInfoIcon description={description} ariaLabel={`About ${label}`} />
      ) : null}
    </div>
  );
}

interface SettingsInfoHeadingProps {
  label: string;
  description?: string;
  className?: string;
}

/** Medium-weight setting heading with optional info icon tooltip. */
export function SettingsInfoHeading({
  label,
  description,
  className,
}: SettingsInfoHeadingProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <p className="text-sm font-medium">{label}</p>
      {description ? (
        <SettingsInfoIcon description={description} ariaLabel={`About ${label}`} />
      ) : null}
    </div>
  );
}

interface SettingsInfoSectionTitleProps {
  title: string;
  description?: string;
  className?: string;
}

/** Section title with optional info icon tooltip instead of inline helper text. */
export function SettingsInfoSectionTitle({
  title,
  description,
  className,
}: SettingsInfoSectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <h3 className="text-sm font-bold">{title}</h3>
      {description ? (
        <SettingsInfoIcon description={description} ariaLabel={`About ${title}`} />
      ) : null}
    </div>
  );
}
