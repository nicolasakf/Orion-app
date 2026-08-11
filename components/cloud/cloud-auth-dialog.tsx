"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getOrionCloudConfig } from "@/lib/cloud/config";
import {
  buildCloudGoogleOAuthRedirectUrl,
  createCloudOAuthState,
  getCloudOAuthCallbackOrigin,
  isExpectedCloudGoogleOAuthCallbackMessage,
  pollCloudGoogleOAuthRelay,
  type OrionCloudGoogleOAuthCallbackMessage,
} from "@/lib/cloud/oauth";
import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";

interface CloudAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated?: () => void | Promise<void>;
  /** Optional explicit bypass for onboarding and other non-required account flows. */
  onSkip?: () => void | Promise<void>;
  /** Overrides the default cloud-specific heading. */
  title?: string;
  /** Overrides the default cloud-specific description. */
  description?: string;
  /** Hides the close button when a flow must be completed or skipped explicitly. */
  hideCloseButton?: boolean;
  /** Ignores dismissal attempts other than the supplied actions. */
  preventDismiss?: boolean;
  /** Renders only the dialog body for use inside a parent modal. */
  embedded?: boolean;
}

type CloudAuthPhase = "idle" | "starting" | "awaiting" | "blocked" | "exchanging" | "failed";

/** Returns a readable message for Supabase auth failures. */
function getAuthErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cloud sign-in failed.";
}

/** Opens an OAuth URL in a popup while preserving the opener for callback relay. */
function openOAuthPopup(url: string): Window | null {
  return window.open(
    url,
    "orion-cloud-google-oauth",
    "popup=yes,width=520,height=720",
  );
}

