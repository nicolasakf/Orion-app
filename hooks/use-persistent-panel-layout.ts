"use client";

import * as React from "react";

import {
  DEFAULT_PANEL_LAYOUT_STATE,
  savePanelLayoutState,
  type PanelLayoutState,
} from "@/lib/ui-session-state";

interface PersistentPanelLayoutController {
  /** Last layout committed to React state for future panel-group remounts. */
  layout: PanelLayoutState;
  /** Replaces the controller state without persisting it, used during hydration. */
  restoreLayout: (layout: PanelLayoutState) => void;
  /** Enables or disables storage/state commits while panels are initialized imperatively. */
  setPersistenceEnabled: (enabled: boolean) => void;
  /** Tracks pointer dragging so live layout changes remain outside page-level React state. */
  handleResizeDragging: (isDragging: boolean) => void;
  /** Records the three-panel Pro horizontal layout. */
  handleHorizontalLayout: (sizes: number[]) => void;
  /** Records the two-panel Business horizontal layout. */
  handleBusinessHorizontalLayout: (sizes: number[]) => void;
  /** Records the editor/terminal vertical layout. */
  handleVerticalLayout: (sizes: number[]) => void;
}

/** Returns true when two numeric panel-size tuples contain the same values. */
function arePanelSizesEqual(
  current: readonly number[],
  next: readonly number[],
): boolean {
  return (
    current.length === next.length &&
    current.every((size, index) => size === next[index])
  );
}

/** Returns true when every persisted panel layout tuple is unchanged. */
function arePanelLayoutsEqual(
  current: PanelLayoutState,
  next: PanelLayoutState,
): boolean {
  return (
    arePanelSizesEqual(current.horizontal, next.horizontal) &&
    arePanelSizesEqual(current.businessHorizontal, next.businessHorizontal) &&
    arePanelSizesEqual(current.vertical, next.vertical)
  );
}

/** Returns true when every proposed panel size is a finite number. */
function areValidPanelSizes(sizes: number[], expectedLength: number): boolean {
  return sizes.length === expectedLength && sizes.every(Number.isFinite);
}

/**
 * Keeps high-frequency panel drag layouts in refs and commits only the final
 * pointer layout to React state and session storage.
 */
export function usePersistentPanelLayout(): PersistentPanelLayoutController {
  const [layout, setLayout] = React.useState<PanelLayoutState>(
    DEFAULT_PANEL_LAYOUT_STATE,
  );
  const latestLayoutRef = React.useRef<PanelLayoutState>(
    DEFAULT_PANEL_LAYOUT_STATE,
  );
  const isDraggingRef = React.useRef(false);
  const isDirtyRef = React.useRef(false);
  const persistenceEnabledRef = React.useRef(false);
  const preserveDirtyOnEnableRef = React.useRef(false);

  /** Commits the latest dirty layout once when persistence is active. */
  const commitLatestLayout = React.useCallback(() => {
    if (!persistenceEnabledRef.current || !isDirtyRef.current) return;

    const nextLayout = latestLayoutRef.current;
    isDirtyRef.current = false;
    setLayout((currentLayout) =>
      arePanelLayoutsEqual(currentLayout, nextLayout)
        ? currentLayout
        : nextLayout,
    );
    savePanelLayoutState(nextLayout);
  }, []);

  /** Records one valid tuple and immediately commits non-pointer changes. */
  const recordLayout = React.useCallback(
    <Key extends keyof PanelLayoutState>(
      key: Key,
      sizes: number[],
      expectedLength: PanelLayoutState[Key]["length"],
    ) => {
      if (!areValidPanelSizes(sizes, expectedLength)) return;

      const nextSizes = [...sizes] as unknown as PanelLayoutState[Key];
      if (arePanelSizesEqual(latestLayoutRef.current[key], nextSizes)) return;

      latestLayoutRef.current = {
        ...latestLayoutRef.current,
        [key]: nextSizes,
      };
      isDirtyRef.current = true;

      if (!isDraggingRef.current) {
        commitLatestLayout();
      }
    },
    [commitLatestLayout],
  );

  /** Restores a saved layout without treating hydration as a user change. */
  const restoreLayout = React.useCallback((restoredLayout: PanelLayoutState) => {
    latestLayoutRef.current = restoredLayout;
    isDirtyRef.current = false;
    preserveDirtyOnEnableRef.current = false;
    setLayout(restoredLayout);
  }, []);

  /** Controls whether layout changes may update React state and storage. */
  const setPersistenceEnabled = React.useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        preserveDirtyOnEnableRef.current = isDraggingRef.current;
        persistenceEnabledRef.current = false;
        return;
      }

      persistenceEnabledRef.current = enabled;
      if (!preserveDirtyOnEnableRef.current) {
        // Treat non-dragging hydration/collapse changes as the new live baseline.
        isDirtyRef.current = false;
        return;
      }

      preserveDirtyOnEnableRef.current = false;
      if (!isDraggingRef.current) {
        commitLatestLayout();
      }
    },
    [commitLatestLayout],
  );

  /** Defers pointer-driven commits until the resize handle reports release. */
  const handleResizeDragging = React.useCallback(
    (isDragging: boolean) => {
      isDraggingRef.current = isDragging;
      if (!isDragging) {
        commitLatestLayout();
      }
    },
    [commitLatestLayout],
  );

  const handleHorizontalLayout = React.useCallback(
    (sizes: number[]) => recordLayout("horizontal", sizes, 3),
    [recordLayout],
  );
  const handleBusinessHorizontalLayout = React.useCallback(
    (sizes: number[]) => recordLayout("businessHorizontal", sizes, 2),
    [recordLayout],
  );
  const handleVerticalLayout = React.useCallback(
    (sizes: number[]) => recordLayout("vertical", sizes, 2),
    [recordLayout],
  );

  return {
    layout,
    restoreLayout,
    setPersistenceEnabled,
    handleResizeDragging,
    handleHorizontalLayout,
    handleBusinessHorizontalLayout,
    handleVerticalLayout,
  };
}
