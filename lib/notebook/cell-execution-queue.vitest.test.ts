import { describe, expect, it } from "vitest";

import { CellExecutionQueue } from "@/lib/notebook/cell-execution-queue";

describe("CellExecutionQueue", () => {
  it("dequeues jobs in FIFO order", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({ indices: [0], stopOnError: true });
    queue.enqueue({ indices: [1, 2], stopOnError: false });

    expect(queue.dequeue()).toEqual({ indices: [0], stopOnError: true });
    expect(queue.dequeue()).toEqual({ indices: [1, 2], stopOnError: false });
    expect(queue.dequeue()).toBeUndefined();
  });

  it("tracks pending count and active state", () => {
    const queue = new CellExecutionQueue();

    expect(queue.pendingCount).toBe(0);
    expect(queue.isActive).toBe(false);

    queue.enqueue({ indices: [0], stopOnError: true });
    expect(queue.pendingCount).toBe(1);
    expect(queue.isActive).toBe(true);

    queue.setProcessing(true);
    expect(queue.isActive).toBe(true);

    queue.dequeue();
    expect(queue.pendingCount).toBe(0);
    expect(queue.isActive).toBe(true);

    queue.setProcessing(false);
    expect(queue.isActive).toBe(false);
  });

  it("clear removes pending jobs and advances cancellation generation", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({ indices: [0], stopOnError: true });
    queue.enqueue({ indices: [1], stopOnError: true });
    const initialGeneration = queue.cancellationGeneration;

    const dropped = queue.clear();

    expect(dropped).toEqual([
      { indices: [0], stopOnError: true },
      { indices: [1], stopOnError: true },
    ]);
    expect(queue.cancellationGeneration).toBe(initialGeneration + 1);
    expect(queue.pendingCount).toBe(0);
    expect(queue.dequeue()).toBeUndefined();

    expect(queue.clear()).toEqual([]);
    expect(queue.cancellationGeneration).toBe(initialGeneration + 2);
  });

  it("replaces an older pending job with the same coalescing key", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({
      indices: [0],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });
    queue.enqueue({ indices: [1], stopOnError: true });
    queue.enqueue({
      indices: [2],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });

    expect(queue.pendingCount).toBe(2);
    expect(queue.dequeue()).toEqual({ indices: [1], stopOnError: true });
    expect(queue.dequeue()).toEqual({
      indices: [2],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });
  });

  it("keeps pending jobs with different coalescing keys", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({
      indices: [0],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });
    queue.enqueue({
      indices: [1],
      stopOnError: true,
      coalesceKey: "orion-ui:b",
    });

    expect(queue.pendingCount).toBe(2);
    expect(queue.dequeue()?.indices).toEqual([0]);
    expect(queue.dequeue()?.indices).toEqual([1]);
  });

  it("retains only one keyed rerun while another job is active", () => {
    const queue = new CellExecutionQueue();
    queue.setProcessing(true);
    queue.enqueue({
      indices: [0],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });
    queue.enqueue({
      indices: [1],
      stopOnError: true,
      coalesceKey: "orion-ui:a",
    });

    expect(queue.isProcessing).toBe(true);
    expect(queue.pendingCount).toBe(1);
    expect(queue.dequeue()?.indices).toEqual([1]);
  });

  it("preserves sourceOverrides when dequeuing a job", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({
      indices: [2],
      stopOnError: true,
      sourceOverrides: { 2: "print(1)" },
    });

    expect(queue.dequeue()).toEqual({
      indices: [2],
      stopOnError: true,
      sourceOverrides: { 2: "print(1)" },
    });
  });
});
