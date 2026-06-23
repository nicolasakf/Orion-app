"use client";

import * as React from "react";
import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  SettingsInfoLabel,
} from "@/components/settings-dialog/settings-info-label";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import {
  getDefaultInteractionModeConfig,
  isBuiltInInteractionModeId,
  normalizeInteractionModeConfigs,
  type InteractionModeBase,
  type InteractionModeBashPolicy,
  type InteractionModeConfig,
} from "@/lib/agent/interaction-modes";
import { ORION_TOOL_NAMES, type OrionToolName } from "@/lib/agent/tool-schemas";

const TOOL_LABELS: Record<OrionToolName, string> = {
  list_kernels: "List kernels",
  shutdown_kernel: "Shutdown kernel",
  use_notebook: "Use notebook",
  read_notebook: "Read notebook",
  restart_notebook: "Restart notebook",
  read_cell: "Read cell",
  insert_cell: "Insert cell",
  delete_cell: "Delete cell",
  overwrite_cell_source: "Overwrite cell",
  edit_orion_metadata: "Edit Orion metadata",
  execute_cell: "Execute cell",
  read_cell_output: "Read cell output",
  execute_code: "Execute code",
  bash: "Bash",
  await_command: "Await command",
  read_file: "Read file",
  edit_file: "Edit file",
  web_fetch: "Web fetch",
  web_search: "Web search",
  delegate: "Delegate",
  load_skill: "Load skill",
  begin_deep_eda: "Begin deep EDA",
  record_visual_inspection: "Record visual inspection",
  update_deep_eda_state: "Update deep EDA state",
  complete_deep_eda: "Complete deep EDA",
};

const TOOL_GROUPS: Array<{ label: string; tools: OrionToolName[] }> = [
  {
    label: "Notebook",
    tools: [
      "use_notebook",
      "read_notebook",
      "read_cell",
      "read_cell_output",
      "insert_cell",
      "delete_cell",
      "overwrite_cell_source",
      "edit_orion_metadata",
      "execute_cell",
      "execute_code",
      "restart_notebook",
    ],
  },
  {
    label: "Files and Terminal",
    tools: ["read_file", "edit_file", "bash", "await_command", "list_kernels", "shutdown_kernel"],
  },
  {
    label: "Web and Extensions",
    tools: ["web_fetch", "web_search", "load_skill", "delegate"],
  },
  {
    label: "Agent loop control",
    tools: [
      "begin_deep_eda",
      "record_visual_inspection",
      "update_deep_eda_state",
      "complete_deep_eda",
    ],
  },
];

