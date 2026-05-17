"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { createDefaultProjectSettingsDocument, createDefaultUserSettingsDocument, DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { applyLegacyClientSettings } from "@/lib/settings/legacy";
import { mergeSettings } from "@/lib/settings/merge";
import { parseProjectSettingsDocumentFromJson, parseUserSettingsDocumentFromJson } from "@/lib/settings/migrations";
import {
  ensureProjectSettingsReadPermission,
  ensureProjectSettingsReadWritePermission,
  hasProjectSettingsReadPermission,
  loadProjectSettingsFromFile,
  saveProjectSettingsToFile,
} from "@/lib/settings/project-file-storage";
import {
  clearProjectSettingsHandle,
  DEFAULT_PROJECT_ID,
  getProjectSettingsHandle,
  setProjectSettingsHandle,
} from "@/lib/settings/project-handle-storage";
import type {
  ProjectSettingsDocument,
  ProjectSettingsOverrides,
  SettingsData,
  UserSettingsDocument,
} from "@/lib/settings/schema";
import { clearUserSettingsDocument, getUserSettingsDocument, setUserSettingsDocument } from "@/lib/settings/user-storage";

type UserUpdater = (current: SettingsData) => SettingsData;
type ProjectUpdater = (current: ProjectSettingsOverrides) => ProjectSettingsOverrides;

