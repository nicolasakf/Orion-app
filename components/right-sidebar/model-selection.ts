import { DEFAULT_SELECTED_CHAT_MODEL_ID } from "@/lib/settings/defaults";
import { findModelBySelectionKey } from "@/lib/agent/model-selection-key";

const SESSION_MODEL_KEY = "orion:selectedModel";

/** Browser-tab fallback used only when no selected chat model is stored. */
export const SESSION_FALLBACK_CHAT_MODEL_ID = DEFAULT_SELECTED_CHAT_MODEL_ID;

export interface ModelSelectionOption {
  value: string;
  provider: string;
  /** When false, the user has no credential for this model's provider. */
  isAccessible?: boolean;
}

interface ResolveSelectedModelFallbackOptions {
  selectedModel: string;
  models: ModelSelectionOption[];
  modelsCatalogLoaded: boolean;
  settingsReady: boolean;
}

/** Reads the browser-tab selected chat model, falling back without mutating storage. */
export function loadSelectedModelFromSession(): string {
  if (typeof window === "undefined") return SESSION_FALLBACK_CHAT_MODEL_ID;

  try {
    const stored = window.sessionStorage.getItem(SESSION_MODEL_KEY);
    return stored || SESSION_FALLBACK_CHAT_MODEL_ID;
  } catch {
    return SESSION_FALLBACK_CHAT_MODEL_ID;
  }
}

/** Saves the selected chat model for the current browser tab. */
export function saveSelectedModelToSession(modelId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(SESSION_MODEL_KEY, modelId);
  } catch {
    // Losing session persistence is non-fatal; the UI can still use React state.
  }
}

/** First catalog model the user can use (provider credential configured). */
function findFirstAccessibleModel(models: ModelSelectionOption[]): string | null {
  return models.find((model) => model.isAccessible !== false)?.value ?? null;
}

/**
 * Resolves a replacement model only after every source that can validate a stored
 * selection has loaded, including settings-backed local endpoint models.
 * Prefers the first accessible model when the stored selection is missing or locked.
 */
export function resolveSelectedModelFallback({
  selectedModel,
  models,
  modelsCatalogLoaded,
  settingsReady,
}: ResolveSelectedModelFallbackOptions): string | null {
  if (!modelsCatalogLoaded || !settingsReady || models.length === 0) return null;

  const selected = findModelBySelectionKey(models, selectedModel);
  if (selected && selected.isAccessible !== false) return null;

  return findFirstAccessibleModel(models);
}
