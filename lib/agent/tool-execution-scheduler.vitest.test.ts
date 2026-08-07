import { describe, expect, it } from "vitest";

import {
  OrderedToolExecutionScheduler,
  isParallelReadOnlyTool,
  throwIfToolExecutionAborted,
} from "@/lib/agent/tool-execution-scheduler";
import {
  ORION_TOOL_NAMES,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

/** Deferred promise helper for deterministic scheduler tests. */
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("parallel read-only tool policy", () => {
  it("allows only the agreed read-only tools to overlap", () => {
    const parallelTools: OrionToolName[] = [
      "read_file",
      "read_notebook",
      "read_cell",
      "read_cell_output",
      "inspect_plotly_output",
      "list_kernels",
      "web_search",
      "web_fetch",
      "load_skill",
    ];
    expect(parallelTools.every(isParallelReadOnlyTool)).toBe(true);
    expect(
      new Set(ORION_TOOL_NAMES.filter(isParallelReadOnlyTool))
    ).toEqual(new Set(parallelTools));
  });
});

describe("OrderedToolExecutionScheduler", () => {
  it("accepts any positive integer without an upper concurrency cap", () => {
    expect(
      () => new OrderedToolExecutionScheduler(100_000)
    ).not.toThrow();
    for (const invalidValue of [0, -1, 1.5, Number.NaN]) {
      expect(
        () => new OrderedToolExecutionScheduler(invalidValue)
      ).toThrow("positive integer");
    }
  });

  it("runs at most the configured number of reads concurrently", async () => {
    const scheduler = new OrderedToolExecutionScheduler(10);
    const gates = Array.from({ length: 12 }, () => deferred());
    let active = 0;
    let maxActive = 0;

    const calls = gates.map((gate) =>
      scheduler.schedule("read_file", async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(10);
    gates.slice(0, 10).forEach((gate) => gate.resolve());
    await Promise.all(calls.slice(0, 10));
    await Promise.resolve();
    expect(maxActive).toBe(10);
    gates.slice(10).forEach((gate) => gate.resolve());
    await Promise.all(calls);
  });

  it("uses one as a fully sequential concurrency setting", async () => {
    const scheduler = new OrderedToolExecutionScheduler(1);
    const firstGate = deferred();
    const starts: string[] = [];
    const first = scheduler.schedule("web_fetch", async () => {
      starts.push("first");
      await firstGate.promise;
    });
    const second = scheduler.schedule("web_fetch", async () => {
      starts.push("second");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(starts).toEqual(["first"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(starts).toEqual(["first", "second"]);
  });

  it("reserves a released read slot for an existing waiter", async () => {
    const scheduler = new OrderedToolExecutionScheduler(1);
    const firstGate = deferred();
    const thirdGate = deferred();
    const thirdStarted = deferred();
    let active = 0;
    let maxActive = 0;
    let thirdCall: Promise<void> | undefined;

    const enter = () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
    };
    const leave = () => {
      active -= 1;
    };

    const first = scheduler.schedule("read_file", async () => {
      enter();
      await firstGate.promise;
      queueMicrotask(() => {
        thirdCall = scheduler.schedule("read_file", async () => {
          enter();
          thirdStarted.resolve();
          await thirdGate.promise;
          leave();
        });
      });
      leave();
    });
    const second = scheduler.schedule("read_file", async () => {
      enter();
      leave();
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(1);

    firstGate.resolve();
    await first;
    await thirdStarted.promise;
    await Promise.resolve();
    const observedMax = maxActive;

    thirdGate.resolve();
    if (!thirdCall) throw new Error("third read was not scheduled");
    await Promise.all([second, thirdCall]);

    expect(observedMax).toBe(1);
  });

  it("preserves barriers between parallel read waves", async () => {
    const scheduler = new OrderedToolExecutionScheduler(10);
    const firstReadGate = deferred();
    const events: string[] = [];

    const firstRead = scheduler.schedule("read_file", async () => {
      events.push("read-a:start");
      await firstReadGate.promise;
      events.push("read-a:end");
    });
    const siblingRead = scheduler.schedule("web_fetch", async () => {
      events.push("read-b");
    });
    const edit = scheduler.schedule("edit_file", async () => {
      events.push("edit");
    });
    const laterRead = scheduler.schedule("read_file", async () => {
      events.push("read-c");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toContain("read-a:start");
    expect(events).toContain("read-b");
    expect(events).not.toContain("edit");
    firstReadGate.resolve();
    await Promise.all([firstRead, siblingRead, edit, laterRead]);
    expect(events.indexOf("edit")).toBeGreaterThan(events.indexOf("read-a:end"));
    expect(events.indexOf("read-c")).toBeGreaterThan(events.indexOf("edit"));
  });

  it("continues through barriers after a sibling read fails", async () => {
    const scheduler = new OrderedToolExecutionScheduler(10);
    const events: string[] = [];
    const failedRead = scheduler.schedule("read_file", async () => {
      throw new Error("read failed");
    });
    const successfulRead = scheduler.schedule("read_file", async () => {
      events.push("read");
    });
    const barrier = scheduler.schedule("bash", async () => {
      events.push("barrier");
    });

    await expect(failedRead).rejects.toThrow("read failed");
    await Promise.all([successfulRead, barrier]);
    expect(events).toEqual(["read", "barrier"]);
  });

  it("does not start queued reads after cancellation", async () => {
    const controller = new AbortController();
    const scheduler = new OrderedToolExecutionScheduler(1, controller.signal);
    const firstGate = deferred();
    let secondStarted = false;
    const first = scheduler.schedule("read_file", async () => {
      await firstGate.promise;
    });
    const second = scheduler.schedule("read_file", async () => {
      secondStarted = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    firstGate.resolve();
    await first;
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(secondStarted).toBe(false);
  });

  it("hands dispatched work to a replacement while cancelling queued work", async () => {
    const outgoingController = new AbortController();
    const outgoing = new OrderedToolExecutionScheduler(
      10,
      outgoingController.signal
    );
    const runningGate = deferred();
    const runningStarted = deferred();
    const events: string[] = [];

    const running = outgoing.schedule("edit_file", async () => {
      events.push("outgoing:start");
      runningStarted.resolve();
      await runningGate.promise;
      events.push("outgoing:end");
      throwIfToolExecutionAborted(outgoingController.signal);
    });
    const queued = outgoing.schedule("edit_file", async () => {
      events.push("outgoing:queued");
    });
    const runningOutcome = running.catch((error: unknown) => error);
    const queuedOutcome = queued.catch((error: unknown) => error);

    await runningStarted.promise;
    outgoingController.abort();

    const replacement = new OrderedToolExecutionScheduler(
      10,
      new AbortController().signal,
      outgoing.drain()
    );
    const replacementCall = replacement.schedule("edit_file", async () => {
      events.push("replacement");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["outgoing:start"]);

    runningGate.resolve();
    const [runningError, queuedError] = await Promise.all([
      runningOutcome,
      queuedOutcome,
    ]);
    await replacementCall;

    expect(runningError).toMatchObject({ name: "AbortError" });
    expect(queuedError).toMatchObject({ name: "AbortError" });
    expect(events).toEqual([
      "outgoing:start",
      "outgoing:end",
      "replacement",
    ]);
  });

  it("includes the final parallel read wave in a drain barrier", async () => {
    const outgoing = new OrderedToolExecutionScheduler(10);
    const readGate = deferred();
    const readStarted = deferred();
    const events: string[] = [];

    const read = outgoing.schedule("read_file", async () => {
      events.push("read:start");
      readStarted.resolve();
      await readGate.promise;
      events.push("read:end");
    });
    await readStarted.promise;

    const replacement = new OrderedToolExecutionScheduler(
      10,
      undefined,
      outgoing.drain()
    );
    const edit = replacement.schedule("edit_file", async () => {
      events.push("edit");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["read:start"]);

    readGate.resolve();
    await Promise.all([read, edit]);
    expect(events).toEqual(["read:start", "read:end", "edit"]);
  });
});
