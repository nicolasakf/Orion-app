"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import { cn } from "@/lib/utils";
import {
  getIntelligenceLevels,
  getSelectedIntelligenceLevel,
} from "./model-intelligence";
import type { LLM, ModelSettings } from "./types";

export interface ModelSettingsPopoverProps {
  provider: ProviderId;
  model?: LLM | null;
  settings: ModelSettings;
  onSettingsChange: (settings: ModelSettings) => void;
}

interface IntelligenceBarsProps {
  activeBars: number;
  totalBars: number;
  className?: string;
}

/** Compact bars that show the active intelligence level. */
function IntelligenceBars({
  activeBars,
  totalBars,
  className,
}: IntelligenceBarsProps) {
  return (
    <span
      className={cn("flex h-4 items-end gap-0.5", className)}
      aria-hidden="true"
    >
      {Array.from({ length: totalBars }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-3 w-1 rounded-sm",
            index < activeBars ? "bg-foreground" : "bg-muted-foreground/25"
          )}
        />
      ))}
    </span>
  );
}

/**
 * Popover that shows provider-specific model settings.
 * Triggered by an intelligence bar indicator next to the model selector.
 */
export function ModelSettingsPopover({
  provider,
  model,
  settings,
  onSettingsChange,
}: ModelSettingsPopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = effectiveSettings.chat.fontSize;
  const levels = getIntelligenceLevels(provider, model);

  if (levels.length === 0) return null;

  const selectedValue = getSelectedIntelligenceLevel(provider, settings);
  const selectedIndex = (() => {
    const exactIndex = levels.findIndex((level) => level.value === selectedValue);
    if (exactIndex >= 0) return exactIndex;
    return levels.length - 1;
  })();
  const selectedLevel = levels[selectedIndex] ?? levels[0];
  const activeBars = selectedIndex + 1;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-inherit text-muted-foreground hover:bg-transparent hover:text-foreground"
          style={{ fontSize: chatFontSize }}
          aria-label={`Intelligence level: ${selectedLevel.label}`}
          title={`Intelligence: ${selectedLevel.label}`}
        >
          <IntelligenceBars
            activeBars={activeBars}
            totalBars={levels.length}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-1.5 text-inherit"
        align="start"
        style={{ fontSize: chatFontSize }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="px-2 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
            Intelligence
          </span>
          {levels.map((level, index) => {
            const isSelected = level.value === selectedLevel.value;
            return (
              <button
                key={level.value}
                type="button"
                className={cn(
                  "corner-squircle flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-inherit hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isSelected && "bg-accent"
                )}
                onClick={() => {
                  onSettingsChange(level.settings);
                  setIsOpen(false);
                }}
              >
                <IntelligenceBars
                  activeBars={index + 1}
                  totalBars={levels.length}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {level.label}
                </span>
                {isSelected ? (
                  <Check className="h-3 w-3 shrink-0 text-foreground" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
