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
import { Textarea } from "@/components/ui/textarea";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { cn } from "@/lib/utils";
import type { AgentCommunicationStyle } from "@/lib/settings/schema";

const COMMUNICATION_STYLE_OPTIONS: {
  value: AgentCommunicationStyle;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Default",
    description: "Use the model's default communication style.",
  },
  {
    value: "narrative",
    label: "Narrative",
    description:
      "Step-by-step narration before and after each tool call, so you can follow along with every action.",
  },
  {
    value: "friendly",
    label: "Friendly",
    description:
      "Warm, encouraging, and approachable — like a knowledgeable colleague who enjoys helping.",
  },
  {
    value: "pragmatic",
    label: "Pragmatic",
    description:
      "Direct and minimal. Only essential information — no filler, no pleasantries.",
  },
];

/** Appearance tab: theme, editor preferences, and persistent display defaults. */
export function AppearanceTab() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const appearance = effectiveSettings.appearance;
  const chat = effectiveSettings.chat;
  const fileTree = effectiveSettings.fileTree;
  const editor = effectiveSettings.editor;
  const notebook = effectiveSettings.notebook;
  const communicationStyle = chat.communicationStyle;
  const customCommunicationStyle = chat.customCommunicationStyle;
  const hasCustomCommunicationStyle = customCommunicationStyle.trim().length > 0;

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
          Control theme, editor defaults, and display preferences.
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
          <h3 className="text-sm font-bold">Agent</h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Choose how the agent communicates during a session. Applies to all interaction modes.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 max-w-2xl">
            {COMMUNICATION_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  void setUserSettings((current) => ({
                    ...current,
                    chat: {
                      ...current.chat,
                      communicationStyle: option.value,
                    },
                  }))
                }
                className={cn(
                  "corner-squircle flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                  hasCustomCommunicationStyle && "opacity-60",
                  !hasCustomCommunicationStyle && communicationStyle === option.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-2 max-w-2xl">
            <Label htmlFor="agent-custom-communication-style">Custom behavior</Label>
            <p className="text-xs text-muted-foreground">
              Optional instructions for how the agent should communicate. When filled in, these
              replace the preset above.
            </p>
            <Textarea
              id="agent-custom-communication-style"
              value={customCommunicationStyle}
              placeholder="e.g. Be concise and use bullet points. Explain technical terms briefly."
              rows={4}
              onChange={(e) => {
                void setUserSettings((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    customCommunicationStyle: e.target.value,
                  },
                }));
              }}
            />
          </div>
        </section>

      </div>
    </div>
  );
}
