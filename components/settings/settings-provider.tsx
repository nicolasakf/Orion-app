"use client";

import * as React from "react";
import type { ContentsManager } from "@jupyterlab/services";
import { useTheme } from "next-themes";

import {
  createDefaultUserSettingsDocument,
  createDefaultWorkspaceSettingsDocument,
  DEFAULT_SETTINGS,
} from "@/lib/settings/defaults";
import { settingsValuesEqual } from "@/lib/settings/compact";
import { mergeSettings } from "@/lib/settings/merge";
import { parseUserSettingsDocumentFromJson } from "@/lib/settings/migrations";
import { loadWorkspaceSettingsDocument } from "@/lib/settings/workspace-file-storage";
import type {
  SettingsData,
  UserSettingsDocument,
  WorkspaceSettingsDocument,
} from "@/lib/settings/schema";
import {
  clearUserSettingsDocument,
  loadUserSettingsDocumentFromApi,
  setUserSettingsDocument,
} from "@/lib/settings/user-storage";

type UserUpdater = (current: SettingsData) => SettingsData;
type ProviderCredentialWriteMode = "merge" | "replace";
type UserSettingsLoadStatus = "loading" | "loaded" | "missing" | "failed";

interface SettingsContextValue {
  isHydrated: boolean;
  isSavingUser: boolean;
  userSettingsLoadStatus: UserSettingsLoadStatus;
  errorMessage: string | null;
  userDocument: UserSettingsDocument;
  workspaceDocument: WorkspaceSettingsDocument;
  effectiveSettings: SettingsData;
  setUserSettings: (updater: UserUpdater) => Promise<void>;
  setWorkspaceSettingsSource: (
    contentsManager: ContentsManager | null,
    workspaceDirectory: string | null | undefined
  ) => void;
  reloadUserSettings: () => Promise<void>;
  resetUserSettings: () => Promise<void>;
  importUserSettingsFromJson: (json: string) => Promise<void>;
  exportEffectiveSettingsAsJson: () => string;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [userDocument, setUserDocument] = React.useState<UserSettingsDocument>(
    createDefaultUserSettingsDocument()
  );
  const [workspaceDocument, setWorkspaceDocument] =
    React.useState<WorkspaceSettingsDocument>(
      createDefaultWorkspaceSettingsDocument()
    );
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isSavingUser, setIsSavingUser] = React.useState(false);
  const [userSettingsLoadStatus, setUserSettingsLoadStatus] =
    React.useState<UserSettingsLoadStatus>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const userDocumentRef = React.useRef<UserSettingsDocument>(userDocument);
  const userPersistChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const userPendingWritesRef = React.useRef(0);
  const userSettingsWritableRef = React.useRef(false);
  const workspaceSettingsLoadIdRef = React.useRef(0);

  const effectiveSettings = React.useMemo(
    () =>
      mergeSettings(
        DEFAULT_SETTINGS,
        userDocument.settings,
        workspaceDocument.overrides
      ),
    [userDocument, workspaceDocument]
  );

  React.useEffect(() => {
    userDocumentRef.current = userDocument;
  }, [userDocument]);

  const persistUserDocument = React.useCallback(async (
    nextDocument: UserSettingsDocument,
    providerCredentialWriteMode: ProviderCredentialWriteMode = "merge"
  ) => {
    userDocumentRef.current = nextDocument;
    setUserDocument(nextDocument);

    userPendingWritesRef.current += 1;
    setIsSavingUser(true);

    const runPersist = userPersistChainRef.current
      .catch(() => {
        // Keep queue healthy even after a failed write.
      })
      .then(() =>
        setUserSettingsDocument(nextDocument, { providerCredentialWriteMode })
      )
      .finally(() => {
        userPendingWritesRef.current = Math.max(0, userPendingWritesRef.current - 1);
        if (userPendingWritesRef.current === 0) {
          setIsSavingUser(false);
        }
      });

    userPersistChainRef.current = runPersist;
    await runPersist;
    setUserSettingsLoadStatus("loaded");
  }, []);

  const setWorkspaceSettingsSource = React.useCallback(
    (
      contentsManager: ContentsManager | null,
      workspaceDirectory: string | null | undefined
    ) => {
      if (
        !contentsManager ||
        workspaceDirectory === null ||
        workspaceDirectory === undefined
      ) {
        workspaceSettingsLoadIdRef.current += 1;
        setWorkspaceDocument(createDefaultWorkspaceSettingsDocument());
        return;
      }

      const loadId = workspaceSettingsLoadIdRef.current + 1;
      workspaceSettingsLoadIdRef.current = loadId;
      setWorkspaceDocument(createDefaultWorkspaceSettingsDocument());
      void loadWorkspaceSettingsDocument(contentsManager, workspaceDirectory)
        .then((document) => {
          if (workspaceSettingsLoadIdRef.current === loadId) {
            setWorkspaceDocument(document);
          }
        })
        .catch((error) => {
          console.warn("Failed to load workspace settings:", error);
          if (workspaceSettingsLoadIdRef.current === loadId) {
            setWorkspaceDocument(createDefaultWorkspaceSettingsDocument());
          }
        });
    },
    []
  );

  const reloadUserSettings = React.useCallback(async (
    shouldCancel?: () => boolean
  ) => {
    setUserSettingsLoadStatus("loading");
    setErrorMessage(null);

    try {
      const result = await loadUserSettingsDocumentFromApi();
      if (shouldCancel?.()) return;

      if (result.status === "failed") {
        userSettingsWritableRef.current = false;
        setUserSettingsLoadStatus("failed");
        setErrorMessage(
          `${result.message} Changes are disabled until settings reload succeeds.`
        );
        return;
      }

      const normalizedDocument: UserSettingsDocument = {
        version: result.document.version,
        settings: mergeSettings(DEFAULT_SETTINGS, result.document.settings),
      };
      userDocumentRef.current = normalizedDocument;
      userSettingsWritableRef.current = true;
      setUserDocument(normalizedDocument);
      setUserSettingsLoadStatus(result.status);
      setErrorMessage(null);
    } catch (error) {
      console.warn("Failed to hydrate settings:", error);
      if (shouldCancel?.()) return;
      userSettingsWritableRef.current = false;
      setUserSettingsLoadStatus("failed");
      setErrorMessage(
        "Failed to load settings. Changes are disabled until settings reload succeeds."
      );
    }
  }, []);

  React.useEffect(() => {
    let isCancelled = false;

    void reloadUserSettings(() => isCancelled).finally(() => {
      if (!isCancelled) {
        setIsHydrated(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [reloadUserSettings]);

  React.useEffect(() => {
    const handleUserSettingsFileChanged = () => {
      void reloadUserSettings();
    };

    window.addEventListener(
      "orion:user-settings-file-changed",
      handleUserSettingsFileChanged,
    );
    return () => {
      window.removeEventListener(
        "orion:user-settings-file-changed",
        handleUserSettingsFileChanged,
      );
    };
  }, [reloadUserSettings]);

  React.useEffect(() => {
    if (!isHydrated) return;
    const desiredTheme = effectiveSettings.appearance.theme;
    if (theme !== desiredTheme) {
      setTheme(desiredTheme);
    }
  }, [isHydrated, effectiveSettings.appearance.theme, setTheme, theme]);

  const setUserSettings = React.useCallback(
    async (updater: UserUpdater) => {
      setErrorMessage(null);
      if (!userSettingsWritableRef.current) {
        const message =
          "Settings were not loaded successfully, so Orion will not overwrite the user settings file.";
        setErrorMessage(message);
        throw new Error(message);
      }
      const currentDocument = userDocumentRef.current;
      const mergedCurrent = mergeSettings(DEFAULT_SETTINGS, currentDocument.settings);
      const nextSettings = updater(mergedCurrent);
      if (settingsValuesEqual(mergedCurrent, nextSettings)) {
        return;
      }
      const nextDocument: UserSettingsDocument = {
        ...currentDocument,
        settings: nextSettings,
      };
      const previousCredentialKeys = new Set(
        Object.keys(currentDocument.settings.providers.credentials)
      );
      const removedCredential = [...previousCredentialKeys].some(
        (provider) => !(provider in nextSettings.providers.credentials)
      );
      await persistUserDocument(
        nextDocument,
        removedCredential ? "replace" : "merge"
      );
    },
    [persistUserDocument]
  );

  const resetUserSettings = React.useCallback(async () => {
    setErrorMessage(null);
    await clearUserSettingsDocument();
    const next = createDefaultUserSettingsDocument();
    await persistUserDocument(next, "replace");
    userSettingsWritableRef.current = true;
    setUserSettingsLoadStatus("loaded");
  }, [persistUserDocument]);

  const importUserSettingsFromJson = React.useCallback(
    async (json: string) => {
      setErrorMessage(null);
      const parsed = parseUserSettingsDocumentFromJson(json);
      await persistUserDocument(parsed, "replace");
      userSettingsWritableRef.current = true;
      setUserSettingsLoadStatus("loaded");
    },
    [persistUserDocument]
  );

  const exportEffectiveSettingsAsJson = React.useCallback(() => {
    return JSON.stringify(
      {
        version: userDocument.version,
        settings: effectiveSettings,
      },
      null,
      2
    );
  }, [effectiveSettings, userDocument.version]);

  const value = React.useMemo<SettingsContextValue>(
    () => ({
      isHydrated,
      isSavingUser,
      userSettingsLoadStatus,
      errorMessage,
      userDocument,
      workspaceDocument,
      effectiveSettings,
      setUserSettings,
      setWorkspaceSettingsSource,
      reloadUserSettings,
      resetUserSettings,
      importUserSettingsFromJson,
      exportEffectiveSettingsAsJson,
    }),
    [
      effectiveSettings,
      errorMessage,
      exportEffectiveSettingsAsJson,
      importUserSettingsFromJson,
      isHydrated,
      isSavingUser,
      reloadUserSettings,
      resetUserSettings,
      setWorkspaceSettingsSource,
      setUserSettings,
      userSettingsLoadStatus,
      userDocument,
      workspaceDocument,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettingsContext(): SettingsContextValue {
  const context = React.useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettingsContext must be used within a SettingsProvider.");
  }
  return context;
}
