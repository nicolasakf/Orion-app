"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SettingsInfoLabel,
  SettingsInfoSectionTitle,
} from "@/components/settings-dialog/settings-info-label";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type {
  EmptyEditorCardContent,
  ExperienceMode,
  ThemeSetting,
} from "@/lib/settings/schema";

const EMPTY_EDITOR_CARD_OPTIONS: Array<{
  value: EmptyEditorCardContent;
  label: string;
}> = [
  { value: "recent_files", label: "Recent files" },
  { value: "pinned_files", label: "Pinned files" },
  { value: "pinned_workspaces", label: "Pinned workspaces" },
];

const EXPERIENCE_MODE_OPTIONS: Array<{
  value: ExperienceMode;
  label: string;
}> = [
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
];

const THEME_OPTIONS: Array<{
  value: ThemeSetting;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface SettingsTabsFieldProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<{
    value: T;
    label: string;
  }>;
  onValueChange: (value: T) => void;
}

/** Segmented tabs for short mutually-exclusive appearance settings. */
function SettingsTabsField<T extends string>({
  ariaLabel,
  value,
  options,
  onValueChange,
}: SettingsTabsFieldProps<T>) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      aria-label={ariaLabel}
      className="w-full"
    >
      <TabsList
        className="grid h-9 w-full"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="h-7 px-2 text-xs"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Keeps autosave intervals valid while the user edits the milliseconds field. */
function clampAutosaveIntervalMs(value: number): number {
  return Math.max(1, Math.floor(value));
}

