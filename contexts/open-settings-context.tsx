"use client";

import * as React from "react";
import type {
  AgentSettingsSection,
  SettingsTab,
} from "@/components/settings-dialog/types";

interface OpenSettingsContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the settings dialog and switch to the given tab. */
  openWithTab: (
    tab: SettingsTab,
    agentSection?: AgentSettingsSection,
    interactionModeId?: string,
  ) => void;
  /** Tab to show when dialog opens (cleared after use). */
  initialTab: SettingsTab | null;
  /** Agent subsection to show when opening the Agent tab. */
  initialAgentSection: AgentSettingsSection | null;
  /** Interaction mode to select when opening the Interaction modes section. */
  initialInteractionModeId: string | null;
  /** Opens the user settings JSON file in the main editor. */
  openUserSettingsFile: () => void;
  /** Registers the handler that opens the user settings file in the editor. */
  registerOpenUserSettingsFileHandler: (handler: (() => void) | null) => void;
  /** Opens `ORION.md` in the main editor. */
  openPersonalContextFile: () => void;
  /** Registers the handler that opens `ORION.md` in the editor. */
  registerOpenPersonalContextFileHandler: (handler: (() => void) | null) => void;
}

const OpenSettingsContext =
  React.createContext<OpenSettingsContextValue | null>(null);

export function OpenSettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [initialTab, setInitialTab] = React.useState<SettingsTab | null>(null);
  const [initialAgentSection, setInitialAgentSection] =
    React.useState<AgentSettingsSection | null>(null);
  const [initialInteractionModeId, setInitialInteractionModeId] =
    React.useState<string | null>(null);
  const openUserSettingsFileHandlerRef = React.useRef<(() => void) | null>(null);
  const openPersonalContextFileHandlerRef = React.useRef<(() => void) | null>(null);

  /** Opens the settings dialog from the desktop menu or keyboard shortcut. */
  React.useEffect(() => {
    const isDesktopShell = Boolean(window.orionDesktopShell);
    const openDefaultSettings = () => {
      setInitialTab(null);
      setInitialAgentSection(null);
      setInitialInteractionModeId(null);
      setOpen(true);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const isDesktopSettingsShortcut =
        isDesktopShell &&
        ((e.metaKey && !e.ctrlKey) || (!e.metaKey && e.ctrlKey)) &&
        !e.altKey &&
        !e.shiftKey &&
        e.code === "Comma";
      const isBrowserSettingsShortcut =
        !isDesktopShell &&
        e.metaKey &&
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.code === "Comma";
      if (!isDesktopSettingsShortcut && !isBrowserSettingsShortcut) {
        return;
      }
      e.preventDefault();
      openDefaultSettings();
    };
    const unsubscribeDesktopOpenSettings =
      window.orionDesktopShell?.onOpenSettings?.(openDefaultSettings);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribeDesktopOpenSettings?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const openWithTab = React.useCallback(
    (
      tab: SettingsTab,
      agentSection?: AgentSettingsSection,
      interactionModeId?: string,
    ) => {
      setInitialTab(tab);
      setInitialAgentSection(agentSection ?? null);
      setInitialInteractionModeId(interactionModeId ?? null);
      setOpen(true);
    },
    []
  );

  const onOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setInitialTab(null);
      setInitialAgentSection(null);
      setInitialInteractionModeId(null);
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

  const registerOpenPersonalContextFileHandler = React.useCallback(
    (handler: (() => void) | null) => {
      openPersonalContextFileHandlerRef.current = handler;
    },
    [],
  );

  const openPersonalContextFile = React.useCallback(() => {
    openPersonalContextFileHandlerRef.current?.();
  }, []);

  const value = React.useMemo(
    () => ({
      open,
      onOpenChange,
      openWithTab,
      initialTab,
      initialAgentSection,
      initialInteractionModeId,
      openUserSettingsFile,
      registerOpenUserSettingsFileHandler,
      openPersonalContextFile,
      registerOpenPersonalContextFileHandler,
    }),
    [
      open,
      onOpenChange,
      openWithTab,
      initialTab,
      initialAgentSection,
      initialInteractionModeId,
      openUserSettingsFile,
      registerOpenUserSettingsFileHandler,
      openPersonalContextFile,
      registerOpenPersonalContextFileHandler,
    ],
  );

  return (
    <OpenSettingsContext.Provider value={value}>
      {children}
    </OpenSettingsContext.Provider>
  );
}

/**
 * Non-throwing variant for callers that may render outside the provider.
 *
 * `AssistantProvider` uses this so the agent's `connections` tool can open the
 * Connections tab where the dialog exists, without making the whole assistant
 * tree depend on the settings provider being mounted.
 */
export function useOptionalOpenSettings(): OpenSettingsContextValue | null {
  return React.useContext(OpenSettingsContext);
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
