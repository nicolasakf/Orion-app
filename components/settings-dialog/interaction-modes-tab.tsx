"use client";

import * as React from "react";
import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { SettingsInfoLabel } from "@/components/settings-dialog/settings-info-label";
import {
  SettingsColorField,
  SettingsColorListField,
  SettingsNumberField,
  SettingsSwitchField,
} from "@/components/settings-dialog/settings-form-fields";
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
  inspect_output: "Inspect output",
  execute_code: "Execute code",
  bash: "Bash",
  await_command: "Await command",
  kill_command: "Kill command",
  read_file: "Read file",
  edit_file: "Edit file",
  update_memory: "Update memory",
  reload_page: "Reload page",
  web_fetch: "Web fetch",
  web_search: "Web search",
  delegate: "Delegate",
  load_skill: "Load skill",
  connections: "Connections",
  ask_question: "Ask question",
};

const TOOL_GROUPS: Array<{ label: string; tools: OrionToolName[] }> = [
  {
    label: "Notebook",
    tools: [
      "use_notebook",
      "read_notebook",
      "read_cell",
      "read_cell_output",
      "inspect_output",
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
    tools: [
      "read_file",
      "edit_file",
      "bash",
      "await_command",
      "kill_command",
      "list_kernels",
      "shutdown_kernel",
    ],
  },
  {
    label: "App",
    tools: ["reload_page", "update_memory", "ask_question"],
  },
  {
    label: "Web and Extensions",
    tools: ["web_fetch", "web_search", "load_skill", "delegate", "connections"],
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
  existing: InteractionModeConfig[],
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
    () =>
      normalizeInteractionModeConfigs(effectiveSettings.chat.interactionModes),
    [effectiveSettings.chat.interactionModes],
  );
  const [selectedModeId, setSelectedModeId] = React.useState(
    modes[0]?.id ?? "Agent",
  );
  const selectedMode =
    modes.find((mode) => mode.id === selectedModeId) ?? modes[0];

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
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save interaction modes.",
        );
      });
    },
    [setUserSettings],
  );

  const updateGoalMaxReviews = React.useCallback(
    (maxReviews: number) => {
      void setUserSettings((current) => ({
        ...current,
        agent: {
          ...current.agent,
          goals: {
            ...current.agent.goals,
            maxReviews,
          },
        },
      })).catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save goal settings.",
        );
      });
    },
    [setUserSettings],
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
            customSystemPrompt:
              patch.customSystemPrompt ?? mode.customSystemPrompt,
            bashPolicy: patch.bashPolicy ?? mode.bashPolicy,
            hiddenInSelector: patch.hiddenInSelector ?? mode.hiddenInSelector,
            selectorColor:
              patch.selectorColor !== undefined
                ? patch.selectorColor
                : mode.selectorColor,
          };
        }
        return { ...mode, ...patch, builtIn: false };
      }),
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
      id: makeCustomModeId(
        `${selectedMode.label} copy`,
        new Set(modes.map((mode) => mode.id)),
      ),
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
    if (
      !selectedMode ||
      !selectedMode.builtIn ||
      !isBuiltInInteractionModeId(selectedMode.id)
    ) {
      return;
    }
    const resetMode = getDefaultInteractionModeConfig(selectedMode.id);
    saveModes(
      modes.map((mode) => (mode.id === selectedMode.id ? resetMode : mode)),
    );
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
          Choose which modes appear in chat and customize standard mode
          behavior.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex w-full items-end gap-3">
          <div className="w-fit space-y-2">
            <Label htmlFor="interaction-mode-select">Mode</Label>
            <Select
              value={selectedMode?.id ?? modes[0]?.id ?? "Agent"}
              onValueChange={setSelectedModeId}
            >
              <SelectTrigger id="interaction-mode-select" className="w-fit">
                <SelectValue placeholder="Select a mode" />
              </SelectTrigger>
              <SelectContent className="w-max">
                {modes.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    <span className="flex items-center gap-1.5">
                      <span>{mode.label}</span>
                      {mode.beta ? (
                        <Badge
                          variant="secondary"
                          className="px-1 py-0 text-[10px] font-normal"
                        >
                          Beta
                        </Badge>
                      ) : null}
                      {!mode.builtIn ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {mode.baseMode}
                        </span>
                      ) : null}
                      {mode.hiddenInSelector ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          Hidden
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="h-10 shrink-0 px-3"
            onClick={createMode}
          >
            <Plus className="size-4" />
            New
          </Button>
          {selectedMode ? (
            <div className="ml-auto flex shrink-0 gap-2">
              {selectedMode.orchestration === "normal" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={duplicateMode}
                >
                  <Copy className="size-4" />
                  Duplicate
                </Button>
              ) : null}
              {selectedMode.builtIn ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetBuiltin}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={deleteMode}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {selectedMode ? (
          <div className="min-h-0 space-y-5 overflow-auto pr-1">
            {selectedMode.beta ? (
              <p className="text-sm text-muted-foreground">
                This mode is in beta and still being tested. Enable it in the
                chat selector when you want to try it.
              </p>
            ) : null}

            <SettingsSwitchField
              id="mode-show-in-selector"
              label="Show in mode selector"
              description="When off, this mode stays available here in settings but is hidden from the chat interaction mode menu."
              checked={!selectedMode.hiddenInSelector}
              onCheckedChange={(checked) =>
                updateSelectedMode({ hiddenInSelector: !checked })
              }
            />

            <SettingsColorField
              id="mode-selector-color"
              label="Selector color"
              description="Tint shown on this mode's icon and button in the chat mode menu. Modes based on Agent can use Default for Orion's standard styling."
              value={selectedMode.selectorColor}
              allowDefault={
                selectedMode.orchestration !== "goal" &&
                selectedMode.baseMode === "Agent"
              }
              onChange={(selectorColor) => updateSelectedMode({ selectorColor })}
            />

            {selectedMode.orchestration === "goal" ? (
              <section className="space-y-3 rounded-lg border border-border/60 p-4">
                <SettingsInfoLabel
                  label="Goal orchestration"
                  description="Goal uses Agent for workspace changes, with separate contract-author and supervisor phases that have fixed permissions."
                />
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Worker mode</dt>
                    <dd className="font-medium">Agent</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Completion</dt>
                    <dd className="font-medium">
                      Independent supervisor review
                    </dd>
                  </div>
                </dl>
                <SettingsNumberField
                  id="goal-max-reviews"
                  label="Maximum reviews"
                  description="Maximum number of independent artifact reviews Orion may run for one goal before stopping."
                  value={effectiveSettings.agent.goals.maxReviews}
                  min={1}
                  max={50}
                  onChange={updateGoalMaxReviews}
                />
              </section>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mode-label">Label</Label>
                    <Input
                      id="mode-label"
                      value={selectedMode.label}
                      disabled={selectedMode.builtIn}
                      onChange={(event) =>
                        updateSelectedMode({ label: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mode-base">Base prompt</Label>
                    <Select
                      value={selectedMode.baseMode}
                      disabled={selectedMode.builtIn}
                      onValueChange={(value) =>
                        updateSelectedMode({
                          baseMode: value as InteractionModeBase,
                        })
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
                      onChange={(event) =>
                        updateSelectedMode({ description: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mode-bash-policy">Bash policy</Label>
                    <Select
                      value={selectedMode.bashPolicy}
                      onValueChange={(value) =>
                        updateSelectedMode({
                          bashPolicy: value as InteractionModeBashPolicy,
                        })
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAllTools(true)}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAllTools(false)}
                      >
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
                                checked={selectedMode.toolNames.includes(
                                  toolName,
                                )}
                                onCheckedChange={(checked) =>
                                  toggleTool(toolName, checked === true)
                                }
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
                      updateSelectedMode({
                        customSystemPrompt: event.target.value,
                      })
                    }
                  />
                </section>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
