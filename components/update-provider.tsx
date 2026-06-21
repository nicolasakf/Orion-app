"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  OrionUpdateStateSchema,
  type OrionUpdateState,
} from "@/lib/update/types";

const UPDATE_TOAST_ID = "orion-update-available";
const READY_TOAST_ID = "orion-update-ready";
const DISMISSED_VERSION_KEY = "orion.dismissedUpdateVersion";
const INITIAL_CHECK_DELAY_MS = 4_000;
const DAILY_CHECK_INTERVAL_MS = 86_400_000;

interface UpdateContextValue {
  state: OrionUpdateState;
  updateAvailable: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  performUpdate: () => Promise<void>;
}

const initialState: OrionUpdateState = {
  supported: false,
  currentVersion: "unknown",
  status: "unsupported",
};
const UpdateContext = React.createContext<UpdateContextValue | null>(null);

/** Provides one normalized update experience for CLI browsers and Electron. */
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<OrionUpdateState>(initialState);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const checkForUpdates = React.useCallback(async (manual = false) => {
    const loadingId = manual ? toast.loading("Checking for Orion updates...") : undefined;
    try {
      const bridge = window.orionDesktopUpdater;
      const nextState = bridge
        ? await bridge.check()
        : OrionUpdateStateSchema.parse(
            await fetch("/api/update", { cache: "no-store" }).then((response) => response.json())
          );
      setState(nextState);
      if (manual) {
        if (nextState.status === "current") toast.success("Orion is up to date.");
        if (nextState.status === "error") toast.error(nextState.error ?? "Update check failed.");
      }
    } catch (error) {
      if (manual) toast.error(error instanceof Error ? error.message : "Update check failed.");
    } finally {
      if (loadingId !== undefined) toast.dismiss(loadingId);
    }
  }, []);

  const performUpdate = React.useCallback(async () => {
    const current = stateRef.current;
    const bridge = window.orionDesktopUpdater;
    try {
      if (bridge) {
        if (current.status === "downloaded") {
          await bridge.restartAndInstall();
        } else {
          const nextState = await bridge.download();
          if (nextState.status === "error") {
            throw new Error(nextState.error ?? "Update download failed.");
          }
        }
        return;
      }
      setState((value) => ({ ...value, status: "installing", error: undefined }));
      const response = await fetch("/api/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Update failed.");
      toast.success("Orion was updated. Run orion again to start the new version.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      setState((value) => ({ ...value, status: "error", error: message }));
      toast.dismiss(UPDATE_TOAST_ID);
      toast.error(message);
    }
  }, []);

  React.useEffect(() => {
    const bridge = window.orionDesktopUpdater;
    let unsubscribeState: (() => void) | undefined;
    let unsubscribeManual: (() => void) | undefined;
    let initialTimer: ReturnType<typeof setTimeout> | undefined;
    let dailyTimer: ReturnType<typeof setInterval> | undefined;

    if (bridge) {
      void bridge.getState().then(setState);
      unsubscribeState = bridge.onStateChange(setState);
      unsubscribeManual = bridge.onManualCheck(() => void checkForUpdates(true));
    } else {
      initialTimer = setTimeout(() => void checkForUpdates(), INITIAL_CHECK_DELAY_MS);
      dailyTimer = setInterval(() => void checkForUpdates(), DAILY_CHECK_INTERVAL_MS);
    }
    return () => {
      unsubscribeState?.();
      unsubscribeManual?.();
      if (initialTimer) clearTimeout(initialTimer);
      if (dailyTimer) clearInterval(dailyTimer);
    };
  }, [checkForUpdates]);

  React.useEffect(() => {
    if (state.status === "available" && state.latestVersion) {
      if (localStorage.getItem(DISMISSED_VERSION_KEY) === state.latestVersion) return;
      toast.info(`Orion ${state.latestVersion} is available.`, {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        closeButton: true,
        action: { label: "Update", onClick: () => void performUpdate() },
        onDismiss: () => localStorage.setItem(DISMISSED_VERSION_KEY, state.latestVersion!),
      });
    } else if (state.status === "downloading") {
      toast.loading(
        state.progress === undefined
          ? "Downloading Orion update..."
          : `Downloading Orion update... ${Math.round(state.progress)}%`,
        { id: UPDATE_TOAST_ID, duration: Infinity }
      );
    } else if (state.status === "downloaded") {
      toast.dismiss(UPDATE_TOAST_ID);
      toast.success(`Orion ${state.latestVersion ?? "update"} is ready.`, {
        id: READY_TOAST_ID,
        duration: Infinity,
        closeButton: true,
        action: { label: "Restart and update", onClick: () => void performUpdate() },
      });
    } else if (state.status === "installing") {
      toast.loading("Updating Orion...", { id: UPDATE_TOAST_ID, duration: Infinity });
    }
  }, [performUpdate, state]);

  const value = React.useMemo<UpdateContextValue>(
    () => ({
      state,
      updateAvailable: ["available", "downloading", "downloaded"].includes(state.status),
      checkForUpdates,
      performUpdate,
    }),
    [checkForUpdates, performUpdate, state]
  );
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

/** Returns the shared Orion update state and actions. */
export function useOrionUpdate(): UpdateContextValue {
  const context = React.useContext(UpdateContext);
  if (!context) throw new Error("useOrionUpdate must be used inside UpdateProvider.");
  return context;
}
