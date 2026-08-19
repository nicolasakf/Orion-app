"use client";

import { ExperienceModeIntroDialog } from "@/components/experience-mode-intro-dialog";
import { BusinessProfileIntroDialog } from "@/components/business-profile-intro-dialog";
import { InferenceProviderIntroDialog } from "@/components/inference-provider-intro-dialog";
import { SignInIntroDialog } from "@/components/sign-in-intro-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useOrionSettings } from "@/hooks/use-orion-settings";

/** Renders every onboarding step inside one persistent modal and focus trap. */
export function OnboardingFlow() {
  const { effectiveSettings, isHydrated } = useOrionSettings();

  if (!isHydrated) return null;

  const step = !effectiveSettings.onboarding.signInStepCompleted
    ? "sign-in"
    : !effectiveSettings.appearance.experienceModeChosen
      ? "experience"
      : !effectiveSettings.providers.inferenceProviderChosen
        ? "provider"
        : !effectiveSettings.onboarding.businessProfileStepCompleted
          ? "interview"
          : null;
  if (step === null) return null;

  return (
    <Dialog open>
      <DialogContent
        className={
          step === "interview"
            ? "flex h-[min(48rem,calc(100vh-2rem))] w-[calc(100%-2rem)] max-w-3xl flex-col"
            : step === "experience"
              ? "w-[calc(100%-2rem)] max-w-2xl"
            : "w-[calc(100%-2rem)] max-w-sm"
        }
        hideCloseButton
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {step === "sign-in" ? <SignInIntroDialog embedded /> : null}
        {step === "experience" ? <ExperienceModeIntroDialog embedded /> : null}
        {step === "provider" ? <InferenceProviderIntroDialog embedded /> : null}
        {step === "interview" ? <BusinessProfileIntroDialog embedded /> : null}
      </DialogContent>
    </Dialog>
  );
}
