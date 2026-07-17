import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnimationFrameScheduler } from "@/lib/animation-frame-scheduler";

let nextFrameId = 1;
let frameCallbacks = new Map<number, FrameRequestCallback>();

/** Runs and removes the currently pending animation-frame callbacks. */
function flushAnimationFrame(): void {
  const callbacks = [...frameCallbacks.values()];
  frameCallbacks.clear();
  callbacks.forEach((callback) => callback(0));
}

beforeEach(() => {
  nextFrameId = 1;
  frameCallbacks = new Map();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((frameId: number) => {
      frameCallbacks.delete(frameId);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAnimationFrameScheduler", () => {
  it("coalesces repeated schedules within one frame", () => {
    const callback = vi.fn();
    const scheduler = createAnimationFrameScheduler(callback);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    flushAnimationFrame();
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    flushAnimationFrame();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("cancels pending work and allows a later schedule", () => {
    const callback = vi.fn();
    const scheduler = createAnimationFrameScheduler(callback);

    scheduler.schedule();
    scheduler.cancel();
    flushAnimationFrame();
    expect(callback).not.toHaveBeenCalled();

    scheduler.schedule();
    flushAnimationFrame();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
