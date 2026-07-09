export const PINNED_MODELS_CHANGED_EVENT = "orion:pinned-models-changed";

/** Notifies listeners that pinned chat models changed and selector lists should refresh. */
export function dispatchPinnedModelsChanged(): void {
  window.dispatchEvent(new CustomEvent(PINNED_MODELS_CHANGED_EVENT));
}
