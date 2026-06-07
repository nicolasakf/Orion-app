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

  it("clear returns and removes all pending jobs", () => {
    const queue = new CellExecutionQueue();
    queue.enqueue({ indices: [0], stopOnError: true });
    queue.enqueue({ indices: [1], stopOnError: true });

    const dropped = queue.clear();

    expect(dropped).toEqual([
      { indices: [0], stopOnError: true },
      { indices: [1], stopOnError: true },
    ]);
    expect(queue.pendingCount).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });
});
