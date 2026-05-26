import { DEFAULT_SELECTED_CHAT_MODEL_ID } from "@/lib/settings/defaults";

const SESSION_MODEL_KEY = "orion:selectedModel";

/** Browser-tab fallback used only when no selected chat model is stored. */
export const SESSION_FALLBACK_CHAT_MODEL_ID = DEFAULT_SELECTED_CHAT_MODEL_ID;

export interface ModelSelectionOption {
  value: string;
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

/**
 * Resolves a replacement model only after every source that can validate a stored
 * selection has loaded, including settings-backed local endpoint models.
 */
export function resolveSelectedModelFallback({
  selectedModel,
  models,
  modelsCatalogLoaded,
  settingsReady,
}: ResolveSelectedModelFallbackOptions): string | null {
  if (!modelsCatalogLoaded || !settingsReady || models.length === 0) return null;
  if (models.some((model) => model.value === selectedModel)) return null;

  return (
    models.find((model) => model.value === SESSION_FALLBACK_CHAT_MODEL_ID)?.value ??
    models[0]?.value ??
    null
  );
}
