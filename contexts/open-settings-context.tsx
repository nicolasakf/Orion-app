"use client";

import * as React from "react";
import type { SettingsTab } from "@/components/settings-dialog/types";

interface OpenSettingsContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the settings dialog and switch to the given tab. */
  openWithTab: (tab: SettingsTab) => void;
  /** Tab to show when dialog opens (cleared after use). */
  initialTab: SettingsTab | null;
  /** Opens the user settings JSON file in the main editor. */
  openUserSettingsFile: () => void;
  /** Registers the handler that opens the user settings file in the editor. */
  registerOpenUserSettingsFileHandler: (handler: (() => void) | null) => void;
}

const OpenSettingsContext =
  React.createContext<OpenSettingsContextValue | null>(null);

export function OpenSettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [initialTab, setInitialTab] = React.useState<SettingsTab | null>(null);
  const openUserSettingsFileHandlerRef = React.useRef<(() => void) | null>(null);

  /** ⌘⌥, (Windows: Win+Alt+,): toggle the settings dialog from anywhere in the app shell. */
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !e.metaKey ||
        !e.altKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.code !== "Comma"
      ) {
        return;
      }
      e.preventDefault();
      setOpen((prev) => {
        if (prev) setInitialTab(null);
        return !prev;
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openWithTab = React.useCallback((tab: SettingsTab) => {
    setInitialTab(tab);
    setOpen(true);
  }, []);

  const onOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setInitialTab(null);
    }
  }, []);

  const registerOpenUserSettingsFileHandler = React.useCallback(
    (handler: (() => void) | null) => {
      openUserSettingsFileHandlerRef.current = handler;
    },
    [],
  );

  const openUserSettingsFile = React.useCallback(() => {
    openUserSettingsFileHandlerRef.current?.();
  }, []);

  const value = React.useMemo(
    () => ({
      open,
      onOpenChange,
      openWithTab,
      initialTab,
      openUserSettingsFile,
      registerOpenUserSettingsFileHandler,
    }),
    [
      open,
      onOpenChange,
      openWithTab,
      initialTab,
      openUserSettingsFile,
      registerOpenUserSettingsFileHandler,
    ],
  );

  return (
    <OpenSettingsContext.Provider value={value}>
      {children}
    </OpenSettingsContext.Provider>
  );
}

export function useOpenSettings(): OpenSettingsContextValue {
  const ctx = React.useContext(OpenSettingsContext);
  if (!ctx) {
    throw new Error("useOpenSettings must be used within OpenSettingsProvider");
  }
  return ctx;
}

export function useOpenSettingsOptional(): OpenSettingsContextValue | null {
  return React.useContext(OpenSettingsContext);
}