/** Google-only Orion Cloud auth dialog for local Orion app sessions. */
export function CloudAuthDialog({
  open,
  onOpenChange,
  onAuthenticated,
  onSkip,
  title = "Sign in to Orion Cloud",
  description = "Continue with Google to publish and manage Orion Cloud notebooks from this local app.",
  hideCloseButton = false,
  preventDismiss = false,
  embedded = false,
}: CloudAuthDialogProps) {
  const cloudConfig = React.useMemo(() => getOrionCloudConfig(), []);
  const supabase = React.useMemo(() => createOrionCloudSupabaseClient(), []);
  const popupRef = React.useRef<Window | null>(null);
  const pollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = React.useState<CloudAuthPhase>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);
  const [oauthState, setOauthState] = React.useState<string | null>(null);

  const resetFlow = React.useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    popupRef.current = null;
    setPhase("idle");
    setErrorMessage(null);
    setFallbackUrl(null);
    setOauthState(null);
  }, []);

  React.useEffect(() => {
    if (open) resetFlow();
  }, [open, resetFlow]);

  const completeRelayMessage = React.useCallback(
    (message: OrionCloudGoogleOAuthCallbackMessage) => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }

      setPhase("exchanging");
      if (message.error) {
        const description = message.errorDescription
          ? ` ${message.errorDescription}`
          : "";
        setErrorMessage(`${message.error}.${description}`);
        setPhase("failed");
        return;
      }
      if (!message.code) {
        setErrorMessage("Google did not return an authorization code.");
        setPhase("failed");
        return;
      }

      void (async () => {
        try {
          if (!supabase) throw new Error("Orion Cloud is not configured for this local app.");
          const result = await supabase.auth.exchangeCodeForSession(message.code);
          if (result.error) throw result.error;
          popupRef.current?.close();
          popupRef.current = null;
          toast.success("Signed in with Google.");
          onOpenChange(false);
          await onAuthenticated?.();
        } catch (error: unknown) {
          const nextMessage = getAuthErrorMessage(error);
          setErrorMessage(nextMessage);
          setPhase("failed");
          toast.error(nextMessage);
        }
      })();
    },
    [onAuthenticated, onOpenChange, supabase],
  );

  React.useEffect(() => {
    if (!open || !cloudConfig || !oauthState || !supabase) return;

    const hostedOrigin = getCloudOAuthCallbackOrigin(cloudConfig.apiBaseUrl);
    const expectedOrigins = new Set([window.location.origin, hostedOrigin]);

    /** Completes the local Supabase session after the hosted relay returns a code. */
    const handleMessage = (event: MessageEvent) => {
      if (!expectedOrigins.has(event.origin)) return;
      if (
        event.origin !== hostedOrigin &&
        popupRef.current &&
        event.source &&
        event.source !== popupRef.current
      ) {
        return;
      }
      if (!isExpectedCloudGoogleOAuthCallbackMessage(event.data, oauthState)) {
        return;
      }

      completeRelayMessage(event.data);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [cloudConfig, completeRelayMessage, oauthState, open, supabase]);

  React.useEffect(() => {
    if (!open || phase !== "awaiting" || !cloudConfig || !oauthState) return;

    let cancelled = false;

    /** Polls hosted Orion when postMessage cannot complete the OAuth handoff. */
    const poll = async () => {
      try {
        const result = await pollCloudGoogleOAuthRelay(
          cloudConfig.apiBaseUrl,
          oauthState,
        );
        if (cancelled) return;
        if (result.status === "success") {
          completeRelayMessage(result);
          return;
        }
      } catch {
        // Transient network/server errors should not fail the user while they are still signing in.
      }

      if (!cancelled) {
        pollTimeoutRef.current = setTimeout(() => void poll(), 2000);
      }
    };

    pollTimeoutRef.current = setTimeout(() => void poll(), 1500);
    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [cloudConfig, completeRelayMessage, oauthState, open, phase]);

  const startGoogleOAuth = React.useCallback(async () => {
    if (!cloudConfig || !supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }

    const nextState = createCloudOAuthState();
    setPhase("starting");
    setErrorMessage(null);
    setFallbackUrl(null);
    setOauthState(nextState);
    const popup = openOAuthPopup("about:blank");
    popupRef.current = popup;

    try {
      const redirectTo = buildCloudGoogleOAuthRedirectUrl(
        cloudConfig.apiBaseUrl,
        window.location.origin,
        nextState,
      );
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          // Keep the existing Google browser session, but let the user choose
          // which signed-in Google account to use for this Orion Cloud session.
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
      if (!data.url) {
        throw new Error("Google sign-in did not return an authorization URL.");
      }

      setFallbackUrl(data.url);
      if (popup) {
        popup.location.href = data.url;
      }
      setPhase(popup ? "awaiting" : "blocked");
    } catch (error) {
      popup?.close();
      popupRef.current = null;
      const nextMessage = getAuthErrorMessage(error);
      setErrorMessage(nextMessage);
      setPhase("failed");
      toast.error(nextMessage);
    }
  }, [cloudConfig, supabase]);

  const isBusy = phase === "starting" || phase === "exchanging";
  const isConfigured = Boolean(cloudConfig && supabase);

  /** Lets onboarding opt out without treating the dialog's close affordance as a skip. */
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen && preventDismiss) return;
    onOpenChange(nextOpen);
  }, [onOpenChange, preventDismiss]);

  const content = (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
          {!isConfigured ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Orion Cloud is not configured for this local app.
            </div>
          ) : null}

          {phase === "awaiting" ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for Google sign-in to finish…
            </div>
          ) : null}

          {phase === "blocked" && fallbackUrl ? (
            <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>Your browser blocked the Google sign-in window.</p>
              <Button asChild variant="outline" className="w-full">
                <a href={fallbackUrl} target="orion-cloud-google-oauth" rel="opener">
                  <ExternalLink className="h-4 w-4" />
                  Open Google sign-in
                </a>
              </Button>
            </div>
          ) : null}

          {phase === "failed" && errorMessage ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full"
            disabled={!isConfigured || isBusy}
            onClick={() => void startGoogleOAuth()}
          >
            {isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg
                className="mr-2 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                />
              </svg>
            )}
            {phase === "failed" ? "Try Google again" : "Continue with Google"}
          </Button>

          {onSkip ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={isBusy}
              onClick={() => void onSkip()}
            >
              Skip for now
            </Button>
          ) : null}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" hideCloseButton={hideCloseButton}>
        {content}
      </DialogContent>
    </Dialog>
  );
}
