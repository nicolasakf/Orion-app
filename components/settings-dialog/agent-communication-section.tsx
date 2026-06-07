"use client";

import { Textarea } from "@/components/ui/textarea";
import { SettingsInfoLabel } from "@/components/settings-dialog/settings-info-label";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { cn } from "@/lib/utils";
import type { AgentCommunicationStyle } from "@/lib/settings/schema";

const COMMUNICATION_STYLE_OPTIONS: {
  value: AgentCommunicationStyle;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Default",
    description: "Use the model's default communication style.",
  },
  {
    value: "narrative",
    label: "Narrative",
    description:
      "Step-by-step narration before and after each tool call, so you can follow along with every action.",
  },
  {
    value: "friendly",
    label: "Friendly",
    description:
      "Warm, encouraging, and approachable — like a knowledgeable colleague who enjoys helping.",
  },
  {
    value: "pragmatic",
    label: "Pragmatic",
    description:
      "Direct and minimal. Only essential information — no filler, no pleasantries.",
  },
];

/** Agent communication style presets and optional custom instructions. */
export function AgentCommunicationSection() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const chat = effectiveSettings.chat;
  const communicationStyle = chat.communicationStyle;
  const customCommunicationStyle = chat.customCommunicationStyle;
  const hasCustomCommunicationStyle = customCommunicationStyle.trim().length > 0;

  return (
    <SettingsSectionLayout
      title="Communication"
      description="Choose how the agent communicates during a session. Applies to all interaction modes."
    >
      <div className="space-y-4 max-w-2xl">
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMUNICATION_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                void setUserSettings((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    communicationStyle: option.value,
                  },
                }))
              }
              className={cn(
                "corner-squircle flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                hasCustomCommunicationStyle && "opacity-60",
                !hasCustomCommunicationStyle && communicationStyle === option.value
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {option.description}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <SettingsInfoLabel
            htmlFor="agent-custom-communication-style"
            label="Custom behavior"
            description="Optional instructions for how the agent should communicate. When filled in, these replace the preset above."
          />
          <Textarea
            id="agent-custom-communication-style"
            value={customCommunicationStyle}
            placeholder="e.g. Be concise and use bullet points. Explain technical terms briefly."
            rows={4}
            onChange={(event) => {
              void setUserSettings((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  customCommunicationStyle: event.target.value,
                },
              }));
            }}
          />
        </div>
      </div>
    </SettingsSectionLayout>
  );
}
