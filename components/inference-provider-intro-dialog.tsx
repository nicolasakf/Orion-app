"use client";

import * as React from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { useOrionSettings } from "@/hooks/use-orion-settings";

interface BrowserFlowState {
  phase: "idle" | "starting" | "awaiting" | "ready" | "failed";
  flowId?: string;
  authorizationUrl?: string;
  error?: string;
}

const CHATGPT_DEFAULT_PINNED_MODEL_IDS = [
  "openai/gpt-5.5",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
];

/**
 * Second first-run step that connects an inference provider after the user has
 * chosen their preferred Orion workspace.
 */
interface InferenceProviderIntroDialogProps {
  /** Render provider setup inside the shared onboarding dialog. */
  embedded?: boolean;
}

export function InferenceProviderIntroDialog({
  embedded = false,
}: InferenceProviderIntroDialogProps) {
  const {
    effectiveSettings,
    errorMessage,
    isHydrated,
    isSavingUser,
    reloadUserSettings,
    setUserSettings,
  } = useOrionSettings();
  const { openWithTab } = useOpenSettings();
  const [browserFlow, setBrowserFlow] = React.useState<BrowserFlowState>({
    phase: "idle",
  });
  const browserOAuthWindowRef = React.useRef<Window | null>(null);
  const browserOAuthStartCancelledRef = React.useRef(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<string | null>(
    null,
  );

  const shouldShowIntro =
    isHydrated &&
    effectiveSettings.onboarding.signInStepCompleted &&
    effectiveSettings.appearance.experienceModeChosen &&
    !effectiveSettings.providers.inferenceProviderChosen;

  /** Records that the user selected an inference-provider setup path. */
  const completeOnboarding = React.useCallback(async (options?: {
    pinnedModelIds?: string[];
    continueToBusinessInterview?: boolean;
  }) => {
    await setUserSettings((current) => ({
      ...current,
      chat:
        options?.pinnedModelIds && current.chat.pinnedModelIds.length === 0
          ? {
              ...current.chat,
              pinnedModelIds: options.pinnedModelIds,
            }
          : current.chat,
      onboarding: {
        ...current.onboarding,
        businessProfileStepCompleted:
          options?.continueToBusinessInterview === true
            ? false
            : true,
      },
      providers: {
        ...current.providers,
        inferenceProviderChosen: true,
      },
    }));
  }, [setUserSettings]);

  const handleManualSetup = React.useCallback(async () => {
    setSaveErrorMessage(null);
    setIsCompleting(true);
    try {
      await completeOnboarding();
      openWithTab("providers");
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your provider setup preference.",
      );
    } finally {
      setIsCompleting(false);
    }
  }, [completeOnboarding, openWithTab]);

  /** Returns to the workspace-experience selection step. */
  const handleBack = React.useCallback(async () => {
    setSaveErrorMessage(null);
    setIsCompleting(true);
    try {
      await setUserSettings((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          experienceModeChosen: false,
        },
      }));
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error ? error.message : "Could not return to workspace selection.",
      );
    } finally {
      setIsCompleting(false);
    }
  }, [setUserSettings]);

  /** Finishes onboarding once the browser OAuth callback stored the credential. */
  const handleChatGPTConnected = React.useCallback(async () => {
    setSaveErrorMessage(null);
    setIsCompleting(true);
    try {
      await reloadUserSettings();
      await completeOnboarding({
        pinnedModelIds: CHATGPT_DEFAULT_PINNED_MODEL_IDS,
        continueToBusinessInterview: true,
      });
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error
          ? error.message
          : "ChatGPT connected, but Orion could not finish setup.",
      );
    } finally {
      setIsCompleting(false);
    }
  }, [completeOnboarding, reloadUserSettings]);

  React.useEffect(() => {
    if (browserFlow.phase !== "awaiting" || !browserFlow.flowId) return;

    let cancelled = false;
    const { flowId } = browserFlow;

    async function poll() {
      try {
        const response = await fetch("/api/credentials/oauth/browser/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId }),
        });
        const data = (await response.json()) as {
          status: "pending" | "success" | "failed";
          message?: string;
        };
        if (cancelled) return;

        if (data.status === "success") {
          setBrowserFlow((current) => ({ ...current, phase: "idle" }));
          await handleChatGPTConnected();
          return;
        }
        if (data.status === "failed") {
          setBrowserFlow((current) => ({
            ...current,
            phase: "failed",
            error: data.message ?? "ChatGPT sign-in failed.",
          }));
          return;
        }
      } catch {
        // A transient local-server failure should not interrupt the sign-in flow.
      }

      if (!cancelled) window.setTimeout(() => void poll(), 1500);
    }

    const timer = window.setTimeout(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [browserFlow.flowId, browserFlow.phase, handleChatGPTConnected]);

  /** Cancels the active browser sign-in flow and closes its temporary popup. */
  const stopBrowserOAuth = React.useCallback(() => {
    browserOAuthStartCancelledRef.current = true;
    const popup = browserOAuthWindowRef.current;
    if (popup && !popup.closed) popup.close();
    browserOAuthWindowRef.current = null;

    if (browserFlow.flowId) {
      void fetch("/api/credentials/oauth/browser/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: browserFlow.flowId }),
      }).catch(() => undefined);
    }

    setBrowserFlow({ phase: "idle" });
  }, [browserFlow.flowId]);

  /** Starts ChatGPT browser OAuth while the button click still permits a popup. */
  const handleChatGPTLogin = React.useCallback(() => {
    const popup = window.open(
      "about:blank",
      "orion-chatgpt-oauth",
      "popup=yes,width=520,height=720",
    );
    browserOAuthWindowRef.current = popup;
    browserOAuthStartCancelledRef.current = false;
    setSaveErrorMessage(null);
    setBrowserFlow({ phase: "starting" });

    void (async () => {
      try {
        const response = await fetch("/api/credentials/oauth/browser/start", {
          method: "POST",
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(data.message ?? "Failed to start ChatGPT sign-in.");
        }
        const data = (await response.json()) as {
          flowId: string;
          authorizationUrl: string;
        };

        if (browserOAuthStartCancelledRef.current) {
          void fetch("/api/credentials/oauth/browser/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flowId: data.flowId }),
          }).catch(() => undefined);
          return;
        }

        if (popup && !popup.closed) {
          popup.location.assign(data.authorizationUrl);
          popup.focus();
          setBrowserFlow({
            phase: "awaiting",
            flowId: data.flowId,
            authorizationUrl: data.authorizationUrl,
          });
          return;
        }

        setBrowserFlow({
          phase: "ready",
          flowId: data.flowId,
          authorizationUrl: data.authorizationUrl,
        });
      } catch (error) {
        if (popup && !popup.closed) popup.close();
        if (browserOAuthWindowRef.current === popup) {
          browserOAuthWindowRef.current = null;
        }
        if (browserOAuthStartCancelledRef.current) return;
        setBrowserFlow({
          phase: "failed",
          error:
            error instanceof Error ? error.message : "Failed to start ChatGPT sign-in.",
        });
      }
    })();
  }, []);

  const handleOpenChatGPTLogin = React.useCallback(() => {
    if (!browserFlow.authorizationUrl) return;
    browserOAuthWindowRef.current = window.open(
      browserFlow.authorizationUrl,
      "_blank",
      "noopener,noreferrer",
    );
    browserOAuthStartCancelledRef.current = false;
    setBrowserFlow((current) => ({ ...current, phase: "awaiting" }));
  }, [browserFlow.authorizationUrl]);

  const isSigningIn =
    browserFlow.phase === "starting" || browserFlow.phase === "awaiting";
  const displayError = saveErrorMessage ?? errorMessage ?? browserFlow.error;

  const content = (
    <>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back to workspace selection"
          disabled={isSigningIn || isCompleting || isSavingUser}
          onClick={() => void handleBack()}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <DialogHeader className="min-w-0 text-center">
          <DialogTitle>Connect an AI provider</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in with ChatGPT or configure another inference provider.
          </DialogDescription>
        </DialogHeader>
        <span aria-hidden="true" />
      </div>

        <div className="flex flex-col items-center gap-5 py-2">
          <ProviderLogo
            providerId="openai"
            alt="OpenAI"
            className="size-20"
          />
          {browserFlow.phase === "ready" ? (
            <Button type="button" className="w-full" onClick={handleOpenChatGPTLogin}>
              <ExternalLink className="mr-2 size-4" />
              Open ChatGPT sign-in
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={isSigningIn || isCompleting}
              onClick={handleChatGPTLogin}
            >
              {isSigningIn || isCompleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {isCompleting ? "Finishing setup…" : "Waiting for sign-in…"}
                </>
              ) : (
                "Log in with your ChatGPT account"
              )}
            </Button>
          )}
          {browserFlow.phase === "awaiting" ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={stopBrowserOAuth}
            >
              Cancel sign-in
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isSigningIn || isCompleting || isSavingUser}
          onClick={() => void handleManualSetup()}
        >
          Set up manually in Settings
        </Button>

        {displayError ? (
          <p className="text-sm text-destructive">{displayError}</p>
        ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <Dialog open={shouldShowIntro}>
      <DialogContent
        className="max-w-sm"
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
