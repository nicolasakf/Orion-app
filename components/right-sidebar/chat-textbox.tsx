"use client";

import * as React from "react";
import { useState } from "react";
import {
  SendHorizontal,
  Square,
  FileText,
  Folder,
  StretchHorizontal,
  Terminal,
  ChevronDown,
  X,
  Settings,
  GripVertical,
  Bot,
  MessageCircle,
  MessagesSquare,
  PenLine,
  Pencil,
  Boxes,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModelSettingsPopover } from "./model-settings-popover";
import type { EditingState, InteractionMode, LLM, ModelSettings, QueuedMessage } from "./types";
import { SLASH_COMMANDS, type SlashCommand } from "./slash-commands";
import { ContextUsagePill } from "./context-usage-pill";
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";
import type { TokenEstimate } from "@/lib/agent/token-budget";
import {
  getReferenceTypeLabel,
  type ChatReferenceOption,
  type ChatReferenceType,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";

export type ReferenceTab = "all" | "files" | "cells" | "variables" | "terminal";

const REFERENCE_TABS: Array<{
  value: ReferenceTab;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = [
    { value: "all", label: "All" },
    { value: "files", label: "Files", icon: Folder },
    { value: "cells", label: "Cells", icon: StretchHorizontal },
    { value: "variables", label: "Variables", icon: Boxes },
    { value: "terminal", label: "Terminal", icon: Terminal },
  ];

const MODES = [
  {
    value: "Agent" as InteractionMode,
    label: "Agent",
    icon: Bot,
    description:
      "Full autonomy. Executes code, edits files, runs terminal commands, and spawns sub-agents.",
  },
  {
    value: "Ask" as InteractionMode,
    label: "Ask",
    icon: MessageCircle,
    description:
      "Read-only access. Reads files and notebooks, and runs read-only terminal commands. Cannot modify anything.",
  },
  {
    value: "Edit" as InteractionMode,
    label: "Edit",
    icon: PenLine,
    description:
      "File and terminal access. Edits files and runs terminal commands freely, but cannot execute notebook cells.",
  },
] as const;

export interface ChatTextboxProps {
  input: string;
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  isLoading: boolean;
  interactionMode: InteractionMode;
  selectedModel: string;
  editingState: EditingState | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onModelChange: (model: string) => void;
  onCancelEdit: () => void;
  models: LLM[];
  /** Opens settings dialog on the models tab. */
  onOpenModelsSettings?: () => void;
  /** Opens settings dialog on the providers tab. */
  onOpenProvidersSettings?: () => void;
  /** Opens the provider credentials flow for models without a configured credential. */
  onConfigureProvider?: () => void;
  /** Model IDs pinned to the top of the selector. Order preserved. */
  pinnedModelIds?: string[];
  /** Called when the user reorders pinned models. */
  onReorderPinned?: (newOrder: string[]) => void;
  /** Provider of the currently selected model */
  selectedModelProvider?: SupportedProvider;
  /** Per-model settings for the currently selected model */
  modelSettings: ModelSettings;
  /** Called when the user changes a model setting */
  onModelSettingsChange: (settings: ModelSettings) => void;
  /** The active slash command detected from input, e.g. "compact". Null when none. */
  activeSlashCommand?: string | null;
  /** Additional slash commands to include in the typeahead (e.g. skill commands). */
  extraSlashCommands?: SlashCommand[];
  /** Opens a Jupyter path for slash entries that expose {@link SlashCommand.definitionPath} (skills/subagents). */
  onOpenSlashDefinition?: (path: string) => void;
  /** Whether the active chat has messages; keeps the context pill hidden for empty chats. */
  hasMessages?: boolean;
  /** Precomputed context usage estimate for the active chat. */
  contextEstimate?: TokenEstimate | null;
  /** Called when the user clicks the context usage pill. */
  onCompact?: () => void;
  /** When true, the send button is disabled and a tooltip is shown. */
  isOverContextBudget?: boolean;
  /** Renders the composer as a disabled read-only display for nested chats. */
  readOnly?: boolean;
  /** Placeholder shown when readOnly is true. */
  readOnlyPlaceholder?: string;
  /** Available @ reference candidates grouped in the mention picker. */
  referenceOptions?: ChatReferenceOption[];
  /** Currently attached references shown as chips. */
  references?: ResolvedChatReference[];
  /** Called when the attached reference chips change. */
  onReferencesChange?: (references: ResolvedChatReference[]) => void;
  /** Called when the @ picker opens, so the parent can refresh live candidates. */
  onReferencePickerOpen?: () => void;
  /** Called as the user searches references, scoped by the selected picker tab. */
  onReferenceSearch?: (query: string, tab: ReferenceTab) => void;
  /** Reference tabs that are visible but unavailable for the current editor context. */
  disabledReferenceTabs?: ReferenceTab[];
  /** Messages queued while the agent is running; shown in a card behind the composer. */
  queuedMessages?: QueuedMessage[];
  /** Removes a queued message before it is sent. */
  onRemoveQueuedMessage?: (id: string) => void;
}

const REFERENCE_TYPE_ICONS: Record<ChatReferenceType, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  folder: Folder,
  cell: StretchHorizontal,
  variable: Boxes,
  terminal: Terminal,
  conversation: MessagesSquare,
};

/** Normalizes mention search text so `@cell#3` can match the `Cell #3` option label. */
function normalizeReferenceSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s#]+/g, "");
}

interface SlashTokenMatch {
  start: number;
  query: string;
  hasTextBeforeToken: boolean;
}

interface SelectedSkillChip {
  name: string;
  label: string;
}

type SlashCommandCategory = NonNullable<SlashCommand["category"]>;

const SLASH_CHIP_CLASS_BY_CATEGORY: Record<SlashCommandCategory, string> = {
  builtin: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  subagent: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  skill: "border-slash-border bg-slash text-slash-foreground",
};

/** Normalizes missing categories to the built-in command group. */
function slashCommandCategory(command: SlashCommand): SlashCommandCategory {
  return command.category ?? "builtin";
}

