"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import {
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Pin,
  Pencil,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
} from "lucide-react";
import {
  cn,
  scheduleAfterMinDuration,
  MIN_REFRESH_SPIN_MS,
} from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AutoRunConfirmDialog } from "@/components/common/auto-run-confirm-dialog";
import { ProviderLogo } from "@/components/provider-logo";
import { SettingsInfoHeading } from "@/components/settings-dialog/settings-info-label";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { ProviderCredential, ToolApprovalMode } from "@/lib/settings/schema";
import { toast } from "sonner";
import {
  buildModelLabelsUpdate,
  getCustomModelLabel,
  resolveModelDisplayLabel,
} from "@/lib/agent/model-display-label";
import { getLocalModelLabel } from "@/lib/agent/local-model-labels";
import {
  decodeLocalModelCatalogId,
  encodeLocalModelCatalogId,
  isLocalProvider,
  normalizeLocalEndpointModels,
} from "@/lib/agent/local-provider-models";
import { getVisibleProviderIds } from "@/lib/settings/visible-providers";
import {
  findModelBySelectionKey,
  formatModelSelectionKey,
  normalizePinnedModelKeys,
  parseModelSelectionKey,
} from "@/lib/agent/model-selection-key";
import { dispatchPinnedModelsChanged } from "@/lib/chat/model-selector-events";

interface ModelRow {
  model_id: string;
  label: string;
  provider_id: string;
  created_at: string;
  pinned_by_default: boolean;
}

interface DisplayModelRow extends ModelRow {
  baseLabel: string;
}

function getProviderDisplayName(providerId: string): string {
  const names: Record<string, string> = {
    google: "Google",
    openai: "OpenAI",
    anthropic: "Anthropic",
    xai: "xAI",
    ollama: "Ollama",
    lmstudio: "LM Studio",
    mlx: "MLX",
    custom: "Custom Endpoint",
  };
  return names[providerId] ?? providerId;
}

function isStaticLocalModelValue(modelId: string): boolean {
  return decodeLocalModelCatalogId(modelId) === undefined;
}

function resolveBaseModelLabel(
  model: ModelRow,
  credentials: Record<string, ProviderCredential>
): string {
  if (isLocalProvider(model.provider_id) && isStaticLocalModelValue(model.model_id)) {
    const credential = credentials[model.provider_id];
    if (credential?.type === "local_endpoint") {
      return (
        credential.label ??
        getLocalModelLabel(model.provider_id, credential.modelId) ??
        credential.modelId
      );
    }
  }

  return model.label;
}

/** Orders models by newest release first, with a stable key-based tie-breaker. */
function compareModelsByReleaseDate(a: ModelRow, b: ModelRow): number {
  const dateDiff =
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  if (dateDiff !== 0) return dateDiff;
  return formatModelSelectionKey(a.provider_id, a.model_id).localeCompare(
    formatModelSelectionKey(b.provider_id, b.model_id)
  );
}

function providerMatchesSearchPrefix(providerId: string, prefix: string): boolean {
  const normalizedPrefix = prefix.toLowerCase();
  if (!normalizedPrefix) return false;
  const normalizedProviderId = providerId.toLowerCase();
  const providerName = getProviderDisplayName(providerId).toLowerCase();
  return (
    normalizedProviderId === normalizedPrefix ||
    normalizedProviderId.startsWith(normalizedPrefix) ||
    providerName === normalizedPrefix ||
    providerName.startsWith(normalizedPrefix)
  );
}

/**
 * Scores how well a catalog row matches a models-tab search query.
 * Higher scores surface exact id / provider+id matches before fuzzy label hits.
 */
