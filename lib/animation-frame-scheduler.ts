export interface AnimationFrameScheduler {
  /** Queues the callback unless one is already pending for the next frame. */
  schedule: () => void;
  /** Cancels the pending callback, if any. */
  cancel: () => void;
}

/**
 * Creates a single-flight animation-frame scheduler for high-frequency browser
 * observers. A callback may schedule itself again after the current frame runs.
 */
export function createAnimationFrameScheduler(
  callback: () => void,
): AnimationFrameScheduler {
  let frameId: number | null = null;

  const schedule = () => {
    if (frameId !== null) return;

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      callback();
    });
  };

  const cancel = () => {
    if (frameId === null) return;
    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  return { schedule, cancel };
}