/** Finds a trailing slash token so commands can be selected after existing message text. */
function findTrailingSlashToken(value: string): SlashTokenMatch | null {
  const match = value.match(/(^|\s)\/([\w-]*)$/);
  if (!match || match.index === undefined) return null;

  const start = match.index + match[1].length;
  return {
    start,
    query: match[2],
    hasTextBeforeToken: value.slice(0, start).trim().length > 0,
  };
}

/** Escapes user-typed slash command search text for safe regex filtering. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pulls selected skill command tokens out of the editable message body. */
function extractSelectedSkillChips(
  value: string,
  skillCommands: SlashCommand[]
): { chips: SelectedSkillChip[]; message: string } {
  if (skillCommands.length === 0 || !value.includes("/")) {
    return { chips: [], message: value };
  }

  const labelToCommand = new Map(skillCommands.map((command) => [command.label, command]));
  const seen = new Set<string>();
  const chips: SelectedSkillChip[] = [];
  const message = value
    .replace(/(^|\s)(\/[\w-]+)(?=\s|$)/g, (match, leading: string, label: string) => {
      const command = labelToCommand.get(label);
      if (!command) return match;
      const name = command.name.slice("skill:".length);
      if (!seen.has(name)) {
        seen.add(name);
        chips.push({ name, label: command.label });
      }
      return leading;
    })
    .replace(/[ \t]{2,}/g, " ");

  return { chips, message };
}

/** Keeps skill-chip tokens in the hidden input while showing only prose in the textarea. */
function composeMessageWithSkillChips(message: string, chips: SelectedSkillChip[]): string {
  if (chips.length === 0) return message;
  const chipText = chips.map((chip) => chip.label).join(" ");
  return message.length > 0 ? `${chipText} ${message}` : `${chipText} `;
}