/** Appearance tab: theme, editor preferences, and persistent display defaults. */
export function AppearanceTab() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const appearance = effectiveSettings.appearance;
  const chat = effectiveSettings.chat;
  const fileTree = effectiveSettings.fileTree;
  const editor = effectiveSettings.editor;
  const emptyEditor = editor.emptyEditor;
  const isBusinessMode = appearance.experienceMode === "business";

  const handleThemeChange = (value: ThemeSetting) => {
    void setUserSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        theme: value,
      },
    }));
  };

  const handleExperienceModeChange = (value: ExperienceMode) => {
    void setUserSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        experienceMode: value,
      },
    }));
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Control theme, editor defaults, and display preferences.
        </p>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <SettingsInfoSectionTitle
            title="Experience"
          />
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <SettingsInfoLabel
                htmlFor="appearance-experience-mode"
                label="Product experience"
                description="Pro keeps Orion's notebook-first workflow. Business uses a simpler data-and-chat-first workspace."
              />
              <SettingsTabsField
                ariaLabel="Product experience"
                value={appearance.experienceMode}
                options={EXPERIENCE_MODE_OPTIONS}
                onValueChange={handleExperienceModeChange}
              />
            </div>

            <div className="space-y-2">
              <SettingsInfoLabel
                htmlFor="appearance-theme"
                label="Theme"
                description="Choose Orion's color mode."
              />
              <SettingsTabsField
                ariaLabel="Theme"
                value={appearance.theme}
                options={THEME_OPTIONS}
                onValueChange={handleThemeChange}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Side Panels</h3>
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="chat-font-size">Chat font size</Label>
              <Input
                id="chat-font-size"
                type="number"
                min={10}
                max={20}
                value={chat.fontSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    chat: {
                      ...current.chat,
                      fontSize: Math.max(10, Math.min(20, next)),
                    },
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file-tree-font-size">File tree font size</Label>
              <Input
                id="file-tree-font-size"
                type="number"
                min={10}
                max={20}
                value={fileTree.fontSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    fileTree: {
                      ...current.fileTree,
                      fontSize: Math.max(10, Math.min(20, next)),
                    },
                  }));
                }}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Editor</h3>
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="editor-font-size">Font size</Label>
              <Input
                id="editor-font-size"
                type="number"
                min={10}
                max={28}
                value={editor.fontSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      fontSize: Math.max(10, Math.min(28, next)),
                    },
                  }));
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editor-tab-size">Tab size</Label>
              <Input
                id="editor-tab-size"
                type="number"
                min={1}
                max={8}
                value={editor.tabSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      tabSize: Math.max(1, Math.min(8, next)),
                    },
                  }));
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editor-word-wrap">Word wrap</Label>
              <Select
                value={editor.wordWrap}
                onValueChange={(value) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      wordWrap: value as
                        | "off"
                        | "on"
                        | "wordWrapColumn"
                        | "bounded",
                    },
                  }))
                }
              >
                <SelectTrigger id="editor-word-wrap">
                  <SelectValue placeholder="Select word wrap mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="wordWrapColumn">Word Wrap Column</SelectItem>
                  <SelectItem value="bounded">Bounded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="corner-squircle flex items-center justify-between gap-4 rounded-md border p-3 sm:col-span-3">
              <SettingsInfoLabel
                htmlFor="editor-unopenable-file-action"
                label="Unsupported files"
                description="When you click a file Orion cannot open in the editor, add it as a chat mention or open it with your system's default app."
              />
              <Select
                value={editor.unopenableFileAction}
                onValueChange={(value) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      unopenableFileAction: value as
                        | "mention_in_chat"
                        | "open_externally",
                    },
                  }))
                }
              >
                <SelectTrigger
                  id="editor-unopenable-file-action"
                  className="w-[220px] shrink-0"
                >
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mention_in_chat">
                    Mention in chat
                  </SelectItem>
                  <SelectItem value="open_externally">
                    Open with external app
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3 sm:col-span-3">
              <SettingsInfoLabel
                htmlFor="editor-minimap"
                label="Minimap"
                description="Show code overview minimap in Editor."
              />
              <Switch
                id="editor-minimap"
                checked={editor.minimapEnabled}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      minimapEnabled: checked,
                    },
                  }))
                }
              />
            </div>

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3 sm:col-span-3">
              <SettingsInfoLabel
                htmlFor="editor-insert-spaces"
                label="Insert spaces"
                description="Use spaces instead of tab characters."
              />
              <Switch
                id="editor-insert-spaces"
                checked={editor.insertSpaces}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      insertSpaces: checked,
                    },
                  }))
                }
              />
            </div>

            {!isBusinessMode ? (
              <div className="corner-squircle flex items-center justify-between rounded-md border p-3 sm:col-span-3">
                <SettingsInfoLabel
                  htmlFor="editor-autosave"
                  label="Autosave"
                  description="Periodically saves dirty files open in the editor."
                />
                <Switch
                  id="editor-autosave"
                  checked={editor.autosaveEnabled}
                  onCheckedChange={(checked) =>
                    void setUserSettings((current) => ({
                      ...current,
                      editor: {
                        ...current.editor,
                        autosaveEnabled: checked,
                      },
                    }))
                  }
                />
              </div>
            ) : null}

            <div className="space-y-2 sm:col-span-3">
              <SettingsInfoLabel
                htmlFor="editor-autosave-interval-ms"
                label="Autosave interval"
                description="How often autosave should save dirty editor files, in milliseconds."
              />
              <Input
                id="editor-autosave-interval-ms"
                type="number"
                min={1}
                step={100}
                value={editor.autosaveIntervalMs}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      autosaveIntervalMs: clampAutosaveIntervalMs(next),
                    },
                  }));
                }}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <SettingsInfoSectionTitle
            title="Empty editor"
            description="Choose what appears in the left and right shortcut cards when no file is open in the editor."
          />
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="empty-editor-left-card">Left card</Label>
              <Select
                value={emptyEditor.leftCard}
                onValueChange={(value) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      emptyEditor: {
                        ...current.editor.emptyEditor,
                        leftCard: value as EmptyEditorCardContent,
                      },
                    },
                  }))
                }
              >
                <SelectTrigger id="empty-editor-left-card">
                  <SelectValue placeholder="Select content" />
                </SelectTrigger>
                <SelectContent>
                  {EMPTY_EDITOR_CARD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="empty-editor-right-card">Right card</Label>
              <Select
                value={emptyEditor.rightCard}
                onValueChange={(value) =>
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      emptyEditor: {
                        ...current.editor.emptyEditor,
                        rightCard: value as EmptyEditorCardContent,
                      },
                    },
                  }))
                }
              >
                <SelectTrigger id="empty-editor-right-card">
                  <SelectValue placeholder="Select content" />
                </SelectTrigger>
                <SelectContent>
                  {EMPTY_EDITOR_CARD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="empty-editor-max-items">Max items</Label>
              <Input
                id="empty-editor-max-items"
                type="number"
                min={1}
                max={20}
                value={emptyEditor.maxItems}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  void setUserSettings((current) => ({
                    ...current,
                    editor: {
                      ...current.editor,
                      emptyEditor: {
                        ...current.editor.emptyEditor,
                        maxItems: Math.max(1, Math.min(20, next)),
                      },
                    },
                  }));
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
