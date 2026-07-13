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
import type {
  LLM,
  ModelSettings,
  OpenAIModelSettings,
  AnthropicModelSettings,
} from "./types";

export interface ModelSettingsPopoverProps {
  provider: ProviderId;
  model?: LLM | null;
  settings: ModelSettings;
  onSettingsChange: (settings: ModelSettings) => void;
}

type IntelligenceLevelValue =
  | "low"
  | "medium"
  | "high"
  | "extra-high"
  | "max";

interface IntelligenceLevelOption {
  value: IntelligenceLevelValue;
  label: string;
  shortLabel: string;
  settings: ModelSettings;
}

const OPENAI_INTELLIGENCE_LEVELS: IntelligenceLevelOption[] = [
  {
    value: "low",
    label: "Low",
    shortLabel: "Low",
    settings: { reasoningEffort: "low" } satisfies OpenAIModelSettings,
  },
  {
    value: "medium",
    label: "Medium",
    shortLabel: "Med",
    settings: { reasoningEffort: "medium" } satisfies OpenAIModelSettings,
  },
  {
    value: "high",
    label: "High",
    shortLabel: "High",
    settings: { reasoningEffort: "high" } satisfies OpenAIModelSettings,
  },
  {
    value: "extra-high",
    label: "Extra High",
    shortLabel: "XHigh",
    settings: { reasoningEffort: "extra-high" } satisfies OpenAIModelSettings,
  },
];

const ANTHROPIC_INTELLIGENCE_LEVELS: IntelligenceLevelOption[] = [
  {
    value: "low",
    label: "Low",
    shortLabel: "Low",
    settings: {
      extendedThinking: false,
      thinkingBudgetTokens: 1000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "medium",
    label: "Medium",
    shortLabel: "Med",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 10000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "high",
    label: "High",
    shortLabel: "High",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 25000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "extra-high",
    label: "Extra High",
    shortLabel: "XHigh",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 50000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "max",
    label: "Max",
    shortLabel: "Max",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 100000,
    } satisfies AnthropicModelSettings,
  },
];

/** Levels exposed by the selected model's provider-backed settings. */
function getIntelligenceLevels(
  provider: ProviderId,
  model: LLM | null | undefined
): IntelligenceLevelOption[] {
  if (provider === "openai") {
    const modelId = (model?.apiModelId ?? model?.value ?? "").toLowerCase();
    if (modelId.includes("nano") || modelId.includes("mini")) {
      return OPENAI_INTELLIGENCE_LEVELS.slice(0, 3);
    }
    return OPENAI_INTELLIGENCE_LEVELS;
  }

  if (provider === "anthropic") {
    return ANTHROPIC_INTELLIGENCE_LEVELS;
  }

  return [];
}

/** Reads the currently selected intelligence level from provider-specific settings. */
function getSelectedLevelValue(
  provider: ProviderId,
  settings: ModelSettings
): IntelligenceLevelValue {
  if (provider === "openai") {
    return (settings as OpenAIModelSettings).reasoningEffort ?? "medium";
  }

  if (provider === "anthropic") {
    const anthropicSettings = settings as AnthropicModelSettings;
    if (anthropicSettings.extendedThinking === false) return "low";

    const budget = anthropicSettings.thinkingBudgetTokens ?? 10000;
    if (budget >= 100000) return "max";
    if (budget >= 50000) return "extra-high";
    if (budget >= 25000) return "high";
    return "medium";
  }

  return "medium";
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

  const selectedValue = getSelectedLevelValue(provider, settings);
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
