import {
  findModelBySelectionKey,
  resolveCatalogModelIdForApi,
} from "@/lib/agent/model-selection-key";

import type { LLM, ModelSettingsMap } from "./types";

export type SubagentExecutionModelResolution =
  | {
      ok: true;
      modelId: string;
      providerId: LLM["provider"];
      modelSettings: Record<string, unknown> | undefined;
    }
  | {
      ok: false;
      errorText: string;
    };

/**
 * Resolve the concrete model/provider for a sub-agent run, honoring an optional
 * notebook-declared model while preserving the parent chat model by default.
 */
export function resolveSubagentExecutionModel(options: {
  subagentName: string;
  configuredModelId?: string;
  selectedModelId: string;
  parentModel: LLM | undefined;
  modelsWithAccess: LLM[];
  modelSettingsMap: ModelSettingsMap;
}): SubagentExecutionModelResolution {
  const {
    subagentName,
    configuredModelId,
    selectedModelId,
    parentModel,
    modelsWithAccess,
    modelSettingsMap,
  } = options;

  if (!parentModel?.provider || !selectedModelId) {
    return { ok: false, errorText: "delegate tool requires an active model selection." };
  }

  if (configuredModelId) {
    const configuredModel = findModelBySelectionKey(modelsWithAccess, configuredModelId);

    if (!configuredModel) {
      return {
        ok: false,
        errorText: `Sub-agent "${subagentName}" is configured to use model "${configuredModelId}", but that model is not available in this account.`,
      };
    }

    if (configuredModel.isAccessible === false) {
      return {
        ok: false,
        errorText: `Sub-agent "${subagentName}" is configured to use model "${configuredModelId}", but the matching provider credential is not configured.`,
      };
    }

    return {
      ok: true,
      modelId: configuredModel.value,
      providerId: configuredModel.provider,
      modelSettings: modelSettingsMap[configuredModel.value] as Record<string, unknown> | undefined,
    };
  }

  return {
    ok: true,
    modelId: resolveCatalogModelIdForApi(selectedModelId, parentModel),
    providerId: parentModel.provider,
    modelSettings: modelSettingsMap[selectedModelId] as Record<string, unknown> | undefined,
  };
}
