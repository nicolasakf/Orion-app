import type { ProviderId } from "@/lib/agent/model-gateway-types";
import {
  getSupportedReasoningEfforts,
  isReasoningEffort,
  type ReasoningEffort,
} from "@/lib/agent/reasoning-effort";

import type { LLM, ModelSettings } from "./types";

export type IntelligenceLevelValue = ReasoningEffort;

export interface IntelligenceLevelOption {
  value: IntelligenceLevelValue;
  label: string;
  shortLabel: string;
  settings: ModelSettings;
}

const LEVEL_LABELS: Record<ReasoningEffort, { label: string; shortLabel: string }> = {
  minimal: { label: "Minimal", shortLabel: "Min" },
  low: { label: "Low", shortLabel: "Low" },
  medium: { label: "Medium", shortLabel: "Med" },
  high: { label: "High", shortLabel: "High" },
  xhigh: { label: "Extra High", shortLabel: "XHigh" },
  max: { label: "Max", shortLabel: "Max" },
};

/** Returns the exact catalog and adapter-supported levels for a selected model. */
export function getIntelligenceLevels(
  provider: ProviderId,
  model: LLM | null | undefined
): IntelligenceLevelOption[] {
  if (!model) return [];
  return getSupportedReasoningEfforts(
    provider,
    model.apiModelId ?? model.value,
    model.reasoningOptions
  ).map((value) => ({
    value,
    ...LEVEL_LABELS[value],
    settings: { reasoningEffort: value },
  }));
}

/** Resolves a valid selected level while leaving empty settings provider-defaulted. */
export function getSelectedIntelligenceLevel(
  provider: ProviderId,
  model: LLM | null | undefined,
  settings: ModelSettings
): IntelligenceLevelValue {
  const levels = getIntelligenceLevels(provider, model);
  const saved = settings.reasoningEffort;
  if (isReasoningEffort(saved) && levels.some((level) => level.value === saved)) {
    return saved;
  }
  return levels.find((level) => level.value === "medium")?.value ??
    levels[0]?.value ??
    "medium";
}

/** Returns adjacent Intelligence settings, or null when that direction is unavailable. */
export function getAdjacentIntelligenceSettings(
  provider: ProviderId,
  model: LLM | null | undefined,
  settings: ModelSettings,
  direction: -1 | 1
): ModelSettings | null {
  const levels = getIntelligenceLevels(provider, model);
  const selectedValue = getSelectedIntelligenceLevel(provider, model, settings);
  const selectedIndex = levels.findIndex((level) => level.value === selectedValue);
  const nextIndex = selectedIndex + direction;

  return levels[nextIndex]?.settings ?? null;
}