interface SettingsContextValue {
  isHydrated: boolean;
  isSavingUser: boolean;
  isSavingProject: boolean;
  errorMessage: string | null;
  userDocument: UserSettingsDocument;
  projectDocument: ProjectSettingsDocument;
  effectiveSettings: SettingsData;
  projectFileName: string | null;
  projectFileConnected: boolean;
  projectReadPermission: boolean;
  setUserSettings: (updater: UserUpdater) => Promise<void>;
  setProjectOverrides: (updater: ProjectUpdater) => Promise<void>;
  resetUserSettings: () => Promise<void>;
  resetProjectSettings: () => Promise<void>;
  connectProjectSettingsFile: () => Promise<boolean>;
  reconnectProjectSettingsFile: () => Promise<boolean>;
  disconnectProjectSettingsFile: () => Promise<void>;
  importUserSettingsFromJson: (json: string) => Promise<void>;
  importProjectSettingsFromJson: (json: string) => Promise<void>;
  exportEffectiveSettingsAsJson: () => string;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

function getSavePicker():
  | ((options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle>)
  | null {
  if (typeof window === "undefined") return null;
  const maybePicker = (window as any).showSaveFilePicker;
  return typeof maybePicker === "function" ? maybePicker : null;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [userDocument, setUserDocument] = React.useState<UserSettingsDocument>(
    createDefaultUserSettingsDocument()
  );
  const [projectDocument, setProjectDocument] = React.useState<ProjectSettingsDocument>(
    createDefaultProjectSettingsDocument()
  );
  const [projectHandle, setProjectHandle] = React.useState<FileSystemFileHandle | null>(null);
  const [projectFileName, setProjectFileName] = React.useState<string | null>(null);
  const [projectReadPermission, setProjectReadPermission] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isSavingUser, setIsSavingUser] = React.useState(false);
  const [isSavingProject, setIsSavingProject] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const userDocumentRef = React.useRef<UserSettingsDocument>(userDocument);
  const projectDocumentRef = React.useRef<ProjectSettingsDocument>(projectDocument);
  const userPersistChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const projectPersistChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const userPendingWritesRef = React.useRef(0);
  const projectPendingWritesRef = React.useRef(0);

  const effectiveSettings = React.useMemo(
    () => mergeSettings(DEFAULT_SETTINGS, userDocument.settings, projectDocument.overrides),
    [userDocument, projectDocument]
  );

  React.useEffect(() => {
    userDocumentRef.current = userDocument;
  }, [userDocument]);

  React.useEffect(() => {
    projectDocumentRef.current = projectDocument;
  }, [projectDocument]);

  const persistUserDocument = React.useCallback(async (nextDocument: UserSettingsDocument) => {
    userDocumentRef.current = nextDocument;
    setUserDocument(nextDocument);

    userPendingWritesRef.current += 1;
    setIsSavingUser(true);

    const runPersist = userPersistChainRef.current
      .catch(() => {
        // Keep queue healthy even after a failed write.
      })
      .then(() => setUserSettingsDocument(nextDocument))
      .finally(() => {
        userPendingWritesRef.current = Math.max(0, userPendingWritesRef.current - 1);
        if (userPendingWritesRef.current === 0) {
          setIsSavingUser(false);
        }
      });

    userPersistChainRef.current = runPersist;
    await runPersist;
  }, []);

  const persistProjectDocument = React.useCallback(
    async (nextDocument: ProjectSettingsDocument) => {
      projectDocumentRef.current = nextDocument;
      setProjectDocument(nextDocument);
      if (!projectHandle) {
        return;
      }

      projectPendingWritesRef.current += 1;
      setIsSavingProject(true);

      const runPersist = projectPersistChainRef.current
        .catch(() => {
          // Keep queue healthy even after a failed write.
        })
        .then(() => saveProjectSettingsToFile(projectHandle, nextDocument))
        .finally(() => {
          projectPendingWritesRef.current = Math.max(
            0,
            projectPendingWritesRef.current - 1
          );
          if (projectPendingWritesRef.current === 0) {
            setIsSavingProject(false);
          }
        });

      projectPersistChainRef.current = runPersist;
      await runPersist;
    },
    [projectHandle]
  );

  const loadProjectDocumentFromHandle = React.useCallback(async (handle: FileSystemFileHandle) => {
    const hasReadPermission = await hasProjectSettingsReadPermission(handle);
    setProjectReadPermission(hasReadPermission);
    if (!hasReadPermission) {
      return false;
    }

    const loaded = await loadProjectSettingsFromFile(handle);
    setProjectDocument(loaded);
    return true;
  }, []);

  React.useEffect(() => {
    let isCancelled = false;

    const hydrate = async () => {
      try {
        const loadedUser = await getUserSettingsDocument();
        if (!isCancelled && loadedUser) {
          setUserDocument(loadedUser);
        } else if (!isCancelled) {
          const migrated = createDefaultUserSettingsDocument();
          migrated.settings = applyLegacyClientSettings(migrated.settings);
          setUserDocument(migrated);
          await setUserSettingsDocument(migrated);
        }

        const storedHandle = await getProjectSettingsHandle(DEFAULT_PROJECT_ID);
        if (!isCancelled && storedHandle) {
          setProjectHandle(storedHandle);
          setProjectFileName(storedHandle.name);
          const loaded = await loadProjectDocumentFromHandle(storedHandle);
          if (!loaded) {
            setErrorMessage(
              "Project settings file is connected but read permission is not granted."
            );
          }
        }
      } catch (error) {
        console.warn("Failed to hydrate settings:", error);
        if (!isCancelled) {
          setErrorMessage("Failed to load settings. Using defaults for now.");
        }
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    };

    hydrate();

    return () => {
      isCancelled = true;
    };
  }, [loadProjectDocumentFromHandle]);

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
      const currentDocument = userDocumentRef.current;
      const nextSettings = updater(currentDocument.settings);
      const nextDocument: UserSettingsDocument = {
        ...currentDocument,
        settings: nextSettings,
      };
      await persistUserDocument(nextDocument);
    },
    [persistUserDocument]
  );

  const setProjectOverrides = React.useCallback(
    async (updater: ProjectUpdater) => {
      setErrorMessage(null);
      const currentDocument = projectDocumentRef.current;
      const nextOverrides = updater(currentDocument.overrides);
      const nextDocument: ProjectSettingsDocument = {
        ...currentDocument,
        overrides: nextOverrides,
      };
      try {
        await persistProjectDocument(nextDocument);
      } catch (error) {
        console.warn("Failed to persist project settings:", error);
        setErrorMessage("Unable to persist project settings file.");
      }
    },
    [persistProjectDocument]
  );

  const connectProjectSettingsFile = React.useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    const picker = getSavePicker();
    if (!picker) {
      setErrorMessage("This browser does not support selecting a project settings file.");
      return false;
    }

