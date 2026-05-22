"use client";

import { useEffect } from "react";

import { useOpenSettings } from "@/contexts/open-settings-context";
import { USER_SETTINGS_EDITOR_PATH } from "@/lib/settings/user-settings-editor-path";

interface OpenUserSettingsFileReference {
  name: string;
  path: string;
}

interface UseRegisterOpenUserSettingsFileOptions {
  onOpenFile: (file: OpenUserSettingsFileReference) => void;
}

/**
 * Registers the handler that opens Orion's user settings JSON in the main editor.
 */
export function useRegisterOpenUserSettingsFile({
  onOpenFile,
}: UseRegisterOpenUserSettingsFileOptions): void {
  const { registerOpenUserSettingsFileHandler } = useOpenSettings();

  useEffect(() => {
    registerOpenUserSettingsFileHandler(() => {
      onOpenFile({
        name: "settings.json",
        path: USER_SETTINGS_EDITOR_PATH,
      });
      window.dispatchEvent(new CustomEvent("orion:focusEditor"));
    });

    return () => {
      registerOpenUserSettingsFileHandler(null);
    };
  }, [onOpenFile, registerOpenUserSettingsFileHandler]);
}
