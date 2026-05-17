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
import { useOrionSettings } from "@/hooks/use-orion-settings";

/** Appearance tab: theme, editor preferences, and layout defaults. */
export function AppearanceTab() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const appearance = effectiveSettings.appearance;
  const chat = effectiveSettings.chat;
  const fileTree = effectiveSettings.fileTree;
  const editor = effectiveSettings.editor;
  const notebook = effectiveSettings.notebook;
  const layout = effectiveSettings.layout;

  const handleThemeChange = (value: "light" | "dark" | "system") => {
    void setUserSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        theme: value,
      },
    }));
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Control theme, editor defaults, and layout preferences.
        </p>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-bold">Theme</h3>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="appearance-theme">Color mode</Label>
            <Select
              value={appearance.theme}
              onValueChange={(value) =>
                handleThemeChange(value as "light" | "dark" | "system")
              }
            >
              <SelectTrigger id="appearance-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
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
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
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

            <div className="space-y-2 sm:col-span-2">
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
                <SelectTrigger id="editor-word-wrap" className="max-w-sm">
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

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="editor-minimap">Minimap</Label>
                <p className="text-xs text-muted-foreground">
                  Show code overview minimap in Editor.
                </p>
              </div>
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

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="editor-insert-spaces">Insert spaces</Label>
                <p className="text-xs text-muted-foreground">
                  Use spaces instead of tab characters.
                </p>
              </div>
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
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Notebook</h3>
          <div className="grid gap-3 max-w-2xl">
            <div className="corner-squircle flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="notebook-scrollbar-visible">
                  Show notebook scrollbar
                </Label>
                <p className="text-xs text-muted-foreground">
                  Shows the scrollbar when scrolling in the notebook editor.
                </p>
              </div>
              <Switch
                id="notebook-scrollbar-visible"
                checked={notebook.scrollbarVisible}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    notebook: {
                      ...current.notebook,
                      scrollbarVisible: checked,
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Layout</h3>
          <div className="grid gap-3 max-w-2xl">
            <div className="corner-squircle flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="layout-left-collapsed">
                Start with left sidebar collapsed
              </Label>
              <Switch
                id="layout-left-collapsed"
                checked={layout.sidebars.leftCollapsed}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    layout: {
                      ...current.layout,
                      sidebars: {
                        ...current.layout.sidebars,
                        leftCollapsed: checked,
                      },
                    },
                  }))
                }
              />
            </div>

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="layout-right-collapsed">
                Start with right sidebar collapsed
              </Label>
              <Switch
                id="layout-right-collapsed"
                checked={layout.sidebars.rightCollapsed}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    layout: {
                      ...current.layout,
                      sidebars: {
                        ...current.layout.sidebars,
                        rightCollapsed: checked,
                      },
                    },
                  }))
                }
              />
            </div>

            <div className="corner-squircle flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="layout-bottom-collapsed">
                Start with bottom panel collapsed
              </Label>
              <Switch
                id="layout-bottom-collapsed"
                checked={layout.sidebars.bottomCollapsed}
                onCheckedChange={(checked) =>
                  void setUserSettings((current) => ({
                    ...current,
                    layout: {
                      ...current.layout,
                      sidebars: {
                        ...current.layout.sidebars,
                        bottomCollapsed: checked,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
