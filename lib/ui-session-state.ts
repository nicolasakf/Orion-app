export interface PanelVisibilityState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  isFocusMode: boolean;
}

export interface PanelLayoutState {
  horizontal: [number, number, number];
  vertical: [number, number];
}

const PANEL_VISIBILITY_SESSION_KEY = "orion.panelVisibility";
const PANEL_LAYOUT_SESSION_KEY = "orion.panelLayout";

export const DEFAULT_PANEL_VISIBILITY_STATE: PanelVisibilityState = {
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: true,
  isFocusMode: false,
};

export const DEFAULT_PANEL_LAYOUT_STATE: PanelLayoutState = {
  horizontal: [15, 50, 20],
  vertical: [70, 30],
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

function parsePanelSizeTuple<T extends number>(
  value: unknown,
  length: number,
  fallback: T[]
): T[] {
  if (!Array.isArray(value) || value.length !== length) {
    return fallback;
  }

  const parsed = value.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : Number.NaN
  );
  if (parsed.some((entry) => Number.isNaN(entry))) {
    return fallback;
  }

  return parsed as T[];
}

/**
 * Reads transient app-shell panel sizes from the current browser tab.
 */
export function loadPanelLayoutState(): PanelLayoutState {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_LAYOUT_STATE;
  }

  try {
    const raw = window.sessionStorage.getItem(PANEL_LAYOUT_SESSION_KEY);
    if (!raw) return DEFAULT_PANEL_LAYOUT_STATE;
    const parsed = JSON.parse(raw) as Partial<PanelLayoutState>;
    return {
      horizontal: parsePanelSizeTuple(
        parsed.horizontal,
        3,
        DEFAULT_PANEL_LAYOUT_STATE.horizontal
      ) as [number, number, number],
      vertical: parsePanelSizeTuple(
        parsed.vertical,
        2,
        DEFAULT_PANEL_LAYOUT_STATE.vertical
      ) as [number, number],
    };
  } catch {
    return DEFAULT_PANEL_LAYOUT_STATE;
  }
}

/**
 * Stores transient app-shell panel sizes for the current browser tab.
 */
export function savePanelLayoutState(state: PanelLayoutState): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      PANEL_LAYOUT_SESSION_KEY,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota/privacy failures; UI state can safely fall back.
  }
}
