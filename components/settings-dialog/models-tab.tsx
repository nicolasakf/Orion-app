"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import { RefreshCw, Search, LayoutGrid, List, Pin } from "lucide-react";
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
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoRunConfirmDialog } from "@/components/common/auto-run-confirm-dialog";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { ToolApprovalMode } from "@/lib/settings/schema";
import { toast } from "sonner";
import { OpenAI, Claude, Gemini, Grok } from "@lobehub/icons";

type ProviderId = "google" | "openai" | "anthropic" | "xai";

interface ModelRow {
  model_id: string;
  label: string;
  provider_id: string;
  created_at: string;
  pinned_by_default: boolean;
}

function getProviderIcon(provider: ProviderId) {
  switch (provider) {
    case "openai":
      return OpenAI;
    case "anthropic":
      return Claude;
    case "google":
      return Gemini;
    case "xai":
      return Grok;
    default:
      return undefined;
  }
}

function getProviderDisplayName(providerId: string): string {
  const names: Record<string, string> = {
    google: "Google",
    openai: "OpenAI",
    anthropic: "Anthropic",
    xai: "xAI",
  };
  return names[providerId] ?? providerId;
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

/** Models tab: search, refresh, and pin models to the top of the model selector. */
export function ModelsTab() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [groupByProvider, setGroupByProvider] = useState(true);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [autoRunConfirmOpen, setAutoRunConfirmOpen] = useState(false);

  /** When the user has no pinned models, use catalog defaults. */
  const pinnedModelIds = React.useMemo(() => {
    const userPinned = effectiveSettings.chat.pinnedModelIds ?? [];
    if (userPinned.length > 0) return userPinned;
    return models
      .filter((m) => m.pinned_by_default)
      .map((m) => m.model_id);
  }, [effectiveSettings.chat.pinnedModelIds, models]);

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
      setExpandedProviders((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.add(r.provider_id));
        return next;
      });
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

  const filteredModels = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        getProviderDisplayName(m.provider_id).toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  /** Sort: pinned first (preserving pin order), then by created_at (latest first). */
  const sortedModels = React.useMemo(() => {
    return [...filteredModels].sort((a, b) => {
      const aPinned = pinnedModelIds.includes(a.model_id);
      const bPinned = pinnedModelIds.includes(b.model_id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned) {
        return (
          pinnedModelIds.indexOf(a.model_id) - pinnedModelIds.indexOf(b.model_id)
        );
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [filteredModels, pinnedModelIds]);

  const modelsByProvider = React.useMemo(() => {
    const map = new Map<string, ModelRow[]>();
    for (const m of sortedModels) {
      const list = map.get(m.provider_id) ?? [];
      list.push(m);
      map.set(m.provider_id, list);
    }
    return map;
  }, [sortedModels]);

  const isModelPinned = (modelId: string) => pinnedModelIds.includes(modelId);

  const setModelPinned = (modelId: string, pinned: boolean) => {
    void setUserSettings((current) => {
      const userPinned = current.chat.pinnedModelIds ?? [];
      // When user has no pins, we're using defaults—use effective list as base for the mutation
      const basePinned = userPinned.length > 0 ? userPinned : pinnedModelIds;
      const nextPinned = pinned
        ? basePinned.includes(modelId)
          ? basePinned
          : [...basePinned, modelId]
        : basePinned.filter((id) => id !== modelId);
      return {
        ...current,
        chat: {
          ...current.chat,
          pinnedModelIds: nextPinned,
        },
      };
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

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Agent section */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Agent</h2>
        <div className="flex items-center justify-between max-w-xl">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Tool approval</p>
            <p className="text-xs text-muted-foreground">
              Whether tools require confirmation before running.
            </p>
          </div>
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

      {/* Models section */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Models</h2>
      </div>

      <div className="flex gap-2 max-w-xl items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by model or provider name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
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
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([providerId, providerModels]) => {
              const isExpanded = expandedProviders.has(providerId);
              const ProviderIcon = getProviderIcon(
                providerId as ProviderId
              );
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
                      {ProviderIcon && (
                        <ProviderIcon className="h-4 w-4 opacity-70" />
                      )}
                      <span>{displayName}</span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-5 pr-2 pb-1 space-y-0.5">
                      {providerModels.map((model) => {
                        const pinned = isModelPinned(model.model_id);
                        return (
                          <div
                            key={model.model_id}
                            className="corner-squircle group flex items-center justify-between py-1 px-2 rounded hover:bg-accent/50 min-h-8"
                          >
                            <span className="text-sm">{model.label}</span>
                            <ModelPinButton
                              pinned={pinned}
                              onToggle={() =>
                                setModelPinned(model.model_id, !pinned)
                              }
                            />
                          </div>
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
          {sortedModels.map((model) => {
            const pinned = isModelPinned(model.model_id);
            const ProviderIcon = getProviderIcon(model.provider_id as ProviderId);
            return (
              <div
                key={model.model_id}
                className="corner-squircle group flex items-center justify-between py-1 px-2 rounded hover:bg-accent/50 min-h-8"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {ProviderIcon && (
                    <ProviderIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  )}
                  <span className="text-sm truncate">{model.label}</span>
                </div>
                <ModelPinButton
                  pinned={pinned}
                  onToggle={() => setModelPinned(model.model_id, !pinned)}
                />
              </div>
            );
          })}
        </div>
      )}

      {models.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          No models found. Click refresh to load models.
        </p>
      )}

      <AutoRunConfirmDialog
        open={autoRunConfirmOpen}
        onOpenChange={setAutoRunConfirmOpen}
        onConfirm={handleAutoRunConfirm}
      />
    </div>
  );
}
