import type { RunAllTriggerSource } from "@/lib/notebook/notebook-execution-events";

/** A single queued notebook cell execution request. */
export interface CellRunJob {
  indices: number[];
  stopOnError: boolean;
  /** Set when the batch was started from a toolbar run-all action. */
  triggerSource?: RunAllTriggerSource;
}

/**
 * FIFO queue for serialized notebook cell runs.
 * Processing is driven externally; this class only tracks pending jobs and state.
 */
export class CellExecutionQueue {
  private jobs: CellRunJob[] = [];
  private processing = false;

  /** Append a run request to the tail of the queue. */
  enqueue(job: CellRunJob): void {
    this.jobs.push(job);
  }

  /** Remove and return the next job, or undefined when the queue is empty. */
  dequeue(): CellRunJob | undefined {
    return this.jobs.shift();
  }

  /** Drop all pending jobs and return the removed entries. */
  clear(): CellRunJob[] {
    const dropped = [...this.jobs];
    this.jobs = [];
    return dropped;
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
