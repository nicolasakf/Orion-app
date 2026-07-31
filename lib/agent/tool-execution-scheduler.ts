import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { isParallelReadOnlyTool } from "@/lib/agent/tool-execution-policy";

export {
  PARALLEL_READ_ONLY_TOOLS,
  isParallelReadOnlyTool,
} from "@/lib/agent/tool-execution-policy";

/** Error used when queued work belongs to a cancelled agent turn. */
export function createToolExecutionAbortError(): DOMException {
  return new DOMException("Tool execution was cancelled.", "AbortError");
}

/** Throws before starting tool work when its owning turn has been cancelled. */
export function throwIfToolExecutionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createToolExecutionAbortError();
  }
}

/**
 * Schedules tool calls in model-emitted order.
 *
 * Consecutive parallel-safe reads share a bounded wave. Every other tool is a
 * barrier: it waits for the preceding read wave and blocks later reads until it
 * completes. Each scheduler belongs to one agent turn/run.
 */
export class OrderedToolExecutionScheduler {
  private barrierTail: Promise<void>;
  private currentReadWave = new Set<Promise<unknown>>();
  private activeReadCount = 0;
  private readonly readWaiters: Array<{
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];

  constructor(
    private readonly maxParallelReadOnlyCalls: number,
    private readonly signal?: AbortSignal,
    initialBarrier?: Promise<unknown>
  ) {
    if (
      !Number.isInteger(maxParallelReadOnlyCalls) ||
      maxParallelReadOnlyCalls < 1
    ) {
      throw new Error(
        "maxParallelReadOnlyCalls must be a positive integer."
      );
    }
    this.barrierTail = initialBarrier
      ? initialBarrier.then(
          () => undefined,
          () => undefined
        )
      : Promise.resolve();
    signal?.addEventListener(
      "abort",
      () => {
        const error = createToolExecutionAbortError();
        for (const waiter of this.readWaiters.splice(0)) {
          waiter.reject(error);
        }
      },
      { once: true }
    );
  }

  /**
   * Return a non-rejecting barrier for all work scheduled so far.
   *
   * The caller must stop scheduling on this instance before taking the
   * snapshot. A replacement scheduler can use the result as its initial
   * barrier so already-dispatched work cannot overlap the next agent turn.
   */
  drain(): Promise<void> {
    return Promise.allSettled([
      this.barrierTail,
      ...this.currentReadWave,
    ]).then(() => undefined);
  }

  /**
   * Queue one tool call and resolve with its result.
   *
   * @param toolName - Model-facing Orion tool name.
   * @param task - Work started only after ordering and concurrency gates pass.
   * @returns The tool result or the task's original error.
   */
  schedule<T>(
    toolName: OrionToolName,
    task: () => Promise<T>
  ): Promise<T> {
    if (isParallelReadOnlyTool(toolName)) {
      const scheduled = this.barrierTail.then(() =>
        this.runParallelRead(task)
      );
      this.currentReadWave.add(scheduled);
      void scheduled.then(
        () => this.currentReadWave.delete(scheduled),
        () => this.currentReadWave.delete(scheduled)
      );
      return scheduled;
    }

    const precedingReads = [...this.currentReadWave];
    this.currentReadWave.clear();
    const priorBarrier = this.barrierTail;
    const ready = Promise.allSettled([
      priorBarrier,
      ...precedingReads,
    ]).then(() => undefined);
    const scheduled = ready.then(async () => {
      throwIfToolExecutionAborted(this.signal);
      return task();
    });
    this.barrierTail = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
  }

  /** Run a read after both a semaphore slot and cancellation check succeed. */
  private async runParallelRead<T>(
    task: () => Promise<T>
  ): Promise<T> {
    await this.acquireReadSlot();
    try {
      throwIfToolExecutionAborted(this.signal);
      return await task();
    } finally {
      this.releaseReadSlot();
    }
  }

  /** Wait for one configured parallel-read slot. */
  private async acquireReadSlot(): Promise<void> {
    throwIfToolExecutionAborted(this.signal);
    if (this.activeReadCount < this.maxParallelReadOnlyCalls) {
      this.activeReadCount += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.readWaiters.push({ resolve, reject });
    });
    try {
      throwIfToolExecutionAborted(this.signal);
    } catch (error) {
      // The released permit was reserved for this waiter. Return it if the
      // owning turn was cancelled before the waiter could start.
      this.releaseReadSlot();
      throw error;
    }
  }

  /** Release a read slot and wake the next queued read. */
  private releaseReadSlot(): void {
    const waiter = this.readWaiters.shift();
    if (waiter) {
      // Transfer the active permit directly so a newly scheduled read cannot
      // steal the slot before the existing waiter resumes.
      waiter.resolve();
      return;
    }
    this.activeReadCount = Math.max(0, this.activeReadCount - 1);
  }
}
