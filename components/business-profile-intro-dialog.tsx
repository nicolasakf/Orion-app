"use client";

import { PersonalContextInterview } from "@/components/personal-context-interview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrionSettings } from "@/hooks/use-orion-settings";

interface BusinessProfileIntroDialogProps {
  /** Renders the interview inside the shared onboarding modal. */
  embedded?: boolean;
}

/** Optional Business onboarding interview that creates the user's `ORION.md`. */
export function BusinessProfileIntroDialog({
  embedded = false,
}: BusinessProfileIntroDialogProps) {
  const { effectiveSettings, isHydrated } = useOrionSettings();
  const shouldShow =
    isHydrated &&
    effectiveSettings.appearance.experienceMode === "business" &&
    effectiveSettings.appearance.experienceModeChosen &&
    effectiveSettings.providers.inferenceProviderChosen &&
    !effectiveSettings.onboarding.businessProfileStepCompleted;

  const content = (
    <>
      <DialogHeader>
        <DialogTitle>Help Orion understand your work</DialogTitle>
        <DialogDescription>
          A short conversation will create local personal context you can review,
          edit, or finish later in Settings.
        </DialogDescription>
      </DialogHeader>
      <PersonalContextInterview allowSkip className="min-h-0 flex-1" />
    </>
  );

  if (embedded) return content;

  return (
    <Dialog open={shouldShow}>
      <DialogContent
        className="flex h-[min(48rem,calc(100vh-2rem))] max-w-2xl flex-col"
        hideCloseButton
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
