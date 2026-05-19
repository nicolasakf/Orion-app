export interface PanelVisibilityState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  isFocusMode: boolean;
}

const PANEL_VISIBILITY_SESSION_KEY = "orion.panelVisibility";

export const DEFAULT_PANEL_VISIBILITY_STATE: PanelVisibilityState = {
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: true,
  isFocusMode: false,
};

/**
 * Reads transient app-shell panel visibility from the current browser tab.
 */
export function loadPanelVisibilityState(): PanelVisibilityState {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_VISIBILITY_STATE;
  }

  try {
    const raw = window.sessionStorage.getItem(PANEL_VISIBILITY_SESSION_KEY);
    if (!raw) return DEFAULT_PANEL_VISIBILITY_STATE;
    const parsed = JSON.parse(raw) as Partial<PanelVisibilityState>;
    return {
      leftCollapsed:
        typeof parsed.leftCollapsed === "boolean"
          ? parsed.leftCollapsed
          : DEFAULT_PANEL_VISIBILITY_STATE.leftCollapsed,
      rightCollapsed:
        typeof parsed.rightCollapsed === "boolean"
          ? parsed.rightCollapsed
          : DEFAULT_PANEL_VISIBILITY_STATE.rightCollapsed,
      bottomCollapsed:
        typeof parsed.bottomCollapsed === "boolean"
          ? parsed.bottomCollapsed
          : DEFAULT_PANEL_VISIBILITY_STATE.bottomCollapsed,
      isFocusMode:
        typeof parsed.isFocusMode === "boolean"
          ? parsed.isFocusMode
          : DEFAULT_PANEL_VISIBILITY_STATE.isFocusMode,
    };
  } catch {
    return DEFAULT_PANEL_VISIBILITY_STATE;
  }
}

/**
 * Stores transient app-shell panel visibility for the current browser tab.
 */
export function savePanelVisibilityState(state: PanelVisibilityState): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      PANEL_VISIBILITY_SESSION_KEY,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota/privacy failures; UI state can safely fall back.
  }
}