function makeCustomModeId(label: string, existingIds: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "custom-mode";
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate) || isBuiltInInteractionModeId(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createCustomMode(
  label: string,
  baseMode: InteractionModeBase,
  existing: InteractionModeConfig[]
): InteractionModeConfig {
  const defaults = getDefaultInteractionModeConfig(baseMode);
  return {
    ...defaults,
    id: makeCustomModeId(label, new Set(existing.map((mode) => mode.id))),
    label,
    description: "",
    builtIn: false,
  };
}

/** Agent subsection for built-in and custom interaction mode behavior. */
export function AgentInteractionModesSection() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const modes = React.useMemo(
    () => normalizeInteractionModeConfigs(effectiveSettings.chat.interactionModes),
    [effectiveSettings.chat.interactionModes]
  );
  const [selectedModeId, setSelectedModeId] = React.useState(modes[0]?.id ?? "Agent");
  const selectedMode = modes.find((mode) => mode.id === selectedModeId) ?? modes[0];

  React.useEffect(() => {
    if (modes.some((mode) => mode.id === selectedModeId)) return;
    setSelectedModeId(modes[0]?.id ?? "Agent");
  }, [modes, selectedModeId]);

  const saveModes = React.useCallback(
    (nextModes: InteractionModeConfig[]) => {
      void setUserSettings((current) => ({
        ...current,
        chat: {
          ...current.chat,
          interactionModes: normalizeInteractionModeConfigs(nextModes),
        },
      })).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to save interaction modes.");
      });
    },
    [setUserSettings]
  );

  const updateSelectedMode = (patch: Partial<InteractionModeConfig>) => {
    if (!selectedMode) return;
    saveModes(
      modes.map((mode) => {
        if (mode.id !== selectedMode.id) return mode;
        if (mode.builtIn) {
          return {
            ...mode,
            toolNames: patch.toolNames ?? mode.toolNames,
            customSystemPrompt: patch.customSystemPrompt ?? mode.customSystemPrompt,
            bashPolicy: patch.bashPolicy ?? mode.bashPolicy,
          };
        }
        return { ...mode, ...patch, builtIn: false };
      })
    );
  };

  const createMode = () => {
    const nextMode = createCustomMode("Custom mode", "Agent", modes);
    saveModes([...modes, nextMode]);
    setSelectedModeId(nextMode.id);
  };

  const duplicateMode = () => {
    if (!selectedMode) return;
    const nextMode = {
      ...selectedMode,
      id: makeCustomModeId(`${selectedMode.label} copy`, new Set(modes.map((mode) => mode.id))),
      label: `${selectedMode.label} copy`,
      builtIn: false,
    };
    saveModes([...modes, nextMode]);
    setSelectedModeId(nextMode.id);
  };

  const deleteMode = () => {
    if (!selectedMode || selectedMode.builtIn) return;
    saveModes(modes.filter((mode) => mode.id !== selectedMode.id));
    setSelectedModeId("Agent");
  };

  const resetBuiltin = () => {
    if (!selectedMode || !selectedMode.builtIn || !isBuiltInInteractionModeId(selectedMode.id)) {
      return;
    }
    const resetMode = getDefaultInteractionModeConfig(selectedMode.id);
    saveModes(modes.map((mode) => (mode.id === selectedMode.id ? resetMode : mode)));
  };

  const toggleTool = (toolName: OrionToolName, enabled: boolean) => {
    if (!selectedMode) return;
    const nextTools = enabled
      ? [...selectedMode.toolNames, toolName]
      : selectedMode.toolNames.filter((name) => name !== toolName);
    updateSelectedMode({
      toolNames: ORION_TOOL_NAMES.filter((name) => nextTools.includes(name)),
    });
  };

  const setAllTools = (enabled: boolean) => {
    updateSelectedMode({ toolNames: enabled ? [...ORION_TOOL_NAMES] : [] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Interaction modes</h2>
        <p className="text-sm text-muted-foreground">
          Customize each mode&apos;s tools and appended system prompt instructions.
        </p>
      </div>

      <Tabs
        value={selectedMode?.id ?? modes[0]?.id ?? "Agent"}
        onValueChange={setSelectedModeId}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 overflow-x-auto">
            <TabsList className="w-max justify-start">
              {modes.map((mode) => (
                <TabsTrigger
                  key={mode.id}
                  value={mode.id}
                  className="gap-1.5"
                >
                  <span>{mode.label}</span>
                  {!mode.builtIn ? (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {mode.baseMode}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            </div>
            <Button type="button" className="h-10 shrink-0 px-3" onClick={createMode}>
              <Plus className="size-4" />
              New
            </Button>
          </div>
          {selectedMode ? (
            <div className="ml-auto flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={duplicateMode}>
                <Copy className="size-4" />
                Duplicate
              </Button>
              {selectedMode.builtIn ? (
                <Button type="button" size="sm" variant="outline" onClick={resetBuiltin}>
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={deleteMode}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {selectedMode ? (
          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mode-label">Label</Label>
                <Input
                  id="mode-label"
                  value={selectedMode.label}
                  disabled={selectedMode.builtIn}
                  onChange={(event) => updateSelectedMode({ label: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode-base">Base prompt</Label>
                <Select
                  value={selectedMode.baseMode}
                  disabled={selectedMode.builtIn}
                  onValueChange={(value) =>
                    updateSelectedMode({ baseMode: value as InteractionModeBase })
                  }
                >
                  <SelectTrigger id="mode-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agent">Agent</SelectItem>
                    <SelectItem value="Ask">Ask</SelectItem>
                    <SelectItem value="Edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mode-description">Description</Label>
                <Input
                  id="mode-description"
                  value={selectedMode.description}
                  disabled={selectedMode.builtIn}
                  onChange={(event) => updateSelectedMode({ description: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode-bash-policy">Bash policy</Label>
                <Select
                  value={selectedMode.bashPolicy}
                  onValueChange={(value) =>
                    updateSelectedMode({ bashPolicy: value as InteractionModeBashPolicy })
                  }
                >
                  <SelectTrigger id="mode-bash-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="read_only">Read-only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Tools</h3>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setAllTools(true)}>
                    Select all
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setAllTools(false)}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {TOOL_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.tools.map((toolName) => (
                        <label
                          key={toolName}
                          className="flex items-center gap-2 text-sm text-foreground"
                        >
                          <Checkbox
                            checked={selectedMode.toolNames.includes(toolName)}
                            onCheckedChange={(checked) => toggleTool(toolName, checked === true)}
                          />
                          <span>{TOOL_LABELS[toolName]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-2">
              <SettingsInfoLabel
                htmlFor="mode-custom-prompt"
                label="Custom system prompt instructions"
                description="Add mode-specific instructions"
              />
              <Textarea
                id="mode-custom-prompt"
                value={selectedMode.customSystemPrompt}
                placeholder="Add mode-specific instructions"
                className="min-h-40 font-mono text-xs"
                onChange={(event) =>
                  updateSelectedMode({ customSystemPrompt: event.target.value })
                }
              />
            </section>
          </div>
        ) : null}
      </Tabs>
    </div>
  );
}
