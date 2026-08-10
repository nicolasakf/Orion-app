"use client";

import * as React from "react";
import { toast } from "sonner";

import { CloudAuthDialog } from "@/components/cloud/cloud-auth-dialog";
import { useOrionSettings } from "@/hooks/use-orion-settings";

interface SignInIntroDialogProps {
  /** Render sign-in controls inside a parent onboarding dialog. */
  embedded?: boolean;
}

/** Required first onboarding step that connects an Orion Cloud account. */
export function SignInIntroDialog({ embedded = false }: SignInIntroDialogProps) {
  const { effectiveSettings, isHydrated, setUserSettings } = useOrionSettings();
  const shouldShowIntro =
    isHydrated && !effectiveSettings.onboarding.signInStepCompleted;

  /** Records that the user completed the required account sign-in step. */
  const completeSignInStep = React.useCallback(async () => {
    try {
      await setUserSettings((current) => ({
        ...current,
        onboarding: {
          ...current.onboarding,
          signInStepCompleted: true,
        },
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your sign-in preference.",
      );
    }
  }, [setUserSettings]);

  return (
    <CloudAuthDialog
      open={embedded || shouldShowIntro}
      onOpenChange={() => undefined}
      onAuthenticated={completeSignInStep}
      title="Sign in to Orion"
      description="Sign in to continue setting up Orion and sync your Orion Cloud work."
      hideCloseButton
      preventDismiss
      embedded={embedded}
    />
  );
}
