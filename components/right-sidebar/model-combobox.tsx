"use client";

import * as React from "react";
import { useState } from "react";
import {
  Brain,
  ChevronDown,
  CircleCheck,
  CircleX,
  Code2,
  Database,
  DollarSign,
  FileText,
  GripVertical,
  Hash,
  Image,
  KeyRound,
  Lock,
  Maximize2,
  Plus,
  Wrench,
  Zap,
} from "lucide-react";

import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
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
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  findModelBySelectionKey,
  formatModelSelectionKey,
} from "@/lib/agent/model-selection-key";
import { PINNED_MODELS_CHANGED_EVENT } from "@/lib/chat/model-selector-events";
import { cn } from "@/lib/utils";

import type { LLM } from "./types";

const DEFAULT_TRIGGER_CLASS =
  "w-auto h-7 text-inherit justify-center items-center p-1 text-muted-foreground gap-1 hover:bg-transparent [&_svg]:!size-3";

/**
 * Resolves pinned model ids to catalog entries in the user's pin order.
 *
 * Exported because the composer's empty-textbox arrow shortcuts step through the
 * same list the selector shows, and the two must not drift.
 */
export function selectPinnedModels(
  models: LLM[],
  pinnedModelIds: string[],
): LLM[] {
  const pinned: LLM[] = [];
  for (const pinKey of pinnedModelIds) {
    const model = findModelBySelectionKey(models, pinKey);
    if (model) pinned.push(model);
  }
  return pinned;
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
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
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
function ModelInfoMetric({
  icon: Icon,
  label,
  value,
  muted = false,
}: ModelInfoMetricProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon
        className={cn("h-3 w-3 shrink-0", muted ? "opacity-35" : "opacity-60")}
      />
      <div className="min-w-0">
        <div className="text-[10px] leading-none text-muted-foreground/70">
          {label}
        </div>
        <div
          className={cn(
            "truncate text-[11px] font-medium leading-snug",
            muted && "text-muted-foreground",
          )}
        >
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
function ModelCapabilityPill({
  icon: Icon,
  label,
  enabled,
}: ModelCapabilityPillProps) {
  const isEnabled = enabled === true;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        isEnabled
          ? "border-border/70 bg-muted/60 text-foreground"
          : "border-border/40 bg-transparent text-muted-foreground/55",
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
  const apiModelId =
    model.apiModelId && model.apiModelId !== model.value
      ? model.apiModelId
      : model.value;

  return (
    <div className="corner-squircle pointer-events-none absolute right-full top-0 mr-2 w-64 rounded-md border border-border/50 bg-popover px-2.5 py-2 text-inherit shadow-sm">
      <div className="mb-2 flex min-w-0 items-start gap-2">
        <ProviderLogo
          providerId={model.provider}
          className="mt-0.5 h-4 w-4 shrink-0 text-current opacity-70"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-inherit font-medium leading-snug text-foreground">
            {model.label}
          </p>
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
        <ModelCapabilityPill
          icon={Image}
          label="Images"
          enabled={model.supportsImageInput}
        />
        <ModelCapabilityPill
          icon={Wrench}
          label="Tools"
          enabled={model.supportsToolCalling}
        />
        <ModelCapabilityPill
          icon={Brain}
          label="Reasoning"
          enabled={model.supportsReasoning}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <ModelInfoMetric
          icon={Database}
          label="Context"
          value={formatTokenLimit(model.contextWindow)}
        />
        <ModelInfoMetric
          icon={Maximize2}
          label="Max output"
          value={formatTokenLimit(model.maxOutputTokens)}
        />
        <ModelInfoMetric
          icon={DollarSign}
          label="Input"
          value={formatTokenPrice(model.inputPrice)}
        />
        <ModelInfoMetric
          icon={DollarSign}
          label="Output"
          value={formatTokenPrice(model.outputPrice)}
        />
        <ModelInfoMetric
          icon={Zap}
          label="Cached"
          value={formatTokenPrice(model.cachedPrice)}
        />
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
              <div className="truncate font-medium">
                {formatTokenLimit(model.longContextThreshold)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground/70">In</div>
              <div className="truncate font-medium">
                {formatTokenPrice(model.longContextInputPrice)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground/70">Out</div>
              <div className="truncate font-medium">
                {formatTokenPrice(model.longContextOutputPrice)}
              </div>
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
            {model.clientAvailable === false
              ? "Hidden from client catalog"
              : "Client available"}
            {model.pinnedByDefault ? " · Default pin" : ""}
            {" · "}
            {formatCatalogDate(model.catalogCreatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface ModelComboboxProps {
  /** Full catalog used to resolve pinned ids. */
  models: LLM[];
  /** Model ids pinned to the selector, in display order. */
  pinnedModelIds: string[];
  /** Currently selected model, as a provider-qualified selection key. */
  selectedModel: string;
  onModelChange: (model: string) => void;
  /** Controlled popover state so callers can suppress their own shortcuts while it is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Enables drag-to-reorder of pinned models. Omit for read-only surfaces. */
  onReorderPinned?: (newOrder: string[]) => void;
  onOpenModelsSettings?: () => void;
  onOpenProvidersSettings?: () => void;
  /** Runs after a selection commits, e.g. to restore composer focus. */
  onSelectComplete?: () => void;
  triggerClassName?: string;
  /** Font styling inherited from the host surface. */
  style?: React.CSSProperties;
  /** Replaces the model label on the trigger when no model resolves. */
  placeholder?: string;
}

/**
 * Pinned-model picker shared by the composer and the goal contract proposal card.
 *
 * Composer-only behaviour (drag-to-reorder, focus restoration) is opt-in so other
 * surfaces can mount the same control without inheriting it.
 */
export function ModelCombobox({
  models,
  pinnedModelIds,
  selectedModel,
  onModelChange,
  open,
  onOpenChange,
  disabled = false,
  onReorderPinned,
  onOpenModelsSettings,
  onOpenProvidersSettings,
  onSelectComplete,
  triggerClassName,
  style,
  placeholder = "Select Model",
}: ModelComboboxProps) {
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const closeCombobox = React.useCallback(
    () => onOpenChange(false),
    [onOpenChange],
  );

  const selectedLlm = findModelBySelectionKey(models, selectedModel);

  const pinnedModels = React.useMemo(
    () => selectPinnedModels(models, pinnedModelIds),
    [models, pinnedModelIds],
  );

  /** Bumps when pins change so cmdk remounts and drops stale filter/list state. */
  const pinnedModelsListKey = React.useMemo(
    () => pinnedModelIds.join("\0"),
    [pinnedModelIds],
  );

  const resetListState = React.useCallback(() => {
    setModelSearchQuery("");
    setDragOverIndex(null);
    setHighlightedModelIndex(0);
  }, []);

  React.useEffect(() => {
    resetListState();
  }, [pinnedModelsListKey, resetListState]);

  React.useEffect(() => {
    if (!open) resetListState();
  }, [open, resetListState]);

  React.useEffect(() => {
    window.addEventListener(PINNED_MODELS_CHANGED_EVENT, resetListState);
    return () => {
      window.removeEventListener(PINNED_MODELS_CHANGED_EVENT, resetListState);
    };
  }, [resetListState]);

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
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [modelSearchQuery, pinnedModels]);

  const highlightedModel = visiblePinnedModels[highlightedModelIndex] ?? null;

  React.useEffect(() => {
    if (!open) return;

    const selectedIndex = visiblePinnedModels.findIndex(
      (model) =>
        formatModelSelectionKey(model.provider, model.value) === selectedModel,
    );
    setHighlightedModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedModel, visiblePinnedModels]);

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

  return (
      <Popover
        open={open}
        onOpenChange={onOpenChange}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            disabled={disabled}
            className={cn(DEFAULT_TRIGGER_CLASS, triggerClassName)}
            style={style}
          >
            {selectedLlm && (
              <ProviderLogo
                providerId={selectedLlm.provider}
                className="h-3.5 w-3.5 shrink-0 text-current"
              />
            )}
            <span className="truncate">
              {selectedLlm?.label || placeholder}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="relative w-48 overflow-visible p-0 text-inherit"
          align="start"
          style={style}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            closeCombobox();
            onSelectComplete?.();
          }}
          onKeyDownCapture={(e) => {
            if (e.key === "ArrowDown") {
              setHighlightedModelIndex((index) =>
                Math.min(
                  index + 1,
                  Math.max(visiblePinnedModels.length - 1, 0),
                ),
              );
            }
            if (e.key === "ArrowUp") {
              setHighlightedModelIndex((index) =>
                Math.max(index - 1, 0),
              );
            }
          }}
        >
          {highlightedModel ? (
            <ModelDetailCard model={highlightedModel} />
          ) : null}
          <Command key={pinnedModelsListKey} shouldFilter={false}>
            <div className="flex items-center gap-0">
              <div className="flex-1 min-w-0">
                <CommandInput
                  placeholder="Search models..."
                  className="orion-chat-composer-mobile h-8 !text-inherit"
                  style={style}
                  onInput={(e) =>
                    setModelSearchQuery(
                      (e.target as HTMLInputElement).value,
                    )
                  }
                />
              </div>
              {onOpenModelsSettings && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 hover:bg-transparent text-muted-foreground hover:text-foreground text-inherit [&_svg]:!size-3"
                  style={style}
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenModelsSettings();
                    closeCombobox();
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
                        closeCombobox();
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
                      onMouseEnter={() =>
                        setHighlightedModelIndex(index)
                      }
                      onSelect={() => {
                        if (isLocked) {
                          onOpenProvidersSettings?.();
                          return;
                        }
                        onModelChange(
                          formatModelSelectionKey(
                            model.provider,
                            model.value,
                          ),
                        );
                        closeCombobox();
                        onSelectComplete?.();
                      }}
                      className={cn(
                        "!text-inherit",
                        isLocked && "opacity-50 cursor-not-allowed",
                      )}
                      onDragOver={
                        canReorder
                          ? (e: React.DragEvent) =>
                              handlePinnedDragOver(e, index)
                          : undefined
                      }
                      onDragLeave={
                        canReorder ? handlePinnedDragLeave : undefined
                      }
                      onDrop={
                        canReorder
                          ? (e: React.DragEvent) =>
                              handlePinnedDrop(e, index)
                          : undefined
                      }
                      style={
                        isDragOver
                          ? {
                              ...style,
                              backgroundColor: "hsl(var(--accent))",
                            }
                          : style
                      }
                    >
                      {canReorder && (
                        <div
                          draggable
                          onDragStart={(e) =>
                            handlePinnedDragStart(e, index)
                          }
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
                        <span className="truncate flex-1">
                          {model.label}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
  );
}