export function ChatTextbox({
  input,
  handleInputChange,
  handleSubmit,
  onStop,
  isLoading,
  interactionMode,
  selectedModel,
  editingState,
  textareaRef,
  onInteractionModeChange,
  onModelChange,
  onCancelEdit,
  models,
  onOpenModelsSettings,
  onOpenProvidersSettings,
  onConfigureProvider,
  pinnedModelIds = [],
  onReorderPinned,
  selectedModelProvider,
  modelSettings,
  onModelSettingsChange,
  activeSlashCommand,
  extraSlashCommands = [],
  onOpenSlashDefinition,
  hasMessages = false,
  contextEstimate = null,
  onCompact,
  isOverContextBudget = false,
  readOnly = false,
  readOnlyPlaceholder = "Sub-agent chat is read-only",
  referenceOptions = [],
  references = [],
  onReferencesChange,
  onReferencePickerOpen,
  onReferenceSearch,
  disabledReferenceTabs = [],
  queuedMessages = [],
  onRemoveQueuedMessage,
}: ChatTextboxProps) {
  const [isModelComboboxOpen, setIsModelComboboxOpen] = useState(false);
  const [isModePopoverOpen, setIsModePopoverOpen] = useState(false);
  const [highlightedModeIndex, setHighlightedModeIndex] = useState(0);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isCardFocused, setIsCardFocused] = useState(false);
  const { theme } = useTheme();
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = effectiveSettings.chat.fontSize;
  /** Match chat body: shadcn Button/Input/Select set explicit text sizes that override Card inheritance. */
  const chatBoxFont = React.useMemo(
    () => ({ fontSize: chatFontSize }) as const,
    [chatFontSize]
  );

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [highlightedReferenceIndex, setHighlightedReferenceIndex] = useState(0);
  const [activeReferenceTab, setActiveReferenceTab] = useState<ReferenceTab>("all");
  const disabledReferenceTabSet = React.useMemo(
    () => new Set(disabledReferenceTabs),
    [disabledReferenceTabs]
  );

  const getNextEnabledReferenceTab = React.useCallback(
    (current: ReferenceTab, direction: 1 | -1): ReferenceTab => {
      const currentIndex = REFERENCE_TABS.findIndex((tab) => tab.value === current);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;

      for (let offset = 1; offset <= REFERENCE_TABS.length; offset += 1) {
        const nextIndex =
          (startIndex + direction * offset + REFERENCE_TABS.length) % REFERENCE_TABS.length;
        const nextTab = REFERENCE_TABS[nextIndex]?.value ?? "all";
        if (!disabledReferenceTabSet.has(nextTab)) return nextTab;
      }

      return "all";
    },
    [disabledReferenceTabSet]
  );

  /**
   * Slash query: non-null when the user is mid-typing a command (e.g. "/rep").
   * Becomes null once a full command + space is committed or the trailing token is not a slash.
   */
  const slashQuery = React.useMemo(() => {
    return findTrailingSlashToken(input)?.query ?? null;
  }, [input]);

  /** All available slash commands — static built-ins plus any dynamic extras (e.g. skills). */
  const allSlashCommands = React.useMemo(
    () => [...SLASH_COMMANDS, ...extraSlashCommands],
    [extraSlashCommands]
  );
  const skillSlashCommands = React.useMemo(
    () => allSlashCommands.filter((cmd) => cmd.category === "skill"),
    [allSlashCommands]
  );

  /**
   * Active slash token displayed as a chip inside the textbox.
   * Only shown when input starts with a full command label and a valid boundary.
   */
  const slashChip = React.useMemo(() => {
    if (!activeSlashCommand) return null;

    const activeCommand = allSlashCommands.find((cmd) => cmd.name === activeSlashCommand);
    if (!activeCommand) return null;

    const leadingWhitespace = input.match(/^\s*/)?.[0] ?? "";
    const trimmed = input.slice(leadingWhitespace.length);
    if (!trimmed.startsWith(activeCommand.label)) return null;

    const nextChar = trimmed.charAt(activeCommand.label.length);
    if (nextChar && !/\s/.test(nextChar)) return null;

    const message = nextChar ? trimmed.slice(activeCommand.label.length + 1) : "";
    return {
      name: activeCommand.name,
      label: activeCommand.label,
      message,
      leadingWhitespace,
      category: slashCommandCategory(activeCommand),
    };
  }, [activeSlashCommand, allSlashCommands, input]);
  const selectedSubagentName = slashChip?.category === "subagent" ? slashChip.name : null;

  const bodyInputValue = slashChip ? slashChip.message : input;
  const selectedSkillProjection = React.useMemo(
    () => extractSelectedSkillChips(bodyInputValue, skillSlashCommands),
    [bodyInputValue, skillSlashCommands]
  );
  const selectedSkillChips = selectedSkillProjection.chips;
  const textareaValue = selectedSkillProjection.message;

  /** Commands filtered by the current slash query (match on the path after `/`). */
  const slashMatchesByGroup = React.useMemo(() => {
    if (slashQuery === null) {
      return {
        builtin: [] as SlashCommand[],
        subagent: [] as SlashCommand[],
        skill: [] as SlashCommand[],
      };
    }
    const q = slashQuery.toLowerCase();
    const regex = new RegExp(escapeRegExp(q), "i");
    const filtered = allSlashCommands.filter((c) => {
      const key = c.label.replace(/^\//, "");
      return regex.test(key);
    });
    return {
      builtin: filtered.filter((c) => c.category !== "skill" && c.category !== "subagent"),
      subagent: filtered.filter((c) => c.category === "subagent"),
      skill: filtered.filter((c) => c.category === "skill"),
    };
  }, [slashQuery, allSlashCommands]);

  const orderedSlashMatches = React.useMemo(
    () => [
      ...slashMatchesByGroup.builtin,
      ...slashMatchesByGroup.subagent,
      ...slashMatchesByGroup.skill,
    ],
    [slashMatchesByGroup]
  );

  const isTypeaheadOpen = !readOnly && orderedSlashMatches.length > 0;
  const mentionQuery = React.useMemo(() => {
    const match = input.match(/(^|\s)@([\w./#-]*)$/);
    return match ? match[2] : null;
  }, [input]);
  const isMentioning = !readOnly && slashQuery === null && mentionQuery !== null;
  const selectedReferenceIds = React.useMemo(
    () => new Set(references.map((reference) => reference.id)),
    [references]
  );
  const orderedReferenceMatches = React.useMemo(() => {
    if (!isMentioning) return [];

    const query = (mentionQuery ?? "").toLowerCase();
    const normalizedQuery = normalizeReferenceSearchText(query);
    return referenceOptions
      .filter((option) => !selectedReferenceIds.has(option.reference.id))
      .filter((option) => {
        if (activeReferenceTab === "all") return true;
        if (activeReferenceTab === "files") return option.type === "file" || option.type === "folder";
        if (activeReferenceTab === "cells") return option.type === "cell";
        if (activeReferenceTab === "variables") return option.type === "variable";
        return option.type === "terminal";
      })
      .filter((option) => {
        if (!query) return true;
        const normalizedHaystack = normalizeReferenceSearchText(
          `${option.label} ${option.description} ${option.type}`
        );
        return (
          option.label.toLowerCase().includes(query) ||
          option.description.toLowerCase().includes(query) ||
          option.type.toLowerCase().includes(query) ||
          normalizedHaystack.includes(normalizedQuery)
        );
      })
      .slice(0, 80);
  }, [activeReferenceTab, isMentioning, mentionQuery, referenceOptions, selectedReferenceIds]);
  const hasReferenceMatches = orderedReferenceMatches.length > 0;
  const isReferenceTypeaheadOpen = isMentioning;

  /** Refs for slash list rows so keyboard navigation can scroll the popover. */
  const slashMatchItemRefs = React.useRef<Map<number, HTMLElement>>(new Map());
  const referenceMatchItemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map());
  /** Refs for mode rows so keyboard navigation mirrors the slash popover behavior. */
  const modeItemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map());

  // Reset highlighted item when matches change
  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [orderedSlashMatches.length]);

  React.useEffect(() => {
    setHighlightedReferenceIndex(0);
  }, [activeReferenceTab, orderedReferenceMatches.length]);

  React.useEffect(() => {
    if (!disabledReferenceTabSet.has(activeReferenceTab)) return;
    setActiveReferenceTab(getNextEnabledReferenceTab(activeReferenceTab, 1));
  }, [activeReferenceTab, disabledReferenceTabSet, getNextEnabledReferenceTab]);

  React.useEffect(() => {
    if (isMentioning) {
      onReferencePickerOpen?.();
      onReferenceSearch?.(mentionQuery ?? "", activeReferenceTab);
    }
  }, [activeReferenceTab, isMentioning, mentionQuery, onReferencePickerOpen, onReferenceSearch]);

  React.useLayoutEffect(() => {
    if (!isTypeaheadOpen) return;
    const el = slashMatchItemRefs.current.get(highlightedIndex);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlightedIndex, isTypeaheadOpen]);

  React.useLayoutEffect(() => {
    if (!isReferenceTypeaheadOpen || !hasReferenceMatches) return;
    const el = referenceMatchItemRefs.current.get(highlightedReferenceIndex);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [hasReferenceMatches, highlightedReferenceIndex, isReferenceTypeaheadOpen]);

  /** Commit a slash command by replacing the active trailing slash token. */
  const selectSlashCommand = React.useCallback(
    (cmd: SlashCommand) => {
      if (
        cmd.category === "subagent" &&
        selectedSubagentName !== null
      ) {
        return;
      }

      const slashToken = findTrailingSlashToken(input);
      const cmdLabel = cmd.label;
      let newValue = cmdLabel + " ";

      if (slashToken) {
        const beforeToken = input.slice(0, slashToken.start);
        const hasTextAfterLeadingCommand =
          slashToken.hasTextBeforeToken && activeSlashCommand != null;

        if (cmd.category === "skill" || hasTextAfterLeadingCommand) {
          newValue = `${beforeToken}${cmdLabel} `;
        } else if (slashToken.hasTextBeforeToken) {
          const messageBeforeToken = beforeToken.trimStart();
          newValue = `${cmdLabel} ${messageBeforeToken}`;
        }
      }

      // Synthesize a change event so useChat's handleInputChange updates internal state
      const nativeSet = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (textareaRef.current && nativeSet) {
        nativeSet.call(textareaRef.current, newValue);
        textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      // Also fire the React handler so the controlled value stays in sync
      const syntheticEvent = {
        target: { value: newValue },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
      textareaRef.current?.focus();
    },
    [activeSlashCommand, handleInputChange, input, selectedSubagentName, textareaRef]
  );

  /** Auto-resize textarea to fit content while keeping a max height. */
  const resizeTextarea = React.useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
  }, [textareaRef]);

  /** Defer focus until after popovers unmount so focus is not overridden. */
  const focusTextareaAfterPopoverSelect = React.useCallback(() => {
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [textareaRef]);

  const selectedModeIndex = React.useMemo(() => {
    const index = MODES.findIndex((mode) => mode.value === interactionMode);
    return index >= 0 ? index : 0;
  }, [interactionMode]);

  /** Selects an interaction mode and returns keyboard focus to the composer. */
  const selectInteractionMode = React.useCallback(
    (mode: InteractionMode) => {
      onInteractionModeChange(mode);
      setIsModePopoverOpen(false);
      focusTextareaAfterPopoverSelect();
    },
    [focusTextareaAfterPopoverSelect, onInteractionModeChange]
  );

  /**
   * Writes a new full input value through the controlled input handler.
   * Used when the visual textbox value differs from the underlying slash-prefixed value.
   */
  const updateInputValue = React.useCallback(
    (newValue: string) => {
      const syntheticEvent = {
        target: { value: newValue },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    },
    [handleInputChange]
  );

  const updateComposerText = React.useCallback(
    (message: string, chips: SelectedSkillChip[] = selectedSkillChips) => {
      const nextBody = composeMessageWithSkillChips(message, chips);
      if (slashChip) {
        updateInputValue(`${slashChip.leadingWhitespace}${slashChip.label} ${nextBody}`);
      } else {
        updateInputValue(nextBody);
      }
    },
    [selectedSkillChips, slashChip, updateInputValue]
  );

  const removeSelectedSkillChip = React.useCallback(
    (chipName: string) => {
      const nextChips = selectedSkillChips.filter((chip) => chip.name !== chipName);
      updateComposerText(textareaValue, nextChips);
      textareaRef.current?.focus();
    },
    [selectedSkillChips, textareaRef, textareaValue, updateComposerText]
  );

  const selectReference = React.useCallback(
    (option: ChatReferenceOption) => {
      onReferencesChange?.([...references, option.reference]);
      const nextInput = input.replace(/(^|\s)@([\w./#-]*)$/, "$1");
      updateInputValue(nextInput);
      textareaRef.current?.focus();
    },
    [input, onReferencesChange, references, textareaRef, updateInputValue]
  );

  const cycleReferenceTab = React.useCallback((direction: 1 | -1) => {
    setActiveReferenceTab((current) => getNextEnabledReferenceTab(current, direction));
  }, [getNextEnabledReferenceTab]);

  const removeReference = React.useCallback(
    (referenceId: string) => {
      onReferencesChange?.(references.filter((reference) => reference.id !== referenceId));
      textareaRef.current?.focus();
    },
    [onReferencesChange, references, textareaRef]
  );

  /**
   * Clears the in-progress `/command` token so the slash typeahead closes.
   * Radix Popover listens for Escape on document (capture); this must run from PopoverContent’s
   * `onEscapeKeyDown` so dismiss happens before global key handlers blur the textarea.
   */
  const dismissSlashTypeahead = React.useCallback(() => {
    const slashToken = findTrailingSlashToken(input);
    if (!slashToken) return;
    updateInputValue(input.slice(0, slashToken.start));
    textareaRef.current?.focus();
  }, [input, updateInputValue, textareaRef]);

  React.useEffect(() => {
    resizeTextarea();
  }, [textareaValue, resizeTextarea]);

  /** Derive placeholder text based on active slash command. */
  const placeholder = editingState
    ? "Edit your message..."
    : readOnly
      ? readOnlyPlaceholder
      : isLoading
        ? "Queue a message · Enter to add"
        : "Type a message · / for commands · @ for mentions";

  React.useEffect(() => {
    if (!isModelComboboxOpen) {
      setModelSearchQuery("");
      setDragOverIndex(null);
    }
  }, [isModelComboboxOpen]);

  React.useEffect(() => {
    if (isModePopoverOpen) {
      setHighlightedModeIndex(selectedModeIndex);
    }
  }, [isModePopoverOpen, selectedModeIndex]);

  React.useLayoutEffect(() => {
    if (!isModePopoverOpen) return;
    const el = modeItemRefs.current.get(highlightedModeIndex);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlightedModeIndex, isModePopoverOpen]);

  const getModel = (modelName: string) => {
    return models.find((model) => model.value === modelName);
  };

  /** Pinned models first (in pin order), then unpinned. */
  const { pinnedModels, unpinnedModels } = React.useMemo(() => {
    const pinned: LLM[] = [];
    const unpinned: LLM[] = [];
    const pinnedSet = new Set(pinnedModelIds);
    for (const m of pinnedModelIds) {
      const model = models.find((x) => x.value === m);
      if (model) pinned.push(model);
    }
    for (const m of models) {
      if (!pinnedSet.has(m.value)) unpinned.push(m);
    }
    return { pinnedModels: pinned, unpinnedModels: unpinned };
  }, [models, pinnedModelIds]);

  /** Keep unpinned models discoverable; pinning should order favorites, not hide the rest. */
  const listMaxHeight =
    modelSearchQuery.trim().length > 0
      ? 300
      : pinnedModels.length > 0 || unpinnedModels.length > 0
        ? 300
        : 120;

  const handlePinnedDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handlePinnedDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handlePinnedDragLeave = () => {
    setDragOverIndex(null);
  };

  const handlePinnedDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(dragIndex) || dragIndex === dropIndex || !onReorderPinned) return;
    const newOrder = [...pinnedModelIds];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    onReorderPinned(newOrder);
  };


  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    handleSubmit(e);
  };

  /** Handles composer-level shortcuts and keyboard navigation for focusless popovers. */
  const onFormKeyDownCapture = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (readOnly) return;

    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === "/") {
      e.preventDefault();
      e.stopPropagation();
      setIsModePopoverOpen(false);
      setIsModelComboboxOpen(true);
      return;
    }

    if (mod && e.key === ".") {
      e.preventDefault();
      e.stopPropagation();
      setIsModelComboboxOpen(false);
      setIsModePopoverOpen(true);
      return;
    }

    if (!isModePopoverOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedModeIndex((index) => Math.min(index + 1, MODES.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedModeIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      selectInteractionMode(MODES[highlightedModeIndex]?.value ?? MODES[0].value);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsModePopoverOpen(false);
      focusTextareaAfterPopoverSelect();
    }
  };

  return (
    <div className="px-1.5 mb-2">
      {queuedMessages.length > 0 && (
        <div className="relative z-0 mx-3 mb-[-10px]">
          <Card className="border-border/50 bg-muted/50 px-2.5 pb-3 pt-2 shadow-none">
            <div className="flex flex-col gap-1.5">
              {queuedMessages.map((queued, index) => (
                <div
                  key={queued.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-1 py-0.5",
                    index > 0 && "border-t border-border/40 pt-1.5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-inherit text-xs text-muted-foreground">
                      {queued.text}
                    </p>
                    {queued.references.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {queued.references.length} reference
                        {queued.references.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  {onRemoveQueuedMessage && (
                    <button
                      type="button"
                      aria-label="Remove queued message"
                      onClick={() => onRemoveQueuedMessage(queued.id)}
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      <Card
        className={cn(
          "relative z-10 p-1 flex flex-col gap-2 text-inherit",
          queuedMessages.length > 0 && "shadow-md"
        )}
        style={
          isCardFocused
            ? {
              ...chatBoxFont,
              boxShadow:
                theme === "dark"
                  ? "0 0 8px rgba(0, 0, 0, 1)"
                  : "0 0 8px rgba(0, 0, 0, 0.3)",
            }
            : chatBoxFont
        }
        onFocus={() => setIsCardFocused(true)}
        onBlur={() => setIsCardFocused(false)}
      >
        {editingState && (
          <div className="corner-squircle px-2 py-1 bg-muted rounded-md text-inherit text-muted-foreground">
            Editing message - Esc to cancel
          </div>
        )}
        <form
          onSubmit={onFormSubmit}
          onKeyDownCapture={onFormKeyDownCapture}
        >
          <Popover open={isTypeaheadOpen || isReferenceTypeaheadOpen}>
            <PopoverAnchor asChild>
              <div className="w-full flex flex-col">
                {(slashChip || selectedSkillChips.length > 0) && (
                  <div className="flex items-center gap-1 px-3 pt-2 pb-0">
                    {slashChip && (
                      <span
                        className={cn(
                          "corner-squircle inline-flex h-5 shrink-0 max-w-[55%] items-center gap-1 rounded-md border px-1.5 text-inherit font-medium leading-none",
                          SLASH_CHIP_CLASS_BY_CATEGORY[slashChip.category]
                        )}
                      >
                        <span className="truncate">{slashChip.label}</span>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateInputValue(slashChip.message);
                            textareaRef.current?.focus();
                          }}
                          className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                          aria-label="Remove slash command"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    )}
                    {selectedSkillChips.map((chip) => (
                      <span
                        key={chip.name}
                        className={cn(
                          "corner-squircle inline-flex h-5 shrink-0 max-w-[55%] items-center gap-1 rounded-md border px-1.5 text-inherit font-medium leading-none",
                          SLASH_CHIP_CLASS_BY_CATEGORY.skill
                        )}
                      >
                        <span className="truncate">{chip.label}</span>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            removeSelectedSkillChip(chip.name);
                          }}
                          className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                          aria-label={`Remove ${chip.label}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {references.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-0">
                    {references.map((reference) => {
                      const Icon = REFERENCE_TYPE_ICONS[reference.type];
                      return (
                        <span
                          key={reference.id}
                          className="corner-squircle inline-flex h-5 max-w-[70%] items-center gap-1 rounded-md border border-border/60 bg-muted px-1.5 text-inherit font-medium leading-none text-muted-foreground"
                          title={`${getReferenceTypeLabel(reference.type)}: ${reference.label}`}
                        >
                          <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
                          <span className="truncate">{reference.label}</span>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              removeReference(reference.id);
                            }}
                            className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                            aria-label={`Remove ${reference.label}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="w-full flex items-start gap-1.5 px-3 py-2">
                  <Textarea
                    ref={textareaRef}
                    value={textareaValue}
                    style={chatBoxFont}
                    onChange={(e) => {
                      updateComposerText(e.target.value);
                      resizeTextarea();
                    }}
                    placeholder={placeholder}
                    className="orion-chat-composer-mobile w-full min-h-0 !rounded-none bg-transparent border-none px-0 py-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-inherit md:text-inherit placeholder:text-muted-foreground/50 resize-none [corner-shape:inherit]"
                    onKeyDown={(e) => {
                      if (isTypeaheadOpen) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          e.stopPropagation();
                          setHighlightedIndex((i) =>
                            Math.min(i + 1, orderedSlashMatches.length - 1)
                          );
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          e.stopPropagation();
                          setHighlightedIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          const command = orderedSlashMatches[highlightedIndex];
                          if (command) selectSlashCommand(command);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissSlashTypeahead();
                          return;
                        }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          e.stopPropagation();
                          const command = orderedSlashMatches[highlightedIndex];
                          if (command) selectSlashCommand(command);
                          return;
                        }
                      }

                      if (isReferenceTypeaheadOpen) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!hasReferenceMatches) return;
                          setHighlightedReferenceIndex((i) =>
                            Math.min(i + 1, orderedReferenceMatches.length - 1)
                          );
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!hasReferenceMatches) return;
                          setHighlightedReferenceIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!hasReferenceMatches) return;
                          const option = orderedReferenceMatches[highlightedReferenceIndex];
                          if (option) selectReference(option);
                          return;
                        }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          e.stopPropagation();
                          cycleReferenceTab(e.shiftKey ? -1 : 1);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          updateInputValue(input.replace(/(^|\s)@([\w./#-]*)$/, "$1"));
                          return;
                        }
                      }

                      if (selectedSkillChips.length > 0 && e.key === "Backspace") {
                        const target = e.target as HTMLTextAreaElement;
                        const isEmptyComposer =
                          textareaValue.length === 0 &&
                          target.selectionStart === 0 &&
                          target.selectionEnd === 0;
                        if (isEmptyComposer) {
                          e.preventDefault();
                          e.stopPropagation();
                          const lastChip = selectedSkillChips[selectedSkillChips.length - 1];
                          if (lastChip) removeSelectedSkillChip(lastChip.name);
                          return;
                        }
                      }

                      if (slashChip && e.key === "Backspace") {
                        const target = e.target as HTMLTextAreaElement;
                        const isCursorAtStart =
                          target.selectionStart === 0 && target.selectionEnd === 0;
                        if (isCursorAtStart) {
                          e.preventDefault();
                          e.stopPropagation();
                          updateInputValue(`${slashChip.leadingWhitespace}${slashChip.message}`);
                          return;
                        }
                      }

                      if (!slashChip && e.key === "Backspace" && references.length > 0) {
                        const target = e.target as HTMLTextAreaElement;
                        const isEmptyComposer =
                          textareaValue.length === 0 &&
                          target.selectionStart === 0 &&
                          target.selectionEnd === 0;
                        if (isEmptyComposer) {
                          e.preventDefault();
                          e.stopPropagation();
                          onReferencesChange?.(references.slice(0, -1));
                          textareaRef.current?.focus();
                          return;
                        }
                      }

                      if (e.key === "Escape" && editingState) {
                        e.stopPropagation();
                        onCancelEdit();
                      } else if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={6}
              className="relative overflow-visible w-auto min-w-[140px] max-w-[250px] p-1 border-border/50 shadow-sm"
              style={chatBoxFont}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isReferenceTypeaheadOpen) {
                  updateInputValue(input.replace(/(^|\s)@([\w./#-]*)$/, "$1"));
                } else {
                  dismissSlashTypeahead();
                }
              }}
            >
              {/* Description popup shown to the left for the highlighted item */}
              {isReferenceTypeaheadOpen && hasReferenceMatches
                ? (() => {
                  const highlighted = orderedReferenceMatches[highlightedReferenceIndex];
                  if (!highlighted?.description) return null;
                  return (
                    <div className="corner-squircle absolute right-full top-0 mr-2 w-56 rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-sm">
                      <p className="text-inherit font-medium text-foreground leading-snug mb-0.5">{highlighted.label}</p>
                      <p className="text-inherit text-muted-foreground leading-snug">{highlighted.description}</p>
                    </div>
                  );
                })()
                : (() => {
                  const highlighted = orderedSlashMatches[highlightedIndex];
                  if (!highlighted?.description) return null;
                  return (
                    <div className="corner-squircle absolute right-full top-0 mr-2 w-52 rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-sm">
                      <p className="text-inherit font-medium text-foreground leading-snug mb-0.5">{highlighted.label}</p>
                      <p className="text-inherit text-muted-foreground leading-snug">{highlighted.description}</p>
                    </div>
                  );
                })()}
              <div className="flex h-[20vh] min-h-0 flex-col gap-0">
                {isReferenceTypeaheadOpen ? (
                  <>
                    <TooltipProvider delayDuration={250}>
                      <div className="mb-1 flex shrink-0 items-center gap-1 overflow-x-auto px-1 py-1">
                        {REFERENCE_TABS.map((tab) => {
                          const Icon = tab.icon;
                          const selected = activeReferenceTab === tab.value;
                          const isDisabled = disabledReferenceTabSet.has(tab.value);
                          const button = (
                            <button
                              type="button"
                              aria-label={tab.label}
                              aria-disabled={isDisabled}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (isDisabled) return;
                                setActiveReferenceTab(tab.value);
                              }}
                              className={cn(
                                "corner-squircle inline-flex h-6 shrink-0 items-center justify-center rounded-md text-inherit font-medium transition-colors",
                                Icon && !selected
                                  ? "w-6"
                                  : Icon
                                    ? "gap-1 px-2"
                                    : "px-2",
                                isDisabled
                                  ? "cursor-not-allowed text-muted-foreground/30"
                                  : selected
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted/60"
                              )}
                            >
                              {Icon ? (
                                <>
                                  <Icon className="h-3.5 w-3.5 shrink-0" />
                                  {selected ? (
                                    <span className="max-w-[7rem] truncate text-xs">
                                      {tab.label}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                tab.label
                              )}
                            </button>
                          );

                          if (!Icon) {
                            return <React.Fragment key={tab.value}>{button}</React.Fragment>;
                          }

                          return (
                            <Tooltip key={tab.value}>
                              <TooltipTrigger asChild>{button}</TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{isDisabled ? `${tab.label} unavailable` : tab.label}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                    <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      {hasReferenceMatches ? orderedReferenceMatches.map((option, i) => {
                        const Icon = REFERENCE_TYPE_ICONS[option.type];
                        return (
                          <button
                            key={option.id}
                            type="button"
                            ref={(el) => {
                              if (el) referenceMatchItemRefs.current.set(i, el);
                              else referenceMatchItemRefs.current.delete(i);
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectReference(option);
                            }}
                            onMouseEnter={() => setHighlightedReferenceIndex(i)}
                            className={cn(
                              "corner-squircle flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-inherit transition-colors",
                              i === highlightedReferenceIndex
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            <Icon className="h-3 w-3 shrink-0 opacity-60" />
                            <span className="font-medium truncate">{option.label}</span>
                          </button>
                        );
                      }) : (
                        <div className="px-2 py-1.5 text-inherit text-muted-foreground">
                          No references found
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {orderedSlashMatches.map((cmd, i) => {
                      const prev = i > 0 ? orderedSlashMatches[i - 1] : undefined;
                      const group: "builtin" | "subagent" | "skill" =
                        cmd.category === "skill"
                          ? "skill"
                          : cmd.category === "subagent"
                            ? "subagent"
                            : "builtin";
                      const prevGroup: "builtin" | "subagent" | "skill" =
                        prev?.category === "skill"
                          ? "skill"
                          : prev?.category === "subagent"
                            ? "subagent"
                            : "builtin";
                      const showGroupLabel = i === 0 || prevGroup !== group;
                      const Icon = cmd.icon;
                      const definitionPath =
                        cmd.definitionPath && cmd.definitionPath.length > 0
                          ? cmd.definitionPath
                          : undefined;
                      const showDefinitionEdit =
                        Boolean(definitionPath) && typeof onOpenSlashDefinition === "function";
                      const isDisabledSubagent =
                        group === "subagent" && selectedSubagentName !== null;
                      const commandButton = (
                        <button
                          type="button"
                          aria-disabled={isDisabledSubagent}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (isDisabledSubagent) return;
                            selectSlashCommand(cmd);
                          }}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-inherit",
                            showDefinitionEdit && !isDisabledSubagent && "pr-7",
                            isDisabledSubagent && "cursor-not-allowed"
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0 opacity-60" />
                          <span className="font-medium truncate">{cmd.label}</span>
                        </button>
                      );
                      return (
                        <React.Fragment key={cmd.name}>
                          {showGroupLabel && (
                            <div
                              className={cn(
                                "px-1.5 pb-0.5 text-inherit font-medium tracking-wide text-muted-foreground/60",
                                i === 0 ? "pt-1" : "pt-1.5"
                              )}
                              role="presentation"
                            >
                              {group === "builtin"
                                ? "Commands"
                                : group === "subagent"
                                  ? "Subagents"
                                  : "Skills"}
                            </div>
                          )}
                          <div
                            ref={(el) => {
                              if (el) slashMatchItemRefs.current.set(i, el);
                              else slashMatchItemRefs.current.delete(i);
                            }}
                            role="presentation"
                            onMouseEnter={() => setHighlightedIndex(i)}
                            className={cn(
                              "group corner-squircle relative flex w-full min-w-0 items-stretch rounded-md transition-colors",
                              isDisabledSubagent
                                ? "cursor-not-allowed text-muted-foreground/35"
                                : i === highlightedIndex
                                  ? "bg-muted text-foreground"
                                  : "text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            {isDisabledSubagent ? (
                              <TooltipProvider delayDuration={250}>
                                <Tooltip>
                                  <TooltipTrigger asChild>{commandButton}</TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p>Only one subagent at a time</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              commandButton
                            )}
                            {showDefinitionEdit && definitionPath && !isDisabledSubagent ? (
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  dismissSlashTypeahead();
                                  onOpenSlashDefinition(definitionPath);
                                }}
                                className={cn(
                                  "corner-squircle absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-inherit transition-opacity duration-150",
                                  i === highlightedIndex
                                    ? "pointer-events-auto opacity-70 hover:opacity-100"
                                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-70 group-hover:hover:opacity-100",
                                )}
                                aria-label="Open definition in editor"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Bottom section with controls */}
          <div className="flex items-center justify-between p-1">
            {/* Bottom left - Mode and Model selectors */}
            <div className="flex items-center gap-1">
              {/* Interaction Mode selector */}
              <Popover open={isModePopoverOpen} onOpenChange={setIsModePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    disabled={readOnly}
                    className="h-7 px-2 text-inherit bg-muted hover:bg-accent gap-1 [&_svg]:!size-3"
                    style={chatBoxFont}
                  >
                    {(() => {
                      const m = MODES.find((m) => m.value === interactionMode) ?? MODES[0];
                      const Icon = m.icon;
                      return (
                        <>
                          <Icon className="shrink-0 opacity-70" />
                          <span>{m.label}</span>
                        </>
                      );
                    })()}
                    <ChevronDown className="opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="relative overflow-visible w-auto min-w-[110px] p-1 border-border/50 shadow-sm"
                  style={chatBoxFont}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    focusTextareaAfterPopoverSelect();
                  }}
                  onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    setIsModePopoverOpen(false);
                    focusTextareaAfterPopoverSelect();
                  }}
                >
                  {/* Hovercard shown to the right for the highlighted mode */}
                  {(() => {
                    const m = MODES[highlightedModeIndex];
                    if (!m) return null;
                    return (
                      <div className="corner-squircle absolute right-full top-0 mr-2 w-56 rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-sm pointer-events-none">
                        <p className="text-inherit font-medium text-foreground leading-snug mb-0.5">{m.label}</p>
                        <p className="text-inherit text-muted-foreground leading-snug">{m.description}</p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-1">
                    {MODES.map((m, i) => {
                      const Icon = m.icon;
                      const isSelected = interactionMode === m.value;
                      const isHighlighted = i === highlightedModeIndex;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          ref={(el) => {
                            if (el) modeItemRefs.current.set(i, el);
                            else modeItemRefs.current.delete(i);
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectInteractionMode(m.value);
                          }}
                          onMouseEnter={() => setHighlightedModeIndex(i)}
                          className={cn(
                            "corner-squircle flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-inherit transition-colors [&_svg]:!size-3",
                            isHighlighted
                              ? "bg-muted text-foreground"
                              : isSelected
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          <Icon className="shrink-0 opacity-60" />
                          <span className="font-medium">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Model Combobox */}
              <Popover
                open={isModelComboboxOpen}
                onOpenChange={setIsModelComboboxOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    role="combobox"
                    disabled={readOnly}
                    className="w-auto h-7 text-inherit justify-center p-1 text-muted-foreground gap-1 hover:bg-transparent [&_svg]:!size-3"
                    style={chatBoxFont}
                  >
                    {getModel(selectedModel)?.label || "Select Model"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-48 p-0 text-inherit"
                  align="start"
                  style={chatBoxFont}
                  onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    setIsModelComboboxOpen(false);
                    focusTextareaAfterPopoverSelect();
                  }}
                >
                  <Command>
                    <div className="flex items-center gap-0">
                      <div className="flex-1 min-w-0">
                        <CommandInput
                          placeholder="Search models..."
                          className="orion-chat-composer-mobile h-8 !text-inherit"
                          style={chatBoxFont}
                          onInput={(e) =>
                            setModelSearchQuery((e.target as HTMLInputElement).value)
                          }
                        />
                      </div>
                      {onOpenModelsSettings && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 hover:bg-transparent text-muted-foreground hover:text-foreground text-inherit [&_svg]:!size-3"
                          style={chatBoxFont}
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenModelsSettings();
                            setIsModelComboboxOpen(false);
                          }}
                          aria-label="Open model settings"
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <CommandEmpty className="!text-inherit py-6 text-center">
                      No model found.
                    </CommandEmpty>
                    <CommandList
                      className="scrollbar-hide overflow-y-auto overflow-x-hidden"
                      style={{ maxHeight: listMaxHeight }}
                    >
                      {pinnedModels.length > 0 && (
                        <CommandGroup
                          heading="Pinned"
                          className="[&_[cmdk-group-heading]]:!text-inherit [&_[cmdk-group-heading]]:opacity-60"
                        >
                          {pinnedModels.map((model, index) => {
                            const ProviderIcon = model.icon;
                            const isDragOver = dragOverIndex === index;
                            const isLocked = model.isAccessible === false;
                            return (
                              <CommandItem
                                key={model.value}
                                value={`${model.label} ${model.value}`}
                                onSelect={() => {
                                  if (isLocked) {
                                    onOpenProvidersSettings?.();
                                    return;
                                  }
                                  onModelChange(model.value);
                                  setIsModelComboboxOpen(false);
                                  focusTextareaAfterPopoverSelect();
                                }}
                                className={cn(
                                  "!text-inherit",
                                  isLocked && "opacity-50 cursor-not-allowed"
                                )}
                                onDragOver={
                                  onReorderPinned && !isLocked
                                    ? (e: React.DragEvent) => handlePinnedDragOver(e, index)
                                    : undefined
                                }
                                onDragLeave={
                                  onReorderPinned && !isLocked ? handlePinnedDragLeave : undefined
                                }
                                onDrop={
                                  onReorderPinned && !isLocked
                                    ? (e: React.DragEvent) => handlePinnedDrop(e, index)
                                    : undefined
                                }
                                style={
                                  isDragOver
                                    ? { ...chatBoxFont, backgroundColor: "hsl(var(--accent))" }
                                    : chatBoxFont
                                }
                              >
                                {onReorderPinned && !isLocked && (
                                  <div
                                    draggable
                                    onDragStart={(e) => handlePinnedDragStart(e, index)}
                                    className="cursor-grab touch-none opacity-50 hover:opacity-70 -ml-0.5 mr-1"
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    aria-hidden
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </div>
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {ProviderIcon && (
                                    <ProviderIcon className="h-3.5 w-3.5 shrink-0 opacity-40" />
                                  )}
                                  <span className="truncate flex-1">{model.label}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                      {pinnedModels.length > 0 && unpinnedModels.length > 0 && (
                        <CommandSeparator />
                      )}
                      <CommandGroup>
                        {unpinnedModels.map((model) => {
                          const ProviderIcon = model.icon;
                          const isLocked = model.isAccessible === false;
                          return (
                            <CommandItem
                              key={model.value}
                              value={`${model.label} ${model.value}`}
                              onSelect={() => {
                                if (isLocked) {
                                  onConfigureProvider?.();
                                  return;
                                }
                                onModelChange(model.value);
                                setIsModelComboboxOpen(false);
                                focusTextareaAfterPopoverSelect();
                              }}
                              className={cn(
                                "!text-inherit",
                                isLocked && "opacity-50 cursor-not-allowed"
                              )}
                              style={chatBoxFont}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                {ProviderIcon && (
                                  <ProviderIcon className="h-3.5 w-3.5 opacity-40" />
                                )}
                                <span className="flex-1">{model.label}</span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Model-specific settings cog (only for providers with configurable settings) */}
              {!readOnly && selectedModelProvider && (selectedModelProvider === "openai" || selectedModelProvider === "anthropic") && (
                <ModelSettingsPopover
                  provider={selectedModelProvider}
                  settings={modelSettings}
                  onSettingsChange={onModelSettingsChange}
                />
              )}
            </div>

            {/* Bottom right - context usage + send */}
            <div className="flex items-center gap-2">
              <ContextUsagePill
                estimate={contextEstimate}
                hasMessages={!readOnly && hasMessages}
                onCompact={onCompact}
              />
              {!readOnly && isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  className="h-7 w-7"
                  style={chatBoxFont}
                  onClick={onStop}
                  aria-label="Stop generation"
                >
                  <Square className="h-3 w-3 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={readOnly || !input.trim() || isOverContextBudget}
                  size="icon"
                  className="h-7 w-7"
                  style={chatBoxFont}
                  title={
                    isOverContextBudget
                      ? "Compaction required before sending"
                      : isLoading
                        ? "Add to queue"
                        : undefined
                  }
                  aria-label={isLoading ? "Queue message" : "Send message"}
                >
                  <SendHorizontal className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
