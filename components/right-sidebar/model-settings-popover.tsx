"use client";

import * as React from "react";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type {
  ModelSettings,
  OpenAIModelSettings,
  AnthropicModelSettings,
} from "./types";

export interface ModelSettingsPopoverProps {
  provider: ProviderId;
  settings: ModelSettings;
  onSettingsChange: (settings: ModelSettings) => void;
}

/** Renders OpenAI-specific settings: reasoning effort */
function OpenAISettings({
  settings,
  onChange,
  chatFontSize,
}: {
  settings: OpenAIModelSettings;
  onChange: (s: OpenAIModelSettings) => void;
  chatFontSize: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-center gap-2">
        <Label className="text-inherit whitespace-nowrap mr-2">Reasoning Effort</Label>
        <Select
          value={settings.reasoningEffort ?? "medium"}
          onValueChange={(v) =>
            onChange({
              ...settings,
              reasoningEffort: v as OpenAIModelSettings["reasoningEffort"],
            })
          }
        >
          <SelectTrigger className="h-7 text-inherit min-w-[110px] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [&_svg]:h-3 [&_svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="text-inherit outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ fontSize: chatFontSize }}
          >
            <SelectItem value="low" className="text-inherit">
              Low
            </SelectItem>
            <SelectItem value="medium" className="text-inherit">
              Medium
            </SelectItem>
            <SelectItem value="high" className="text-inherit">
              High
            </SelectItem>
            <SelectItem value="extra-high" className="text-inherit">
              Extra High
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Renders Anthropic-specific settings: extended thinking toggle and budget */
function AnthropicSettings({
  settings,
  onChange,
}: {
  settings: AnthropicModelSettings;
  onChange: (s: AnthropicModelSettings) => void;
}) {
  const isThinking = settings.extendedThinking ?? true;
  const budget = settings.thinkingBudgetTokens ?? 10000;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-inherit">Extended Thinking</Label>
        <Switch
          checked={isThinking}
          onCheckedChange={(checked) =>
            onChange({ ...settings, extendedThinking: checked })
          }
        />
      </div>

      {isThinking && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-inherit">Thinking Budget</Label>
            <span className="text-inherit text-muted-foreground tabular-nums">
              {budget.toLocaleString()} tokens
            </span>
          </div>
          <Slider
            min={1000}
            max={100000}
            step={1000}
            value={[budget]}
            onValueChange={([v]) =>
              onChange({ ...settings, thinkingBudgetTokens: v })
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Popover that shows provider-specific model settings.
 * Triggered by a cog icon next to the model selector.
 */
export function ModelSettingsPopover({
  provider,
  settings,
  onSettingsChange,
}: ModelSettingsPopoverProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = effectiveSettings.chat.fontSize;

  const renderContent = () => {
    switch (provider) {
      case "openai":
        return (
          <OpenAISettings
            settings={settings as OpenAIModelSettings}
            onChange={onSettingsChange}
            chatFontSize={chatFontSize}
          />
        );
      case "anthropic":
        return (
          <AnthropicSettings
            settings={settings as AnthropicModelSettings}
            onChange={onSettingsChange}
          />
        );
      default:
        return (
          <p className="text-inherit text-muted-foreground">
            No configurable settings for this provider.
          </p>
        );
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-inherit text-muted-foreground hover:text-foreground hover:bg-transparent [&_svg]:!size-3"
          style={{ fontSize: chatFontSize }}
          aria-label="Model settings"
        >
          <Settings className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-inherit"
        align="start"
        style={{ fontSize: chatFontSize }}
      >
        <div className="flex flex-col gap-2">
          {renderContent()}
        </div>
      </PopoverContent>
    </Popover>
  );
}
