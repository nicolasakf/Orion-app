"use client";

import * as React from "react";
import { useState } from "react";
import {
  SendHorizontal,
  Square,
  Plus,
  FileText,
  Folder,
  StretchHorizontal,
  Terminal,
  ChevronDown,
  X,
  GripVertical,
  Bot,
  Search,
  MessageCircle,
  PenLine,
  Pencil,
  Boxes,
  Image,
  Brain,
  CircleCheck,
  CircleX,
  Code2,
  Database,
  DollarSign,
  Hash,
  KeyRound,
  Lock,
  Maximize2,
  Wrench,
  Zap,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { AgentRule } from "@/lib/agent/rules";
import { cn } from "@/lib/utils";
import {
  findModelBySelectionKey,
  formatModelSelectionKey,
} from "@/lib/agent/model-selection-key";
import { PINNED_MODELS_CHANGED_EVENT } from "@/lib/chat/model-selector-events";
import {
  SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
  type ScrollToNotebookCellEventDetail,
} from "@/lib/notebook/notebook-execution-events";

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
import { ProviderLogo } from "@/components/provider-logo";
import { getAdjacentIntelligenceSettings } from "./model-intelligence";
import { ModelSettingsPopover } from "./model-settings-popover";
import type {
  ChatDraftAttachment,
  EditingState,
  InteractionMode,
  LLM,
  ModelSettings,
  QueuedMessage,
} from "./types";
import type {
  InteractionModeBase,
  InteractionModeConfig,
} from "@/lib/agent/interaction-modes";
import { isImmediateSlashCommand, SLASH_COMMANDS, type SlashCommand } from "./slash-commands";
import { ContextUsagePill } from "./context-usage-pill";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { TokenEstimate } from "@/lib/agent/token-budget";
import {
  getReferenceTypeLabel,
  type ChatReferenceOption,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import { CHAT_REFERENCE_TYPE_ICONS } from "@/lib/chat/chat-reference-icons";
import {
  formatClipboardPayloadComposerText,
  parseUserMessageClipboardHtml,
} from "@/lib/chat/chat-message-copy";

export type ReferenceTab = "all" | "files" | "cells" | "variables" | "terminal";
type AttachableFiles = FileList | readonly File[];

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

const MODE_ICONS: Record<
  InteractionModeBase,
  React.ComponentType<{ className?: string }>
> = {
  Research: Search,
  Agent: Bot,
  Ask: MessageCircle,
  Edit: PenLine,
};

const DESCRIPTION_PREVIEW_VIEWPORT_GUTTER_PX = 12;

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
  interactionModes: InteractionModeConfig[];
  selectedModel: string;
  editingState: EditingState | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onModelChange: (model: string) => void;
  onCancelEdit: () => void;
  models: LLM[];
  /** Opens settings on the models tab so the user can pin models for the selector. */
  onOpenModelsSettings?: () => void;
  /** Opens settings on the interaction modes tab. */
  onOpenInteractionModesSettings?: () => void;
  /** Opens settings dialog on the providers tab. */
  onOpenProvidersSettings?: () => void;
  /** Opens the provider credentials flow for models without a configured credential. */
  onConfigureProvider?: () => void;
  /** Model IDs pinned to the top of the selector. Order preserved. */
  pinnedModelIds?: string[];
  /** Called when the user reorders pinned models. */
  onReorderPinned?: (newOrder: string[]) => void;
  /** Provider of the currently selected model */
  selectedModelProvider?: ProviderId;
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
  /** Runs slash commands configured with {@link SlashCommand.submissionMode} `immediate`. */
  onImmediateSlashCommand?: (command: SlashCommand) => void;
  /** Re-scans workspace skills and subagents while the slash-command palette is open. */
  onRefreshSlashCommands?: () => Promise<void>;
  /** Whether the active chat has messages; keeps the context pill hidden for empty chats. */
  hasMessages?: boolean;
  /** Precomputed context usage estimate for the active chat. */
  contextEstimate?: TokenEstimate | null;
  /** Shows only the context total, without technical categories. */
  simpleContextUsage?: boolean;
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
  /** Session-only files selected in the composer. */
  attachments?: ChatDraftAttachment[];
  /** Called when composer attachment chips change. */
  onAttachmentsChange?: (attachments: ChatDraftAttachment[]) => void;
  /** Called when the user adds external files from the composer. */
  onAttachFiles?: (files: AttachableFiles) => void;
  /** Prevents submission and additional file selection while managed uploads are running. */
  isAttachmentUploadActive?: boolean;
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
  /** AGENTS.md / CLAUDE.md rules currently applied to chat requests. */
  activeRules?: AgentRule[];
  /** Opens a loaded rule file in the editor. */
  onOpenRule?: (rule: AgentRule) => void;
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Returns a compact display label for a loaded rule file. */
function formatRuleLabel(rule: AgentRule): string {
  return rule.scope === "workspace" ? rule.filename : `${rule.filename} (${rule.scope})`;
}

/** Formats token limits for tight selector metadata rows. */
function formatTokenLimit(value: number | undefined): string {
  if (value === undefined) return "Unknown";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return value.toLocaleString();
}

/** Formats per-million token prices without expanding the model card. */
function formatTokenPrice(value: number | undefined): string {
  if (value === undefined) return "Unknown";
  if (value === 0) return "Free";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}/1M`;
}

/** Converts a catalog timestamp into a compact month/year label. */
function formatCatalogDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Normalizes catalog source labels for the selector detail card. */
function formatCatalogSource(value: LLM["catalogSource"]): string {
  if (!value) return "Unknown";
  if (value === "models_dev") return "models.dev";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface ModelInfoMetricProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}

/** Compact icon/value metric used inside the model selector detail card. */
function ModelInfoMetric({ icon: Icon, label, value, muted = false }: ModelInfoMetricProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className={cn("h-3 w-3 shrink-0", muted ? "opacity-35" : "opacity-60")} />
      <div className="min-w-0">
        <div className="text-[10px] leading-none text-muted-foreground/70">{label}</div>
        <div className={cn("truncate text-[11px] font-medium leading-snug", muted && "text-muted-foreground")}>
          {value}
        </div>
      </div>
    </div>
  );
}

interface ModelCapabilityPillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  enabled: boolean | undefined;
}

/** Tiny status pill for model inputs and capabilities. */
function ModelCapabilityPill({ icon: Icon, label, enabled }: ModelCapabilityPillProps) {
  const isEnabled = enabled === true;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        isEnabled
          ? "border-border/70 bg-muted/60 text-foreground"
          : "border-border/40 bg-transparent text-muted-foreground/55"
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

interface ModelDetailCardProps {
  model: LLM;
}

/** Left-side metadata card for the highlighted model selector row. */
function ModelDetailCard({ model }: ModelDetailCardProps) {
  const hasLongContextPricing =
    model.longContextThreshold !== undefined ||
    model.longContextInputPrice !== undefined ||
    model.longContextOutputPrice !== undefined;
  const apiModelId = model.apiModelId && model.apiModelId !== model.value ? model.apiModelId : model.value;

  return (
    <div className="corner-squircle pointer-events-none absolute right-full top-0 mr-2 w-64 rounded-md border border-border/50 bg-popover px-2.5 py-2 text-inherit shadow-sm">
      <div className="mb-2 flex min-w-0 items-start gap-2">
        <ProviderLogo
          providerId={model.provider}
          className="mt-0.5 h-4 w-4 shrink-0 text-current opacity-70"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-inherit font-medium leading-snug text-foreground">{model.label}</p>
          <p className="truncate text-[10px] leading-snug text-muted-foreground">
            {model.provider} · {formatCatalogSource(model.catalogSource)}
          </p>
        </div>
        {model.isAccessible === false ? (
          <Lock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        <ModelCapabilityPill icon={FileText} label="Text" enabled />
        <ModelCapabilityPill icon={Image} label="Images" enabled={model.supportsImageInput} />
        <ModelCapabilityPill icon={Wrench} label="Tools" enabled={model.supportsToolCalling} />
        <ModelCapabilityPill icon={Brain} label="Reasoning" enabled={model.supportsReasoning} />
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <ModelInfoMetric icon={Database} label="Context" value={formatTokenLimit(model.contextWindow)} />
        <ModelInfoMetric icon={Maximize2} label="Max output" value={formatTokenLimit(model.maxOutputTokens)} />
        <ModelInfoMetric icon={DollarSign} label="Input" value={formatTokenPrice(model.inputPrice)} />
        <ModelInfoMetric icon={DollarSign} label="Output" value={formatTokenPrice(model.outputPrice)} />
        <ModelInfoMetric icon={Zap} label="Cached" value={formatTokenPrice(model.cachedPrice)} />
        <ModelInfoMetric
          icon={KeyRound}
          label="Force tools"
          value={model.supportsForcedToolChoice ? "Yes" : "No"}
          muted={!model.supportsForcedToolChoice}
        />
      </div>

      {hasLongContextPricing ? (
        <div className="mt-2 rounded border border-border/40 bg-muted/30 p-1.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium leading-none text-muted-foreground">
            <Code2 className="h-2.5 w-2.5" />
            Long context
          </div>
          <div className="grid grid-cols-3 gap-1 text-[10px] leading-tight">
            <div>
              <div className="text-muted-foreground/70">From</div>
              <div className="truncate font-medium">{formatTokenLimit(model.longContextThreshold)}</div>
            </div>
            <div>
              <div className="text-muted-foreground/70">In</div>
              <div className="truncate font-medium">{formatTokenPrice(model.longContextInputPrice)}</div>
            </div>
            <div>
              <div className="text-muted-foreground/70">Out</div>
              <div className="truncate font-medium">{formatTokenPrice(model.longContextOutputPrice)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-2 grid gap-1 text-[10px] leading-snug text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1">
          <Hash className="h-2.5 w-2.5 shrink-0 opacity-60" />
          <span className="truncate">{apiModelId}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {model.clientAvailable === false ? (
            <CircleX className="h-2.5 w-2.5 shrink-0 opacity-60" />
          ) : (
            <CircleCheck className="h-2.5 w-2.5 shrink-0 opacity-60" />
          )}
          <span className="truncate">
            {model.clientAvailable === false ? "Hidden from client catalog" : "Client available"}
            {model.pinnedByDefault ? " · Default pin" : ""}
            {" · "}
            {formatCatalogDate(model.catalogCreatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Returns true when a drag payload contains operating-system files. */
function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

/** Extracts image files from a clipboard paste without disturbing plain text paste. */
function getClipboardImageFiles(dataTransfer: DataTransfer): File[] {
  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (itemFiles.length > 0) return itemFiles;

  return Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** Merges pasted references with existing chips while preserving order. */
function mergeReferences(
  current: readonly ResolvedChatReference[],
  pasted: readonly ResolvedChatReference[]
): ResolvedChatReference[] {
  const seen = new Set(current.map((reference) => reference.id));
  const merged = [...current];
  for (const reference of pasted) {
    if (seen.has(reference.id)) continue;
    seen.add(reference.id);
    merged.push(reference);
  }
  return merged;
}

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
  definitionPath?: string;
}

interface ComposerSlashChipProps {
  label: string;
  category: SlashCommandCategory;
  definitionPath?: string;
  onOpenDefinition?: (path: string) => void;
  onRemove: () => void;
  removeAriaLabel: string;
}

/** Skill, subagent, or builtin slash token shown above the composer textarea. */
function ComposerSlashChip({
  label,
  category,
  definitionPath,
  onOpenDefinition,
  onRemove,
  removeAriaLabel,
}: ComposerSlashChipProps) {
  const canOpen =
    Boolean(definitionPath) && typeof onOpenDefinition === "function";

  return (
    <span
      className={cn(
        "corner-squircle inline-flex h-5 shrink-0 max-w-[55%] items-center gap-1 rounded-md border px-1.5 text-inherit font-medium leading-none",
        SLASH_CHIP_CLASS_BY_CATEGORY[category],
        canOpen && "cursor-pointer"
      )}
    >
      {canOpen && definitionPath ? (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onOpenDefinition(definitionPath);
          }}
          className="min-w-0 truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          aria-label={`Open ${label} definition`}
        >
          {label}
        </button>
      ) : (
        <span className="truncate">{label}</span>
      )}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onRemove();
        }}
        className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
        aria-label={removeAriaLabel}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
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

/** Calculates how much vertical space a description preview can use before reaching the viewport edge. */
function getDescriptionPreviewMaxHeight({
  viewportHeight,
  cardTop,
  cardHeight,
  descriptionHeight,
}: {
  viewportHeight: number;
  cardTop: number;
  cardHeight: number;
  descriptionHeight: number;
}): number {
  const cardChromeHeight = Math.max(0, cardHeight - descriptionHeight);
  return Math.max(
    0,
    viewportHeight - cardTop - DESCRIPTION_PREVIEW_VIEWPORT_GUTTER_PX - cardChromeHeight
  );
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
        chips.push({
          name,
          label: command.label,
          ...(command.definitionPath ? { definitionPath: command.definitionPath } : {}),
        });
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
  interactionModes,
  selectedModel,
  editingState,
  textareaRef,
  onInteractionModeChange,
  onModelChange,
  onCancelEdit,
  models,
  onOpenModelsSettings,
  onOpenInteractionModesSettings,
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
  onImmediateSlashCommand,
  onRefreshSlashCommands,
  hasMessages = false,
  contextEstimate = null,
  simpleContextUsage = false,
  onCompact,
  isOverContextBudget = false,
  readOnly = false,
  readOnlyPlaceholder = "Sub-agent chat is read-only",
  referenceOptions = [],
  references = [],
  onReferencesChange,
  attachments = [],
  onAttachmentsChange,
  onAttachFiles,
  isAttachmentUploadActive = false,
  onReferencePickerOpen,
  onReferenceSearch,
  disabledReferenceTabs = [],
  queuedMessages = [],
  onRemoveQueuedMessage,
  activeRules = [],
  onOpenRule,
}: ChatTextboxProps) {
  const [isModelComboboxOpen, setIsModelComboboxOpen] = useState(false);
  const [isModePopoverOpen, setIsModePopoverOpen] = useState(false);
  const [highlightedModeIndex, setHighlightedModeIndex] = useState(0);
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [isCardFocused, setIsCardFocused] = useState(false);
  const [isRefreshingSlashCommands, setIsRefreshingSlashCommands] = useState(false);
  const [slashDescriptionMaxHeight, setSlashDescriptionMaxHeight] = useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fileDragDepthRef = React.useRef(0);
  const slashDescriptionCardRef = React.useRef<HTMLDivElement>(null);
  const slashDescriptionRef = React.useRef<HTMLParagraphElement>(null);
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
      ...(activeCommand.definitionPath
        ? { definitionPath: activeCommand.definitionPath }
        : {}),
    };
  }, [activeSlashCommand, allSlashCommands, input]);
  const selectedSubagentName = slashChip?.category === "subagent" ? slashChip.name : null;
  const activeSlashCommandDef = React.useMemo(
    () =>
      slashChip
        ? allSlashCommands.find((command) => command.name === slashChip.name) ?? null
        : null,
    [allSlashCommands, slashChip]
  );
  const isImmediateSlashChipActive =
    activeSlashCommandDef != null && isImmediateSlashCommand(activeSlashCommandDef);

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
  const hasDraftContent =
    input.trim().length > 0 || references.length > 0 || attachments.length > 0;

  /** Refs for slash list rows so keyboard navigation can scroll the popover. */
  const slashMatchItemRefs = React.useRef<Map<number, HTMLElement>>(new Map());
  const referenceMatchItemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map());
  /** Refs for mode rows so keyboard navigation mirrors the slash popover behavior. */
  const modeItemRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

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

  /** Let the description preview fill the remaining viewport height before it begins scrolling. */
  React.useLayoutEffect(() => {
    if (!isTypeaheadOpen) {
      setSlashDescriptionMaxHeight(null);
      return;
    }

    const updateDescriptionMaxHeight = () => {
      const card = slashDescriptionCardRef.current;
      const description = slashDescriptionRef.current;
      if (!card || !description) return;

      const maxHeight = getDescriptionPreviewMaxHeight({
        viewportHeight: window.innerHeight,
        cardTop: card.getBoundingClientRect().top,
        cardHeight: card.offsetHeight,
        descriptionHeight: description.offsetHeight,
      });
      setSlashDescriptionMaxHeight((current) =>
        current !== null && Math.abs(current - maxHeight) < 1 ? current : maxHeight
      );
    };

    const frame = window.requestAnimationFrame(updateDescriptionMaxHeight);
    window.addEventListener("resize", updateDescriptionMaxHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateDescriptionMaxHeight);
    };
  }, [highlightedIndex, isTypeaheadOpen, orderedSlashMatches]);

  /** Refresh the dynamic slash-command sources without moving focus out of the composer. */
  const handleRefreshSlashCommands = React.useCallback(async (): Promise<void> => {
    if (!onRefreshSlashCommands || isRefreshingSlashCommands) return;

    setIsRefreshingSlashCommands(true);
    try {
      await onRefreshSlashCommands();
    } finally {
      setIsRefreshingSlashCommands(false);
      textareaRef.current?.focus();
    }
  }, [isRefreshingSlashCommands, onRefreshSlashCommands, textareaRef]);

  /** Commit a slash command by replacing the active trailing slash token. */
  const selectSlashCommand = React.useCallback(
    (cmd: SlashCommand) => {
      if (
        cmd.category === "subagent" &&
        selectedSubagentName !== null
      ) {
        return;
      }

      if (isImmediateSlashCommand(cmd)) {
        const slashToken = findTrailingSlashToken(input);
        const clearedValue = slashToken
          ? input.slice(0, slashToken.start).trimEnd()
          : (() => {
            const leadingWhitespace = input.match(/^\s*/)?.[0] ?? "";
            const trimmed = input.slice(leadingWhitespace.length);
            if (!trimmed.startsWith(cmd.label)) return input;
            const trailingMessage = trimmed.slice(cmd.label.length).trimStart();
            return trailingMessage.length > 0
              ? `${leadingWhitespace}${trailingMessage}`
              : leadingWhitespace;
          })();
        if (clearedValue !== input) {
          const syntheticEvent = {
            target: { value: clearedValue },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          handleInputChange(syntheticEvent);
        }
        onImmediateSlashCommand?.(cmd);
        textareaRef.current?.focus();
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
    [
      activeSlashCommand,
      handleInputChange,
      input,
      onImmediateSlashCommand,
      selectedSubagentName,
      textareaRef,
    ]
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

  const selectorInteractionModes = React.useMemo(
    () => interactionModes.filter((mode) => !mode.hiddenInSelector),
    [interactionModes]
  );

  const selectedModeIndex = React.useMemo(() => {
    const index = selectorInteractionModes.findIndex((mode) => mode.id === interactionMode);
    return index >= 0 ? index : 0;
  }, [interactionMode, selectorInteractionModes]);

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

  /** Reveals the cell or output targeted by a notebook reference chip. */
  const navigateToNotebookReference = React.useCallback(
    (reference: ResolvedChatReference) => {
      const { locator } = reference;
      const detail: ScrollToNotebookCellEventDetail | null =
        locator.type === "output"
          ? {
              cellIndex: locator.cellIndex,
              outputIndex: locator.outputIndex,
            }
          : locator.type === "cell"
            ? { cellIndex: locator.cellIndices[0] ?? -1 }
            : null;

      if (!detail || detail.cellIndex < 0) return;
      window.dispatchEvent(
        new CustomEvent<ScrollToNotebookCellEventDetail>(
          SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
          { detail },
        ),
      );
    },
    [],
  );

  const removeAttachment = React.useCallback(
    (attachmentId: string) => {
      onAttachmentsChange?.(attachments.filter((attachment) => attachment.id !== attachmentId));
      textareaRef.current?.focus();
    },
    [attachments, onAttachmentsChange, textareaRef]
  );

  const openFilePicker = React.useCallback(() => {
    if (readOnly || isAttachmentUploadActive) return;
    fileInputRef.current?.click();
  }, [isAttachmentUploadActive, readOnly]);

  /** Handles Orion message payloads and pasted screenshots/images. */
  const handleTextareaPaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (readOnly) return;

      const clipboardHtml =
        typeof e.clipboardData.getData === "function"
          ? e.clipboardData.getData("text/html")
          : "";
      const copiedMessage = parseUserMessageClipboardHtml(clipboardHtml);
      if (copiedMessage) {
        e.preventDefault();

        const pastedReferences = copiedMessage.metadata?.references ?? [];
        if (pastedReferences.length > 0) {
          onReferencesChange?.(mergeReferences(references, pastedReferences));
        }

        const pastedText = formatClipboardPayloadComposerText(copiedMessage);
        if (pastedText.length > 0) {
          const target = e.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const nextValue =
            textareaValue.slice(0, start) + pastedText + textareaValue.slice(end);
          updateComposerText(nextValue);
          window.setTimeout(resizeTextarea, 0);
        }
        return;
      }

      if (!onAttachFiles || isAttachmentUploadActive) return;

      const imageFiles = getClipboardImageFiles(e.clipboardData);
      if (imageFiles.length === 0) return;

      e.preventDefault();
      onAttachFiles(imageFiles);
    },
    [
      onAttachFiles,
      onReferencesChange,
      isAttachmentUploadActive,
      readOnly,
      references,
      resizeTextarea,
      textareaValue,
      updateComposerText,
    ]
  );

  /** Shows the drop affordance only for real external file drags. */
  const handleFileDragEnter = React.useCallback(
    (e: React.DragEvent) => {
      if (readOnly || !onAttachFiles || !hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isAttachmentUploadActive) return;
      fileDragDepthRef.current += 1;
      setIsFileDragActive(true);
    },
    [isAttachmentUploadActive, onAttachFiles, readOnly]
  );

  /** Keeps the browser from opening dropped files while the composer is the target. */
  const handleFileDragOver = React.useCallback(
    (e: React.DragEvent) => {
      if (readOnly || !onAttachFiles || !hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isAttachmentUploadActive) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
      e.dataTransfer.dropEffect = "copy";
      setIsFileDragActive(true);
    },
    [isAttachmentUploadActive, onAttachFiles, readOnly]
  );

  /** Clears drop state once the external file drag leaves the composer. */
  const handleFileDragLeave = React.useCallback(
    (e: React.DragEvent) => {
      if (readOnly || !onAttachFiles || !hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isAttachmentUploadActive) {
        fileDragDepthRef.current = 0;
        setIsFileDragActive(false);
        return;
      }
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
      if (fileDragDepthRef.current === 0) {
        setIsFileDragActive(false);
      }
    },
    [isAttachmentUploadActive, onAttachFiles, readOnly]
  );

  /** Adds dropped files through the same attachment pipeline as the file picker. */
  const handleFileDrop = React.useCallback(
    (e: React.DragEvent) => {
      if (readOnly || !onAttachFiles || !hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      fileDragDepthRef.current = 0;
      setIsFileDragActive(false);
      if (isAttachmentUploadActive) return;

      if (e.dataTransfer.files.length > 0) {
        onAttachFiles(e.dataTransfer.files);
      }
    },
    [isAttachmentUploadActive, onAttachFiles, readOnly]
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
      : isImmediateSlashChipActive && slashChip
        ? `Press Enter to run ${slashChip.label}`
        : isLoading
          ? "Queue a message"
          : "Type a message · / for commands · @ for mentions";

  React.useEffect(() => {
    if (!isModelComboboxOpen) {
      setModelSearchQuery("");
      setDragOverIndex(null);
      setHighlightedModelIndex(0);
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

  const getModel = (modelKey: string) => findModelBySelectionKey(models, modelKey);
  const selectedLlm = getModel(selectedModel);

  /** Pinned models in user pin order (selector shows only these). */
  const pinnedModels = React.useMemo(() => {
    const pinned: LLM[] = [];
    for (const pinKey of pinnedModelIds) {
      const model = findModelBySelectionKey(models, pinKey);
      if (model) pinned.push(model);
    }
    return pinned;
  }, [models, pinnedModelIds]);

  /** Bumps when pins change so cmdk remounts and drops stale filter/list state. */
  const pinnedModelsListKey = React.useMemo(
    () => pinnedModelIds.join("\0"),
    [pinnedModelIds]
  );

  React.useEffect(() => {
    setModelSearchQuery("");
    setDragOverIndex(null);
    setHighlightedModelIndex(0);
  }, [pinnedModelsListKey]);

  React.useEffect(() => {
    const refreshPinnedModelsList = () => {
      setModelSearchQuery("");
      setDragOverIndex(null);
      setHighlightedModelIndex(0);
    };

    window.addEventListener(PINNED_MODELS_CHANGED_EVENT, refreshPinnedModelsList);
    return () => {
      window.removeEventListener(PINNED_MODELS_CHANGED_EVENT, refreshPinnedModelsList);
    };
  }, []);

  const visiblePinnedModels = React.useMemo(() => {
    const query = modelSearchQuery.trim().toLowerCase();
    if (query.length === 0) return pinnedModels;

    return pinnedModels.filter((model) =>
      [
        model.label,
        model.value,
        model.apiModelId,
        model.provider,
        formatCatalogSource(model.catalogSource),
      ]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [modelSearchQuery, pinnedModels]);

  /** Applies empty-textbox arrow shortcuts without interfering with text editing or pickers. */
  const handleEmptyComposerArrowKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const isTextboxEmpty =
        !editingState &&
        textareaValue.length === 0 &&
        !slashChip &&
        selectedSkillChips.length === 0 &&
        attachments.length === 0 &&
        references.length === 0;
      const hasModifier =
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

      if (
        !isTextboxEmpty ||
        hasModifier ||
        isModelComboboxOpen ||
        isModePopoverOpen ||
        isTypeaheadOpen ||
        isReferenceTypeaheadOpen
      ) {
        return false;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const selectableModels = pinnedModels.filter(
          (model) => model.isAccessible !== false
        );
        const selectedIndex = selectableModels.findIndex(
          (model) =>
            model.provider === selectedLlm?.provider &&
            model.value === selectedLlm?.value
        );
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextModel = selectableModels[selectedIndex + direction];
        if (!nextModel) return false;

        event.preventDefault();
        event.stopPropagation();
        onModelChange(formatModelSelectionKey(nextModel.provider, nextModel.value));
        return true;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const provider = selectedModelProvider ?? selectedLlm?.provider;
        if (!provider) return false;

        const nextSettings = getAdjacentIntelligenceSettings(
          provider,
          selectedLlm,
          modelSettings,
          event.key === "ArrowRight" ? 1 : -1
        );
        if (!nextSettings) return false;

        event.preventDefault();
        event.stopPropagation();
        onModelSettingsChange(nextSettings);
        return true;
      }

      return false;
    },
    [
      attachments.length,
      editingState,
      isModePopoverOpen,
      isModelComboboxOpen,
      isReferenceTypeaheadOpen,
      isTypeaheadOpen,
      modelSettings,
      onModelChange,
      onModelSettingsChange,
      pinnedModels,
      references.length,
      selectedLlm,
      selectedModelProvider,
      selectedSkillChips.length,
      slashChip,
      textareaValue.length,
    ]
  );

  const highlightedModel = visiblePinnedModels[highlightedModelIndex] ?? null;

  React.useEffect(() => {
    if (!isModelComboboxOpen) return;

    const selectedIndex = visiblePinnedModels.findIndex(
      (model) => formatModelSelectionKey(model.provider, model.value) === selectedModel
    );
    setHighlightedModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isModelComboboxOpen, selectedModel, visiblePinnedModels]);

  const listMaxHeight =
    modelSearchQuery.trim().length > 0 || pinnedModels.length > 0 ? 300 : 120;

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
    if (readOnly || isAttachmentUploadActive) return;
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
      setHighlightedModeIndex((index) =>
        Math.min(index + 1, Math.max(selectorInteractionModes.length - 1, 0))
      );
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
      selectInteractionMode(
        selectorInteractionModes[highlightedModeIndex]?.id ??
          selectorInteractionModes[0]?.id ??
          "Agent"
      );
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
    <div className="mx-auto mb-2 w-full max-w-2xl px-1.5">
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
                      {queued.text || "Attached external file(s)."}
                    </p>
                    {queued.references.length + queued.attachments.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {queued.references.length + queued.attachments.length} attachment
                        {queued.references.length + queued.attachments.length === 1 ? "" : "s"}
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
      {activeRules.length > 0 && (
        <div className="flex min-h-4 flex-wrap items-center gap-1 px-1.5 pb-1 text-[11px] leading-none text-muted-foreground/60">
          <span>Rules:</span>
          {activeRules.map((rule, index) => (
            <React.Fragment key={`${rule.scope}:${rule.path}`}>
              {index > 0 && <span aria-hidden="true">,</span>}
              <button
                type="button"
                className="max-w-[12rem] truncate rounded-sm text-left underline-offset-2 transition-colors hover:text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title={`Open ${rule.scope} rule: ${rule.path}`}
                onClick={() => onOpenRule?.(rule)}
              >
                {formatRuleLabel(rule)}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
      <Card
        className={cn(
          "relative z-10 p-1 flex flex-col gap-2 text-inherit transition-colors",
          isFileDragActive && "border-primary/70 bg-primary/5",
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
        onDragEnter={handleFileDragEnter}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {isFileDragActive && (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-md border border-dashed border-primary/70 bg-background/80 text-inherit font-medium text-primary shadow-sm backdrop-blur-sm">
            Drop files to attach
          </div>
        )}
        {editingState && (
          <div className="corner-squircle px-2 py-1 bg-muted rounded-md text-inherit text-muted-foreground">
            Editing message - Esc to cancel
          </div>
        )}
        <form
          onSubmit={onFormSubmit}
          onKeyDownCapture={onFormKeyDownCapture}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={isAttachmentUploadActive}
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) {
                onAttachFiles?.(files);
              }
              event.target.value = "";
            }}
          />
          <Popover open={isTypeaheadOpen || isReferenceTypeaheadOpen}>
            <PopoverAnchor asChild>
              <div className="w-full flex flex-col">
                {(slashChip || selectedSkillChips.length > 0) && (
                  <div className="flex items-center gap-1 px-3 pt-2 pb-0">
                    {slashChip && (
                      <ComposerSlashChip
                        label={slashChip.label}
                        category={slashChip.category}
                        definitionPath={slashChip.definitionPath}
                        onOpenDefinition={onOpenSlashDefinition}
                        onRemove={() => {
                          updateInputValue(slashChip.message);
                          textareaRef.current?.focus();
                        }}
                        removeAriaLabel="Remove slash command"
                      />
                    )}
                    {selectedSkillChips.map((chip) => (
                      <ComposerSlashChip
                        key={chip.name}
                        label={chip.label}
                        category="skill"
                        definitionPath={chip.definitionPath}
                        onOpenDefinition={onOpenSlashDefinition}
                        onRemove={() => removeSelectedSkillChip(chip.name)}
                        removeAriaLabel={`Remove ${chip.label}`}
                      />
                    ))}
                  </div>
                )}
                {references.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-0">
                    {references.map((reference) => {
                      const Icon = CHAT_REFERENCE_TYPE_ICONS[reference.type];
                      const isNotebookReference =
                        reference.locator.type === "cell" ||
                        reference.locator.type === "output";
                      return (
                        <span
                          key={reference.id}
                          className="corner-squircle inline-flex h-5 max-w-[70%] items-center gap-1 rounded-md border border-border/60 bg-muted px-1.5 text-inherit font-medium leading-none text-muted-foreground"
                          title={`${getReferenceTypeLabel(reference.type)}: ${reference.label}`}
                        >
                          {isNotebookReference ? (
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-1 text-left hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              onClick={() => navigateToNotebookReference(reference)}
                              aria-label={`Go to ${reference.label}`}
                            >
                              <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
                              <span className="truncate">{reference.label}</span>
                            </button>
                          ) : (
                            <>
                              <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
                              <span className="truncate">{reference.label}</span>
                            </>
                          )}
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
                {attachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-0">
                    {attachments.map((attachment) => {
                      const Icon = attachment.mediaType.startsWith("image/") ? Image : FileText;
                      return (
                        <span
                          key={attachment.id}
                          className="corner-squircle inline-flex h-5 max-w-[70%] items-center gap-1 rounded-md border border-border/60 bg-muted px-1.5 text-inherit font-medium leading-none text-muted-foreground"
                          title={`${attachment.fileName} · ${attachment.mediaType} · ${formatAttachmentSize(attachment.size)}`}
                        >
                          <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
                          <span className="truncate">{attachment.fileName}</span>
                          <span className="shrink-0 text-[0.7em] opacity-60">
                            {formatAttachmentSize(attachment.size)}
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              removeAttachment(attachment.id);
                            }}
                            className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                            aria-label={`Remove ${attachment.fileName}`}
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
                    value={isImmediateSlashChipActive ? "" : textareaValue}
                    style={chatBoxFont}
                    onChange={(e) => {
                      if (isImmediateSlashChipActive) return;
                      updateComposerText(e.target.value);
                      resizeTextarea();
                    }}
                    onPaste={handleTextareaPaste}
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

                      if (handleEmptyComposerArrowKey(e)) return;

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

                      if (!slashChip && e.key === "Backspace" && attachments.length > 0) {
                        const target = e.target as HTMLTextAreaElement;
                        const isEmptyComposer =
                          textareaValue.length === 0 &&
                          target.selectionStart === 0 &&
                          target.selectionEnd === 0;
                        if (isEmptyComposer) {
                          e.preventDefault();
                          e.stopPropagation();
                          onAttachmentsChange?.(attachments.slice(0, -1));
                          textareaRef.current?.focus();
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
                        if (isImmediateSlashChipActive && activeSlashCommandDef) {
                          selectSlashCommand(activeSlashCommandDef);
                          return;
                        }
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
                    <div
                      ref={slashDescriptionCardRef}
                      className="corner-squircle absolute right-full top-0 mr-2 w-52 overflow-hidden rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-sm"
                    >
                      <p className="break-words text-inherit font-medium text-foreground leading-snug mb-0.5">
                        {highlighted.label}
                      </p>
                      <p
                        ref={slashDescriptionRef}
                        className="scrollbar-hide overflow-y-auto overscroll-contain break-words pr-1 text-inherit text-muted-foreground leading-snug"
                        style={
                          slashDescriptionMaxHeight === null
                            ? undefined
                            : { maxHeight: `${slashDescriptionMaxHeight}px` }
                        }
                      >
                        {highlighted.description}
                      </p>
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
                        const Icon = CHAT_REFERENCE_TYPE_ICONS[option.type];
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
                                "flex items-center justify-between px-1.5 pb-0.5 text-inherit font-medium tracking-wide text-muted-foreground/60",
                                i === 0 ? "pt-1" : "pt-1.5"
                              )}
                              role="presentation"
                            >
                              <span>
                                {group === "builtin"
                                  ? "Commands"
                                  : group === "subagent"
                                    ? "Subagents"
                                    : "Skills"}
                              </span>
                              {i === 0 && onRefreshSlashCommands ? (
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                  }}
                                  onClick={() => {
                                    void handleRefreshSlashCommands();
                                  }}
                                  disabled={isRefreshingSlashCommands}
                                  className="corner-squircle flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                                  aria-label="Refresh skills and subagents"
                                >
                                  <RefreshCw
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      isRefreshingSlashCommands && "animate-spin"
                                    )}
                                  />
                                </button>
                              ) : null}
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
                                  "corner-squircle absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-transparent text-inherit transition-opacity duration-150 hover:bg-transparent",
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
                    className="h-7 px-1.5 text-inherit bg-muted hover:bg-accent gap-0.5 [&_svg]:!size-3"
                    style={chatBoxFont}
                    aria-label={`Interaction mode: ${interactionMode}`}
                  >
                    {(() => {
                      const m =
                        interactionModes.find((mode) => mode.id === interactionMode) ??
                        interactionModes[0];
                      const Icon = MODE_ICONS[m?.baseMode ?? "Agent"];
                      return <Icon className="shrink-0 opacity-70" />;
                    })()}
                    <ChevronDown className="shrink-0 opacity-60" />
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
                    const m = selectorInteractionModes[highlightedModeIndex];
                    if (!m) return null;
                    return (
                      <div className="corner-squircle absolute right-full top-0 mr-2 w-56 rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-sm pointer-events-none">
                        <p className="text-inherit font-medium text-foreground leading-snug mb-0.5">{m.label}</p>
                        <p className="text-inherit text-muted-foreground leading-snug">{m.description}</p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-1">
                    {selectorInteractionModes.map((m, i) => {
                      const Icon = MODE_ICONS[m.baseMode];
                      const isSelected = interactionMode === m.id;
                      const isHighlighted = i === highlightedModeIndex;
                      return (
                        <div
                          key={m.id}
                          ref={(el) => {
                            if (el) modeItemRefs.current.set(i, el);
                            else modeItemRefs.current.delete(i);
                          }}
                          onMouseEnter={() => setHighlightedModeIndex(i)}
                          className={cn(
                            "corner-squircle group flex w-full items-center gap-1 rounded-md px-1 py-1 text-inherit transition-colors [&_svg]:!size-3",
                            isHighlighted
                              ? "bg-muted text-foreground"
                              : isSelected
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectInteractionMode(m.id);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-0.5 text-left"
                          >
                            <Icon className="shrink-0 opacity-60" />
                            <span className="truncate font-medium">{m.label}</span>
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsModePopoverOpen(false);
                              onOpenInteractionModesSettings?.();
                            }}
                            className={cn(
                              "corner-squircle flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60 transition-opacity hover:bg-transparent hover:opacity-100",
                              onOpenInteractionModesSettings ? "" : "pointer-events-none opacity-30"
                            )}
                            aria-label={`Edit ${m.label} interaction mode`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
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
                    className="w-auto h-7 text-inherit justify-center items-center p-1 text-muted-foreground gap-1 hover:bg-transparent [&_svg]:!size-3"
                    style={chatBoxFont}
                  >
                    {selectedLlm && (
                      <ProviderLogo
                        providerId={selectedLlm.provider}
                        className="h-3.5 w-3.5 shrink-0 text-current"
                      />
                    )}
                    <span className="truncate">
                      {selectedLlm?.label || "Select Model"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="relative w-48 overflow-visible p-0 text-inherit"
                  align="start"
                  style={chatBoxFont}
                  onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    setIsModelComboboxOpen(false);
                    focusTextareaAfterPopoverSelect();
                  }}
                  onKeyDownCapture={(e) => {
                    if (e.key === "ArrowDown") {
                      setHighlightedModelIndex((index) =>
                        Math.min(index + 1, Math.max(visiblePinnedModels.length - 1, 0))
                      );
                    }
                    if (e.key === "ArrowUp") {
                      setHighlightedModelIndex((index) => Math.max(index - 1, 0));
                    }
                  }}
                >
                  {highlightedModel ? <ModelDetailCard model={highlightedModel} /> : null}
                  <Command key={pinnedModelsListKey} shouldFilter={false}>
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
                          aria-label="Add models to selector"
                          title="Add models"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <CommandEmpty className="!text-inherit py-6 text-center text-xs">
                      {pinnedModels.length === 0 ? (
                        onOpenModelsSettings ? (
                          <span className="text-muted-foreground">
                            No models pinned.{" "}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                onOpenModelsSettings();
                                setIsModelComboboxOpen(false);
                              }}
                              className="text-foreground hover:underline"
                            >
                              Click here
                            </button>{" "}
                            to add a model.
                          </span>
                        ) : (
                          "No models pinned."
                        )
                      ) : (
                        "No model found."
                      )}
                    </CommandEmpty>
                    <CommandList
                      className="scrollbar-hide overflow-y-auto overflow-x-hidden"
                      style={{ maxHeight: listMaxHeight }}
                    >
                      <CommandGroup>
                        {visiblePinnedModels.map((model, index) => {
                          const ProviderIcon = model.icon;
                          const isDragOver = dragOverIndex === index;
                          const isLocked = model.isAccessible === false;
                          const canReorder =
                            Boolean(onReorderPinned) &&
                            !isLocked &&
                            modelSearchQuery.trim().length === 0;
                          return (
                            <CommandItem
                              key={`${model.provider}:${model.value}`}
                              value={`${model.label} ${model.value} ${model.provider}`}
                              onMouseEnter={() => setHighlightedModelIndex(index)}
                              onSelect={() => {
                                if (isLocked) {
                                  onOpenProvidersSettings?.();
                                  return;
                                }
                                onModelChange(
                                  formatModelSelectionKey(model.provider, model.value)
                                );
                                setIsModelComboboxOpen(false);
                                focusTextareaAfterPopoverSelect();
                              }}
                              className={cn(
                                "!text-inherit",
                                isLocked && "opacity-50 cursor-not-allowed"
                              )}
                              onDragOver={
                                canReorder
                                  ? (e: React.DragEvent) => handlePinnedDragOver(e, index)
                                  : undefined
                              }
                              onDragLeave={
                                canReorder ? handlePinnedDragLeave : undefined
                              }
                              onDrop={
                                canReorder
                                  ? (e: React.DragEvent) => handlePinnedDrop(e, index)
                                  : undefined
                              }
                              style={
                                isDragOver
                                  ? { ...chatBoxFont, backgroundColor: "hsl(var(--accent))" }
                                  : chatBoxFont
                              }
                            >
                              {canReorder && (
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
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Model intelligence selector, hidden when the catalog has no usable levels. */}
              {!readOnly && selectedModelProvider && (
                <ModelSettingsPopover
                  provider={selectedModelProvider}
                  model={selectedLlm}
                  settings={modelSettings}
                  onSettingsChange={onModelSettingsChange}
                />
              )}
            </div>

            {/* Bottom right - context usage + send */}
            <div className="flex items-center gap-1">
              {isOverContextBudget && (
                <span className="mr-1 text-[11px] text-muted-foreground" role="status">
                  Compacting context and retrying…
                </span>
              )}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isAttachmentUploadActive}
                  className="h-7 w-7 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  style={chatBoxFont}
                  onClick={openFilePicker}
                  aria-label="Attach external file"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              <ContextUsagePill
                estimate={contextEstimate}
                hasMessages={!readOnly && (hasMessages || attachments.length > 0)}
                onCompact={onCompact}
                simple={simpleContextUsage}
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
                  disabled={
                    readOnly ||
                    isAttachmentUploadActive ||
                    !hasDraftContent ||
                    isOverContextBudget
                  }
                  size="icon"
                  className="h-7 w-7"
                  style={chatBoxFont}
                  title={
                    isAttachmentUploadActive
                      ? "Wait for file uploads to finish"
                      : isOverContextBudget
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