function scoreModelSearchMatch(
  model: Pick<DisplayModelRow, "model_id" | "label" | "provider_id">,
  rawQuery: string
): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const selectionKey = formatModelSelectionKey(
    model.provider_id,
    model.model_id
  ).toLowerCase();
  const modelId = model.model_id.toLowerCase();
  const label = model.label.toLowerCase();
  const providerId = model.provider_id.toLowerCase();
  const providerName = getProviderDisplayName(model.provider_id).toLowerCase();

  const parsedSelectionKey = parseModelSelectionKey(rawQuery.trim());
  if (
    parsedSelectionKey &&
    parsedSelectionKey.providerId === model.provider_id &&
    parsedSelectionKey.modelId.toLowerCase() === modelId
  ) {
    return 1_000;
  }

  if (selectionKey === q) return 990;

  const slashIdx = q.indexOf("/");
  if (slashIdx > 0) {
    const qProviderPart = q.slice(0, slashIdx);
    const qModelPart = q.slice(slashIdx + 1);

    if (modelId === q) return 980;

    if (qModelPart) {
      if (
        providerMatchesSearchPrefix(model.provider_id, qProviderPart) &&
        modelId === qModelPart
      ) {
        return 970;
      }
      if (
        providerMatchesSearchPrefix(model.provider_id, qProviderPart) &&
        modelId.startsWith(qModelPart)
      ) {
        return 950;
      }
      if (
        providerMatchesSearchPrefix(model.provider_id, qProviderPart) &&
        modelId.includes(qModelPart)
      ) {
        return 930;
      }
    }

    if (selectionKey.includes(q)) return 910;
    if (modelId.includes(q)) return 890;
  }

  if (modelId === q) return 870;
  if (modelId.startsWith(q)) return 850;

  if (label === q) return 830;
  if (label.startsWith(q)) return 810;
  if (label.includes(q)) return 790;

  if (providerId === q || providerName === q) return 770;
  if (providerId.startsWith(q) || providerName.startsWith(q)) return 750;
  if (providerId.includes(q) || providerName.includes(q)) return 730;

  if (selectionKey.includes(q)) return 710;
  if (modelId.includes(q)) return 690;

  return 0;
}