    try {
      const handle = await picker({
        suggestedName: "settings.json",
        types: [
          {
            description: "JSON file",
            accept: { "application/json": [".json"] },
          },
        ],
        excludeAcceptAllOption: false,
      });

      const hasReadWrite = await ensureProjectSettingsReadWritePermission(handle);
      if (!hasReadWrite) {
        setErrorMessage("Permission denied for project settings file.");
        return false;
      }

      setProjectHandle(handle);
      setProjectFileName(handle.name);
      await setProjectSettingsHandle(handle, DEFAULT_PROJECT_ID);

      const hasRead = await ensureProjectSettingsReadPermission(handle);
      setProjectReadPermission(hasRead);
      if (!hasRead) {
        setErrorMessage("Read permission denied for project settings file.");
        return false;
      }

      const loaded = await loadProjectSettingsFromFile(handle);
      setProjectDocument(loaded);
      return true;
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        console.warn("Failed to connect project settings file:", error);
        setErrorMessage("Failed to connect project settings file.");
      }
      return false;
    }
  }, []);

  const reconnectProjectSettingsFile = React.useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    try {
      const handle = await getProjectSettingsHandle(DEFAULT_PROJECT_ID);
      if (!handle) {
        setErrorMessage("No previously connected project settings file found.");
        return false;
      }

      setProjectHandle(handle);
      setProjectFileName(handle.name);
      const hasRead = await ensureProjectSettingsReadPermission(handle);
      setProjectReadPermission(hasRead);
      if (!hasRead) {
        setErrorMessage("Permission denied while reconnecting project settings file.");
        return false;
      }

      const loaded = await loadProjectSettingsFromFile(handle);
      setProjectDocument(loaded);
      return true;
    } catch (error) {
      console.warn("Failed to reconnect project settings file:", error);
      setErrorMessage("Failed to reconnect project settings file.");
      return false;
    }
  }, []);

  const disconnectProjectSettingsFile = React.useCallback(async () => {
    setProjectHandle(null);
    setProjectFileName(null);
    setProjectReadPermission(false);
    setProjectDocument(createDefaultProjectSettingsDocument());
    await clearProjectSettingsHandle(DEFAULT_PROJECT_ID);
  }, []);

  const resetUserSettings = React.useCallback(async () => {
    setErrorMessage(null);
    await clearUserSettingsDocument();
    const next = createDefaultUserSettingsDocument();
    await persistUserDocument(next);
  }, [persistUserDocument]);

  const resetProjectSettings = React.useCallback(async () => {
    setErrorMessage(null);
    const next = createDefaultProjectSettingsDocument();
    try {
      await persistProjectDocument(next);
    } catch (error) {
      console.warn("Failed to reset project settings:", error);
      setErrorMessage("Failed to reset project settings file.");
    }
  }, [persistProjectDocument]);

  const importUserSettingsFromJson = React.useCallback(
    async (json: string) => {
      setErrorMessage(null);
      const parsed = parseUserSettingsDocumentFromJson(json);
      await persistUserDocument(parsed);
    },
    [persistUserDocument]
  );

  const importProjectSettingsFromJson = React.useCallback(
    async (json: string) => {
      setErrorMessage(null);
      const parsed = parseProjectSettingsDocumentFromJson(json);
      try {
        await persistProjectDocument(parsed);
      } catch (error) {
        console.warn("Failed to import project settings from JSON:", error);
        setErrorMessage("Failed to import project settings into project file.");
      }
    },
    [persistProjectDocument]
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
      isSavingProject,
      errorMessage,
      userDocument,
      projectDocument,
      effectiveSettings,
      projectFileName,
      projectFileConnected: Boolean(projectHandle),
      projectReadPermission,
      setUserSettings,
      setProjectOverrides,
      resetUserSettings,
      resetProjectSettings,
      connectProjectSettingsFile,
      reconnectProjectSettingsFile,
      disconnectProjectSettingsFile,
      importUserSettingsFromJson,
      importProjectSettingsFromJson,
      exportEffectiveSettingsAsJson,
    }),
    [
      connectProjectSettingsFile,
      disconnectProjectSettingsFile,
      effectiveSettings,
      errorMessage,
      exportEffectiveSettingsAsJson,
      importProjectSettingsFromJson,
      importUserSettingsFromJson,
      isHydrated,
      isSavingProject,
      isSavingUser,
      projectDocument,
      projectFileName,
      projectHandle,
      projectReadPermission,
      reconnectProjectSettingsFile,
      resetProjectSettings,
      resetUserSettings,
      setProjectOverrides,
      setUserSettings,
      userDocument,
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
