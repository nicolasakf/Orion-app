"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { USER_SETTINGS_EDITOR_PATH } from "@/lib/settings/user-settings-editor-path";

/** Settings tab that opens the local user settings JSON file in the main editor. */
export function SettingsFileTab() {
  const { openUserSettingsFile, onOpenChange } = useOpenSettings();

  const handleOpenInEditor = () => {
    openUserSettingsFile();
    onOpenChange(false);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Settings JSON</h2>
        <p className="text-sm text-muted-foreground">
          Edit Orion&apos;s user settings file directly in the editor. Provider
          credentials are stored separately in ~/.orion/credentials.json and
          are not written to this file.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">File path</p>
        <code className="block rounded-md bg-muted px-3 py-2 text-sm">
          {USER_SETTINGS_EDITOR_PATH}
        </code>
        <Button type="button" onClick={handleOpenInEditor}>
          <ExternalLink className="h-4 w-4" />
          Open in editor
        </Button>
      </div>
    </div>
  );
}
