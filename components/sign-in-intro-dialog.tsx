"use client";

import * as React from "react";
import { toast } from "sonner";

import { CloudAuthDialog } from "@/components/cloud/cloud-auth-dialog";
import { useOrionSettings } from "@/hooks/use-orion-settings";

interface SignInIntroDialogProps {
  /** Render sign-in controls inside a parent onboarding dialog. */
  embedded?: boolean;
}

/** Optional first onboarding step for an Orion Cloud account. */
export function SignInIntroDialog({ embedded = false }: SignInIntroDialogProps) {
  const { effectiveSettings, isHydrated, setUserSettings } = useOrionSettings();
  const shouldShowIntro =
    isHydrated && !effectiveSettings.onboarding.signInStepCompleted;

  /** Records that the user finished or bypassed the account sign-in step. */
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
      onSkip={completeSignInStep}
      title="Sign in to Orion"
      description="Sign in to sync your Orion Cloud work. You can skip this for now."
      hideCloseButton
      preventDismiss
      embedded={embedded}
    />
  );
}