/** Filters catalog rows by label, provider, model id, or `provider/modelId` queries. */
function filterAndRankModelsBySearch<T extends DisplayModelRow>(
  models: readonly T[],
  rawQuery: string
): T[] {
  const q = rawQuery.trim();
  if (!q) return [...models];

  return models
    .map((model) => ({ model, score: scoreModelSearchMatch(model, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareModelsByReleaseDate(a.model, b.model);
    })
    .map(({ model }) => model);
}

/** Pencil control for renaming a model in pickers; highlighted when a custom label is set. */
function ModelEditLabelButton({
  hasCustomLabel,
  onEdit,
}: {
  hasCustomLabel: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "corner-squircle shrink-0 rounded p-1 text-muted-foreground transition-colors",
        "opacity-0 group-hover:opacity-100",
        "hover:bg-primary/10 hover:text-primary",
        hasCustomLabel && "opacity-100 text-primary"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      aria-label="Rename model"
      title="Rename model"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

function ModelListRow({
  model,
  hasCustomLabel,
  pinned,
  showProviderLogo,
  onEditLabel,
  onTogglePin,
  reorderable = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  model: DisplayModelRow;
  hasCustomLabel: boolean;
  pinned: boolean;
  showProviderLogo: boolean;
  onEditLabel: () => void;
  onTogglePin: () => void;
  reorderable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "corner-squircle group flex items-center justify-between py-1 px-2 rounded hover:bg-accent/50 min-h-8",
        isDragOver && "bg-accent"
      )}
      onDragOver={reorderable ? onDragOver : undefined}
      onDragLeave={reorderable ? onDragLeave : undefined}
      onDrop={reorderable ? onDrop : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        {reorderable && onDragStart ? (
          <div
            draggable
            onDragStart={onDragStart}
            className="cursor-grab touch-none text-muted-foreground opacity-50 hover:opacity-70 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        ) : null}
        {showProviderLogo ? (
          <ProviderLogo
            providerId={model.provider_id}
            className="h-3.5 w-3.5 opacity-70"
          />
        ) : null}
        <span className="text-sm truncate">{model.label}</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ModelEditLabelButton hasCustomLabel={hasCustomLabel} onEdit={onEditLabel} />
        <ModelPinButton pinned={pinned} onToggle={onTogglePin} />
      </div>
    </div>
  );
}

/** Pin control aligned with workspace picker: outline pin appears on row hover; filled when pinned. */
function ModelPinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "corner-squircle shrink-0 rounded p-1 text-muted-foreground transition-colors",
        "opacity-0 group-hover:opacity-100",
        "hover:bg-primary/10 hover:text-primary",
        pinned && "opacity-100 text-primary"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={pinned ? "Unpin model" : "Pin model"}
      aria-pressed={pinned}
      title={pinned ? "Unpin model" : "Pin model"}
    >
      <Pin
        className={cn("h-3.5 w-3.5", pinned && "fill-current")}
        strokeWidth={pinned ? 2.5 : 2}
      />
    </button>
  );
}

interface ModelsTabProps {
  /** Switches the settings dialog to the Providers tab. */
  onNavigateToProviders?: () => void;
}

/** Models tab: search, refresh, and pin models shown in the chat model selector. */
export function ModelsTab({ onNavigateToProviders }: ModelsTabProps = {}) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const isBusinessMode = effectiveSettings.appearance.experienceMode === "business";
  const [models, setModels] = useState<ModelRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groupByProvider, setGroupByProvider] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [autoRunConfirmOpen, setAutoRunConfirmOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelDialogModel, setLabelDialogModel] = useState<DisplayModelRow | null>(
    null
  );
  const [labelDraft, setLabelDraft] = useState("");
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [isTitleGenerationModelValidating, setIsTitleGenerationModelValidating] =
    useState(false);
  const initializedProvidersRef = React.useRef<Set<string>>(new Set());

  const visibleProviderIds = React.useMemo(
    () => getVisibleProviderIds(effectiveSettings.providers),
    [effectiveSettings.providers]
  );

  const configuredLocalModelRows = React.useMemo<ModelRow[]>(() => {
    const credentials = effectiveSettings.providers?.credentials ?? {};
    const rows: ModelRow[] = [];
    const now = new Date().toISOString();

    for (const [providerId, credential] of Object.entries(credentials)) {
      if (credential?.type !== "local_endpoint") continue;

      const endpointModels = isLocalProvider(providerId)
        ? normalizeLocalEndpointModels(providerId, credential)
        : [
            {
              modelId: credential.modelId,
              label: credential.label ?? credential.modelId,
              enabled: true,
            },
            ...(credential.models ?? []),
          ];

      for (const model of endpointModels) {
        if (model.enabled === false) continue;
        rows.push({
          model_id: isLocalProvider(providerId)
            ? encodeLocalModelCatalogId(providerId, model.modelId)
            : model.modelId,
          label: model.label ?? getLocalModelLabel(providerId, model.modelId) ?? model.modelId,
          provider_id: providerId,
          created_at: now,
          pinned_by_default: false,
        });
      }
    }

    return rows;
  }, [effectiveSettings.providers?.credentials]);

  const catalogModelsForVisibleProviders = React.useMemo(
    () => models.filter((model) => visibleProviderIds.has(model.provider_id)),
    [models, visibleProviderIds]
  );

  const allModels = React.useMemo<ModelRow[]>(() => {
    const configuredLocalProviders = new Set(
      configuredLocalModelRows.map((model) => model.provider_id)
    );
    const staticRows = catalogModelsForVisibleProviders.filter(
      (model) => !(isLocalProvider(model.provider_id) && configuredLocalProviders.has(model.provider_id))
    );

    return [...staticRows, ...configuredLocalModelRows];
  }, [catalogModelsForVisibleProviders, configuredLocalModelRows]);

  /** When the user has no pinned models, use catalog defaults from visible providers only. */
  const pinnedModelIds = React.useMemo(() => {
    const userPinned = effectiveSettings.chat.pinnedModelIds ?? [];
    const base =
      userPinned.length > 0
        ? userPinned
        : allModels
            .filter((m) => m.pinned_by_default)
            .map((m) => formatModelSelectionKey(m.provider_id, m.model_id));
    return normalizePinnedModelKeys(base, allModels);
  }, [allModels, effectiveSettings.chat.pinnedModelIds]);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    const start = Date.now();
    try {
      const response = await fetch("/api/models");
      if (!response.ok) throw new Error("Failed to fetch models");
      const json = (await response.json()) as { models: ModelRow[] };
      const data = json.models;
      const rows: ModelRow[] = data.map((m) => ({
        model_id: m.model_id,
        label: m.label,
        provider_id: m.provider_id,
        created_at: m.created_at,
        pinned_by_default: m.pinned_by_default,
      }));
      setModels(rows);
    } catch (error) {
      console.error("Failed to fetch models:", error);
      toast.error("Failed to fetch models");
    } finally {
      scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
        setIsLoading(false)
      );
    }
  }, []);

  React.useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  /** Expand only newly seen provider groups; preserve user collapse state on later updates. */
  React.useEffect(() => {
    if (models.length === 0) return;
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const row of models) {
        if (!visibleProviderIds.has(row.provider_id)) continue;
        if (initializedProvidersRef.current.has(row.provider_id)) continue;
        initializedProvidersRef.current.add(row.provider_id);
        next.add(row.provider_id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [models, visibleProviderIds]);

  const modelLabels = effectiveSettings.chat.modelLabels ?? {};

  const modelsWithConfiguredLabels = React.useMemo<DisplayModelRow[]>(() => {
    const credentials = effectiveSettings.providers?.credentials ?? {};

    return allModels.map((model) => {
      const baseLabel = resolveBaseModelLabel(model, credentials);
      return {
        ...model,
        baseLabel,
        label: resolveModelDisplayLabel(
          model.provider_id,
          model.model_id,
          baseLabel,
          modelLabels
        ),
      };
    });
  }, [allModels, effectiveSettings.providers?.credentials, modelLabels]);

  const titleGenerationModels = React.useMemo(() => {
    return [...modelsWithConfiguredLabels].sort((a, b) =>
      formatModelSelectionKey(a.provider_id, a.model_id).localeCompare(
        formatModelSelectionKey(b.provider_id, b.model_id)
      )
    );
  }, [modelsWithConfiguredLabels]);

  const titleGenerationModelSelectionKey = React.useMemo(() => {
    const configuredModel = findModelBySelectionKey(
      titleGenerationModels.map((model) => ({
        provider: model.provider_id,
        value: model.model_id,
      })),
      effectiveSettings.chat.titleGenerationModelId
    );
    return configuredModel
      ? formatModelSelectionKey(configuredModel.provider, configuredModel.value)
      : effectiveSettings.chat.titleGenerationModelId;
  }, [effectiveSettings.chat.titleGenerationModelId, titleGenerationModels]);

  const filteredModels = React.useMemo(
    () => filterAndRankModelsBySearch(modelsWithConfiguredLabels, searchQuery),
    [modelsWithConfiguredLabels, searchQuery]
  );

  const isSearchActive = searchQuery.trim().length > 0;

  /** Stable display order for grouped view so pin toggles do not reshuffle within a provider. */
  const sortedModels = React.useMemo(() => {
    if (isSearchActive) return filteredModels;
    return [...filteredModels].sort(compareModelsByReleaseDate);
  }, [filteredModels, isSearchActive]);

  const listViewPinnedModels = React.useMemo(() => {
    const pinned = filteredModels.filter((model) =>
      pinnedModelIds.includes(
        formatModelSelectionKey(model.provider_id, model.model_id)
      )
    );
    if (isSearchActive) return pinned;

    return pinned.sort((a, b) => {
      const aKey = formatModelSelectionKey(a.provider_id, a.model_id);
      const bKey = formatModelSelectionKey(b.provider_id, b.model_id);
      return pinnedModelIds.indexOf(aKey) - pinnedModelIds.indexOf(bKey);
    });
  }, [filteredModels, pinnedModelIds, isSearchActive]);

  const listViewUnpinnedModels = React.useMemo(() => {
    const unpinned = filteredModels.filter(
      (model) =>
        !pinnedModelIds.includes(
          formatModelSelectionKey(model.provider_id, model.model_id)
        )
    );
    if (isSearchActive) return unpinned;
    return unpinned.sort(compareModelsByReleaseDate);
  }, [filteredModels, pinnedModelIds, isSearchActive]);

  const modelsByProvider = React.useMemo(() => {
    const map = new Map<string, DisplayModelRow[]>();
    for (const m of sortedModels) {
      const list = map.get(m.provider_id) ?? [];
      list.push(m);
      map.set(m.provider_id, list);
    }
    return map;
  }, [sortedModels]);

  const isModelPinned = (providerId: string, modelId: string) =>
    pinnedModelIds.includes(formatModelSelectionKey(providerId, modelId));

  const hasCustomModelLabel = (providerId: string, modelId: string) =>
    getCustomModelLabel(modelLabels, providerId, modelId) !== undefined;

  const openLabelDialog = (model: DisplayModelRow) => {
    setLabelDialogModel(model);
    setLabelDraft(model.label);
    setLabelDialogOpen(true);
  };

  const closeLabelDialog = () => {
    setLabelDialogOpen(false);
    setLabelDialogModel(null);
    setLabelDraft("");
  };

  const saveModelLabel = () => {
    if (!labelDialogModel) return;

    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        modelLabels: buildModelLabelsUpdate(
          current.chat.modelLabels ?? {},
          labelDialogModel.provider_id,
          labelDialogModel.model_id,
          labelDraft,
          labelDialogModel.baseLabel
        ),
      },
    }));
    closeLabelDialog();
  };

  const resetModelLabel = () => {
    if (!labelDialogModel) return;

    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        modelLabels: buildModelLabelsUpdate(
          current.chat.modelLabels ?? {},
          labelDialogModel.provider_id,
          labelDialogModel.model_id,
          labelDialogModel.baseLabel,
          labelDialogModel.baseLabel
        ),
      },
    }));
    closeLabelDialog();
  };

  const canReorderPinned =
    !isSearchActive && !groupByProvider && listViewPinnedModels.length > 1;

  const pinnedModelsListKey = React.useMemo(
    () => pinnedModelIds.join("\0"),
    [pinnedModelIds]
  );

  React.useEffect(() => {
    setDragOverIndex(null);
  }, [isSearchActive, groupByProvider, pinnedModelsListKey]);

  /** Reorders pinned models in settings and notifies the chat model selector. */
  const reorderPinnedModels = (dragIndex: number, dropIndex: number) => {
    const visibleKeys = listViewPinnedModels.map((model) =>
      formatModelSelectionKey(model.provider_id, model.model_id)
    );
    const nextVisibleOrder = [...visibleKeys];
    const [moved] = nextVisibleOrder.splice(dragIndex, 1);
    nextVisibleOrder.splice(dropIndex, 0, moved);

    void setUserSettings((current) => {
      const userPinned = current.chat.pinnedModelIds ?? [];
      const basePinned =
        userPinned.length > 0
          ? normalizePinnedModelKeys(userPinned, allModels)
          : pinnedModelIds;
      const visibleSet = new Set(nextVisibleOrder);
      const trailing = basePinned.filter((key) => !visibleSet.has(key));
      const nextPinned = [...nextVisibleOrder, ...trailing];

      return {
        ...current,
        chat: {
          ...current.chat,
          pinnedModelIds: nextPinned,
        },
      };
    }).then(() => {
      dispatchPinnedModelsChanged();
    });
  };

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
    if (isNaN(dragIndex) || dragIndex === dropIndex) return;
    reorderPinnedModels(dragIndex, dropIndex);
  };

  const setModelPinned = (providerId: string, modelId: string, pinned: boolean) => {
    const pinKey = formatModelSelectionKey(providerId, modelId);
    void setUserSettings((current) => {
      const userPinned = current.chat.pinnedModelIds ?? [];
      // When user has no pins, we're using defaults—use effective list as base for the mutation
      const basePinned =
        userPinned.length > 0
          ? normalizePinnedModelKeys(userPinned, allModels)
          : pinnedModelIds;
      const nextPinned = pinned
        ? basePinned.includes(pinKey)
          ? basePinned
          : [...basePinned, pinKey]
        : basePinned.filter((id) => id !== pinKey && id !== modelId);
      return {
        ...current,
        chat: {
          ...current.chat,
          pinnedModelIds: nextPinned,
        },
      };
    }).then(() => {
      dispatchPinnedModelsChanged();
    });
  };

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const groupedProviderIds = React.useMemo(
    () =>
      Array.from(modelsByProvider.keys()).sort((a, b) => a.localeCompare(b)),
    [modelsByProvider]
  );

  const allGroupsExpanded =
    groupedProviderIds.length > 0 &&
    groupedProviderIds.every((providerId) =>
      expandedProviders.has(providerId)
    );

  const toggleAllProviderGroups = () => {
    setExpandedProviders((prev) => {
      if (allGroupsExpanded) {
        return new Set();
      }
      return new Set(groupedProviderIds);
    });
  };

  const toolApprovalMode = effectiveSettings.chat.toolApprovalMode;

  const handleToolApprovalModeChange = (mode: ToolApprovalMode) => {
    if (mode === "auto_run") {
      setAutoRunConfirmOpen(true);
      return;
    }
    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        toolApprovalMode: mode,
      },
    }));
  };

  const handleAutoRunConfirm = () => {
    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        toolApprovalMode: "auto_run",
      },
    }));
    setAutoRunConfirmOpen(false);
  };

  /** Verifies a model can generate a title before saving it as the user's preference. */
  const handleTitleGenerationModelChange = async (selectionKey: string) => {
    const selectedModel = titleGenerationModels.find(
      (model) =>
        formatModelSelectionKey(model.provider_id, model.model_id) === selectionKey
    );
    if (!selectedModel) {
      toast.error("The selected title generation model is no longer available.");
      return;
    }

    setIsTitleGenerationModelValidating(true);
    try {
      const response = await fetch("/api/models/title-generation/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedModel.provider_id,
          model: selectedModel.model_id,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        valid?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok || result?.valid !== true) {
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "The selected model could not generate a title."
        );
      }

      await setUserSettings((current) => ({
        ...current,
        chat: {
          ...current.chat,
          titleGenerationModelId: selectionKey,
        },
      }));
      toast.success("Title generation model verified and saved.");
    } catch (error) {
      console.error("Failed to validate title generation model:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "The selected model could not generate a title."
      );
    } finally {
      setIsTitleGenerationModelValidating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {!isBusinessMode ? (
        <>
          {/* Agent section */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Agent</h2>
            <div className="flex items-center justify-between max-w-xl">
              <SettingsInfoHeading
                label="Tool approval"
                description="Whether tools require confirmation before running."
              />
              <Select value={toolApprovalMode} onValueChange={handleToolApprovalModeChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always_ask">Always ask</SelectItem>
                  <SelectItem value="auto_run">Auto-run</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t" />
        </>
      ) : null}

      {/* Title generation section */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Chat titles</h2>
        <div className="flex items-center justify-between max-w-xl">
          <SettingsInfoHeading
            label="Title generation model"
            description="Used when generating short titles for new chats."
          />
          <Select
            value={titleGenerationModelSelectionKey}
            onValueChange={(selectionKey) => {
              void handleTitleGenerationModelChange(selectionKey);
            }}
            disabled={
              isLoading ||
              isTitleGenerationModelValidating ||
              titleGenerationModels.length === 0
            }
          >
            <SelectTrigger
              className="w-[280px] font-mono text-xs"
              aria-busy={isTitleGenerationModelValidating}
            >
              <SelectValue placeholder="Select model" />
              {isTitleGenerationModelValidating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-label="Verifying model" />
              ) : null}
            </SelectTrigger>
            <SelectContent>
              {titleGenerationModels.map((model) => (
                <SelectItem
                  key={formatModelSelectionKey(model.provider_id, model.model_id)}
                  value={formatModelSelectionKey(model.provider_id, model.model_id)}
                  className="font-mono text-xs"
                >
                  {formatModelSelectionKey(model.provider_id, model.model_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t" />

      {/* Models section */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Models</h2>
      </div>

      <div className="flex gap-2 max-w-xl items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by label, provider, or model id..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {groupByProvider ? (
          <Button
            variant="outline"
            size="icon"
            onClick={toggleAllProviderGroups}
            disabled={groupedProviderIds.length === 0}
            aria-label={allGroupsExpanded ? "Collapse all groups" : "Expand all groups"}
            title={allGroupsExpanded ? "Collapse all groups" : "Expand all groups"}
          >
            {allGroupsExpanded ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setGroupByProvider((p) => !p)}
          aria-label={groupByProvider ? "Switch to simple list" : "Switch to grouped by provider"}
          title={groupByProvider ? "Switch to simple list" : "Switch to grouped by provider"}
        >
          {groupByProvider ? (
            <List className="h-4 w-4" />
          ) : (
            <LayoutGrid className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void fetchModels()}
          disabled={isLoading}
          aria-label="Refresh models"
        >
          <RefreshCw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 py-1">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : groupByProvider ? (
        <div className="flex flex-col gap-0.5">
          {Array.from(modelsByProvider.entries())
            .sort(([providerA, providerAModels], [providerB, providerBModels]) => {
              if (isSearchActive) {
                const aScore = Math.max(
                  ...providerAModels.map((model) =>
                    scoreModelSearchMatch(model, searchQuery)
                  )
                );
                const bScore = Math.max(
                  ...providerBModels.map((model) =>
                    scoreModelSearchMatch(model, searchQuery)
                  )
                );
                if (bScore !== aScore) return bScore - aScore;
              }
              return providerA.localeCompare(providerB);
            })
            .map(([providerId, providerModels]) => {
              const isExpanded = expandedProviders.has(providerId);
              const displayName = getProviderDisplayName(providerId);

              return (
                <Collapsible
                  key={providerId}
                  open={isExpanded}
                  onOpenChange={() => toggleProvider(providerId)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="corner-squircle flex items-center gap-2 w-full py-1.5 px-2 rounded-md hover:bg-accent text-left font-medium text-sm"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <ProviderLogo providerId={providerId} className="h-4 w-4 opacity-70" />
                      <span>{displayName}</span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-5 pr-2 pb-1 space-y-0.5">
                      {providerModels.map((model) => {
                        const pinned = isModelPinned(model.provider_id, model.model_id);
                        return (
                          <ModelListRow
                            key={formatModelSelectionKey(model.provider_id, model.model_id)}
                            model={model}
                            hasCustomLabel={hasCustomModelLabel(
                              model.provider_id,
                              model.model_id
                            )}
                            pinned={pinned}
                            showProviderLogo={false}
                            onEditLabel={() => openLabelDialog(model)}
                            onTogglePin={() =>
                              setModelPinned(model.provider_id, model.model_id, !pinned)
                            }
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {listViewPinnedModels.map((model, index) => {
            const pinned = isModelPinned(model.provider_id, model.model_id);
            return (
              <ModelListRow
                key={formatModelSelectionKey(model.provider_id, model.model_id)}
                model={model}
                hasCustomLabel={hasCustomModelLabel(model.provider_id, model.model_id)}
                pinned={pinned}
                showProviderLogo
                onEditLabel={() => openLabelDialog(model)}
                onTogglePin={() =>
                  setModelPinned(model.provider_id, model.model_id, !pinned)
                }
                reorderable={canReorderPinned}
                isDragOver={dragOverIndex === index}
                onDragStart={(e) => handlePinnedDragStart(e, index)}
                onDragOver={(e) => handlePinnedDragOver(e, index)}
                onDragLeave={handlePinnedDragLeave}
                onDrop={(e) => handlePinnedDrop(e, index)}
              />
            );
          })}
          {listViewPinnedModels.length > 0 &&
            listViewUnpinnedModels.length > 0 && (
              <Separator className="my-1" />
            )}
          {listViewUnpinnedModels.map((model) => {
            const pinned = isModelPinned(model.provider_id, model.model_id);
            return (
              <ModelListRow
                key={formatModelSelectionKey(model.provider_id, model.model_id)}
                model={model}
                hasCustomLabel={hasCustomModelLabel(model.provider_id, model.model_id)}
                pinned={pinned}
                showProviderLogo
                onEditLabel={() => openLabelDialog(model)}
                onTogglePin={() =>
                  setModelPinned(model.provider_id, model.model_id, !pinned)
                }
              />
            );
          })}
        </div>
      )}

      {allModels.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          {visibleProviderIds.size === 0 ? (
            <>
              Hey, there are no providers configured.{" "}
              {onNavigateToProviders ? (
                <button
                  type="button"
                  onClick={onNavigateToProviders}
                  className="text-foreground hover:underline"
                >
                  Click here
                </button>
              ) : (
                "Click here"
              )}{" "}
              to configure a provider.
            </>
          ) : (
            "No models found for your providers. Click refresh to reload."
          )}
        </p>
      )}

      <Dialog
        open={labelDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeLabelDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename model</DialogTitle>
            <DialogDescription>
              {labelDialogModel
                ? `${getProviderDisplayName(labelDialogModel.provider_id)} · ${formatModelSelectionKey(labelDialogModel.provider_id, labelDialogModel.model_id)}`
                : "Set a custom display label for this model."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="model-label">Display label</Label>
            <Input
              id="model-label"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveModelLabel();
                }
              }}
              placeholder={labelDialogModel?.baseLabel ?? "Model label"}
              autoFocus
            />
            {labelDialogModel ? (
              <p className="text-xs text-muted-foreground">
                Default: {labelDialogModel.baseLabel}
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {labelDialogModel &&
            hasCustomModelLabel(
              labelDialogModel.provider_id,
              labelDialogModel.model_id
            ) ? (
              <Button type="button" variant="ghost" onClick={resetModelLabel}>
                Reset to default
              </Button>
            ) : (
              <div className="hidden sm:block" />
            )}
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={closeLabelDialog}>
                Cancel
              </Button>
              <Button type="button" onClick={saveModelLabel}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AutoRunConfirmDialog
        open={autoRunConfirmOpen}
        onOpenChange={setAutoRunConfirmOpen}
        onConfirm={handleAutoRunConfirm}
      />
    </div>
  );
}
