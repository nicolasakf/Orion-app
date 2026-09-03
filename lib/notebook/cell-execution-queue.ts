import type { RunAllTriggerSource } from "@/lib/notebook/notebook-execution-events";

/** A single queued notebook cell execution request. */
export interface CellRunJob {
  indices: number[];
  stopOnError: boolean;
  /** Set when the batch was started from a toolbar run-all action. */
  triggerSource?: RunAllTriggerSource;
  /** Replaces an older pending automatic run with the same key. */
  coalesceKey?: string;
  /**
   * Optional per-index source used for kernel execution instead of the full
   * cell source. The notebook cell text is left unchanged.
   */
  sourceOverrides?: Record<number, string>;
}

/**
 * FIFO queue for serialized notebook cell runs.
 * Processing is driven externally; this class only tracks pending jobs and state.
 */
export class CellExecutionQueue {
  private jobs: CellRunJob[] = [];
  private processing = false;
  private clearGeneration = 0;

  /** Append a run request, replacing an older pending job with the same key. */
  enqueue(job: CellRunJob): void {
    if (job.coalesceKey) {
      this.jobs = this.jobs.filter(
        (pendingJob) => pendingJob.coalesceKey !== job.coalesceKey,
      );
    }
    this.jobs.push(job);
  }

  /** Remove and return the next job, or undefined when the queue is empty. */
  dequeue(): CellRunJob | undefined {
    return this.jobs.shift();
  }

  /** Drop pending jobs, invalidate the active batch, and return removed entries. */
  clear(): CellRunJob[] {
    this.clearGeneration += 1;
    const dropped = [...this.jobs];
    this.jobs = [];
    return dropped;
  }

  /** Monotonic token used by active batches to detect queue cancellation. */
  get cancellationGeneration(): number {
    return this.clearGeneration;
  }

  /** Number of jobs waiting to be processed. */
  get pendingCount(): number {
    return this.jobs.length;
  }

  /** Whether an external processor is currently executing a batch. */
  get isProcessing(): boolean {
    return this.processing;
  }

  /** Mark whether a batch processor loop is active. */
  setProcessing(value: boolean): void {
    this.processing = value;
  }

  /** True while a batch is running or jobs remain queued. */
  get isActive(): boolean {
    return this.processing || this.jobs.length > 0;
  }
}
