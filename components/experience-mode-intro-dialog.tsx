"use client";

import * as React from "react";
import { Briefcase, Loader2, NotebookPen } from "lucide-react";

import { useOrionSettings } from "@/hooks/use-orion-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExperienceMode } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

const EXPERIENCE_OPTIONS: Array<{
  value: ExperienceMode;
  title: string;
  description: string;
  audience: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "business",
    title: "Business",
    description:
      "A simpler data-and-chat-first workspace for reports, analysis, and everyday business questions.",
    audience:
      "Non-technical users like business owners, managers, and operators who want answers and reports about their data.",
    icon: Briefcase,
  },
  {
    value: "pro",
    title: "Pro",
    description:
      "Orion's full notebook-first workflow with cells, code, and the complete IDE experience.",
    audience:
      "Developers, data scientists, and technical users who want full control over notebooks, code, and the IDE.",
    icon: NotebookPen,
  },
];

interface ExperienceModeOptionCardProps {
  audience: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  title: string;
  onSelect: () => void;
}

/** Selectable card for one first-run experience mode option. */
function ExperienceModeOptionCard({
  audience,
  description,
  icon: Icon,
  selected,
  title,
  onSelect,
}: ExperienceModeOptionCardProps) {
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "corner-squircle flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "corner-squircle flex size-10 shrink-0 items-center justify-center rounded-md border",
            selected
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </div>
        <span className="text-base font-semibold">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="space-y-1 border-t border-border/60 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Who&apos;s it for
        </p>
        <p className="text-sm text-muted-foreground">{audience}</p>
      </div>
    </button>
  );
}

/**
 * First-run dialog that asks new users to choose Pro or Business view mode.
 * The choice is persisted in user settings so it is not shown again.
 */
export function ExperienceModeIntroDialog() {
  const {
    effectiveSettings,
    errorMessage,
    isHydrated,
    isSavingUser,
    setUserSettings,
  } = useOrionSettings();
  const [selectedMode, setSelectedMode] = React.useState<ExperienceMode>(
    effectiveSettings.appearance.experienceMode,
  );
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<string | null>(
    null,
  );

  const shouldShowIntro =
    isHydrated && !effectiveSettings.appearance.experienceModeChosen;

  React.useEffect(() => {
    if (shouldShowIntro) {
      setSelectedMode(effectiveSettings.appearance.experienceMode);
      setSaveErrorMessage(null);
    }
  }, [effectiveSettings.appearance.experienceMode, shouldShowIntro]);

  const handleContinue = React.useCallback(async () => {
    setSaveErrorMessage(null);
    try {
      await setUserSettings((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          experienceMode: selectedMode,
          experienceModeChosen: true,
        },
      }));
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your experience preference.",
      );
    }
  }, [selectedMode, setUserSettings]);

  return (
    <Dialog open={shouldShowIntro}>
      <DialogContent
        className="max-w-2xl"
        hideCloseButton
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Welcome to Orion</DialogTitle>
          <DialogDescription>
            Choose the workspace that fits how you work. You can change this
            later in Settings → Appearance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {EXPERIENCE_OPTIONS.map((option) => (
            <ExperienceModeOptionCard
              key={option.value}
              audience={option.audience}
              description={option.description}
              icon={option.icon}
              selected={selectedMode === option.value}
              title={option.title}
              onSelect={() => setSelectedMode(option.value)}
            />
          ))}
        </div>

        {(saveErrorMessage ?? errorMessage) ? (
          <p className="text-sm text-destructive">
            {saveErrorMessage ?? errorMessage}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            disabled={isSavingUser}
            onClick={() => void handleContinue()}
          >
            {isSavingUser ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
