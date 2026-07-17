import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistentPanelLayout } from "@/hooks/use-persistent-panel-layout";
import * as uiSessionState from "@/lib/ui-session-state";
import type { PanelLayoutState } from "@/lib/ui-session-state";

const RESTORED_LAYOUT: PanelLayoutState = {
  horizontal: [20, 55, 25],
  businessHorizontal: [62, 38],
  vertical: [75, 25],
};

/** Restores a known layout and enables user-driven persistence. */
function initializeController(
  controller: ReturnType<typeof usePersistentPanelLayout>,
): void {
  controller.restoreLayout(RESTORED_LAYOUT);
  controller.setPersistenceEnabled(true);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePersistentPanelLayout", () => {
  it("commits only the latest layout once when pointer dragging ends", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => initializeController(result.current));
    act(() => {
      result.current.handleResizeDragging(true);
      result.current.handleHorizontalLayout([18, 57, 25]);
      result.current.handleHorizontalLayout([16, 59, 25]);
    });

    expect(result.current.layout).toEqual(RESTORED_LAYOUT);
    expect(saveSpy).not.toHaveBeenCalled();

    act(() => result.current.handleResizeDragging(false));

    expect(result.current.layout.horizontal).toEqual([16, 59, 25]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({
      ...RESTORED_LAYOUT,
      horizontal: [16, 59, 25],
    });
  });

  it("does not persist a pointer interaction without movement", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => initializeController(result.current));
    act(() => {
      result.current.handleResizeDragging(true);
      result.current.handleResizeDragging(false);
    });

    expect(result.current.layout).toEqual(RESTORED_LAYOUT);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("immediately commits keyboard and imperative layout changes", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => initializeController(result.current));
    act(() => result.current.handleVerticalLayout([70, 30]));

    expect(result.current.layout.vertical).toEqual([70, 30]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("treats persistence-disabled hydration changes as an unpersisted baseline", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => {
      result.current.restoreLayout(RESTORED_LAYOUT);
      result.current.setPersistenceEnabled(false);
      result.current.handleHorizontalLayout([0, 75, 25]);
      result.current.setPersistenceEnabled(true);
    });

    expect(result.current.layout).toEqual(RESTORED_LAYOUT);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("preserves a dirty drag across a temporary persistence pause", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => initializeController(result.current));
    act(() => {
      result.current.handleResizeDragging(true);
      result.current.handleHorizontalLayout([10, 65, 25]);
      result.current.setPersistenceEnabled(false);
      result.current.handleResizeDragging(false);
      result.current.setPersistenceEnabled(true);
    });

    expect(result.current.layout.horizontal).toEqual([10, 65, 25]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed and non-finite layout tuples", () => {
    const saveSpy = vi.spyOn(uiSessionState, "savePanelLayoutState");
    const { result } = renderHook(() => usePersistentPanelLayout());

    act(() => initializeController(result.current));
    act(() => {
      result.current.handleHorizontalLayout([50, 50]);
      result.current.handleBusinessHorizontalLayout([Number.NaN, 40]);
      result.current.handleVerticalLayout([100, Number.POSITIVE_INFINITY]);
    });

    expect(result.current.layout).toEqual(RESTORED_LAYOUT);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
