"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useOrionSettings } from "@/hooks/use-orion-settings";

/** Storage tab for user/project scope persistence and JSON import/export. */
export function StorageTab() {
  const {
    errorMessage,
    projectFileConnected,
    projectFileName,
    projectReadPermission,
    connectProjectSettingsFile,
    reconnectProjectSettingsFile,
    disconnectProjectSettingsFile,
    resetUserSettings,
    resetProjectSettings,
    importUserSettingsFromJson,
    importProjectSettingsFromJson,
    exportEffectiveSettingsAsJson,
  } = useOrionSettings();
  const [importScope, setImportScope] = React.useState<"user" | "project">("user");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([exportEffectiveSettingsAsJson()], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "orion-settings-export.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (importScope === "project") {
      await importProjectSettingsFromJson(text);
    } else {
      await importUserSettingsFromJson(text);
    }
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground">
          Manage user-level and project-level settings persistence.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="corner-squircle rounded-md border p-3 flex items-center justify-between">
          <span className="text-sm">Project settings file</span>
          <Badge variant={projectFileConnected ? "default" : "secondary"}>
            {projectFileConnected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
        <div className="corner-squircle rounded-md border p-3 flex items-center justify-between">
          <span className="text-sm">Project file permissions</span>
          <Badge variant={projectReadPermission ? "default" : "secondary"}>
            {projectReadPermission ? "Readable" : "Needs Permission"}
          </Badge>
        </div>
      </div>

      <div className="corner-squircle rounded-md border p-3 text-sm text-muted-foreground">
        {projectFileName
          ? `Connected file: ${projectFileName}`
          : "No project settings file selected yet."}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void connectProjectSettingsFile()}>
          Connect Project File
        </Button>
        <Button variant="outline" onClick={() => void reconnectProjectSettingsFile()}>
          Reconnect
        </Button>
        <Button variant="outline" onClick={() => void disconnectProjectSettingsFile()}>
          Disconnect
        </Button>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label htmlFor="settings-import-scope">Import scope</Label>
        <Select
          value={importScope}
          onValueChange={(value) => setImportScope(value as "user" | "project")}
        >
          <SelectTrigger id="settings-import-scope" className="max-w-xs">
            <SelectValue placeholder="Choose target scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User settings scope</SelectItem>
            <SelectItem value="project">Project settings scope</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportFile}
        className="hidden"
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleExport}>
          Export Effective JSON
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          Import JSON
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" onClick={() => void resetUserSettings()}>
          Reset User Scope
        </Button>
        <Button variant="destructive" onClick={() => void resetProjectSettings()}>
          Reset Project Scope
        </Button>
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
