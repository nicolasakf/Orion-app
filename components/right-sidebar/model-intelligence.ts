import type { ProviderId } from "@/lib/agent/model-gateway-types";

import type {
  AnthropicModelSettings,
  LLM,
  ModelSettings,
  OpenAIModelSettings,
} from "./types";

export type IntelligenceLevelValue =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "extra-high"
  | "max";

export interface IntelligenceLevelOption {
  value: IntelligenceLevelValue;
  label: string;
  shortLabel: string;
  settings: ModelSettings;
}

const OPENAI_INTELLIGENCE_LEVELS: IntelligenceLevelOption[] = [
  {
    value: "low",
    label: "Low",
    shortLabel: "Low",
    settings: { reasoningEffort: "low" } satisfies OpenAIModelSettings,
  },
  {
    value: "medium",
    label: "Medium",
    shortLabel: "Med",
    settings: { reasoningEffort: "medium" } satisfies OpenAIModelSettings,
  },
  {
    value: "high",
    label: "High",
    shortLabel: "High",
    settings: { reasoningEffort: "high" } satisfies OpenAIModelSettings,
  },
  {
    value: "xhigh",
    label: "Extra High",
    shortLabel: "XHigh",
    settings: { reasoningEffort: "xhigh" } satisfies OpenAIModelSettings,
  },
];

const ANTHROPIC_INTELLIGENCE_LEVELS: IntelligenceLevelOption[] = [
  {
    value: "low",
    label: "Low",
    shortLabel: "Low",
    settings: {
      extendedThinking: false,
      thinkingBudgetTokens: 1000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "medium",
    label: "Medium",
    shortLabel: "Med",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 10000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "high",
    label: "High",
    shortLabel: "High",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 25000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "extra-high",
    label: "Extra High",
    shortLabel: "XHigh",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 50000,
    } satisfies AnthropicModelSettings,
  },
  {
    value: "max",
    label: "Max",
    shortLabel: "Max",
    settings: {
      extendedThinking: true,
      thinkingBudgetTokens: 100000,
    } satisfies AnthropicModelSettings,
  },
];

/** Returns the intelligence levels supported by a provider/model combination. */
export function getIntelligenceLevels(
  provider: ProviderId,
  model: LLM | null | undefined
): IntelligenceLevelOption[] {
  if (provider === "openai") {
    const modelId = (model?.apiModelId ?? model?.value ?? "").toLowerCase();
    if (modelId.includes("nano") || modelId.includes("mini")) {
      return OPENAI_INTELLIGENCE_LEVELS.slice(0, 3);
    }
    return OPENAI_INTELLIGENCE_LEVELS;
  }

  if (provider === "anthropic") return ANTHROPIC_INTELLIGENCE_LEVELS;

  return [];
}

/** Reads the active intelligence level from provider-specific model settings. */
export function getSelectedIntelligenceLevel(
  provider: ProviderId,
  settings: ModelSettings
): IntelligenceLevelValue {
  if (provider === "openai") {
    return (settings as OpenAIModelSettings).reasoningEffort ?? "medium";
  }

  if (provider === "anthropic") {
    const anthropicSettings = settings as AnthropicModelSettings;
    if (anthropicSettings.extendedThinking === false) return "low";

    const budget = anthropicSettings.thinkingBudgetTokens ?? 10000;
    if (budget >= 100000) return "max";
    if (budget >= 50000) return "extra-high";
    if (budget >= 25000) return "high";
    return "medium";
  }

  return "medium";
}

/** Returns adjacent intelligence settings, or null when that direction is unavailable. */
export function getAdjacentIntelligenceSettings(
  provider: ProviderId,
  model: LLM | null | undefined,
  settings: ModelSettings,
  direction: -1 | 1
): ModelSettings | null {
  const levels = getIntelligenceLevels(provider, model);
  const selectedValue = getSelectedIntelligenceLevel(provider, settings);
  const selectedIndex = levels.findIndex((level) => level.value === selectedValue);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : levels.length - 1;
  const nextIndex = currentIndex + direction;

  return levels[nextIndex]?.settings ?? null;
}
