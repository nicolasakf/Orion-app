import { describe, expect, it, vi } from "vitest";

import type { KernelService } from "@/lib/kernel/kernel-service";
import { runCells } from "@/lib/notebook/cell-executor";

describe("runCells cancellation", () => {
  it("does not start another cell after cancellation", async () => {
    let resolveFirstExecution: (() => void) | undefined;
    const firstExecution = new Promise<void>((resolve) => {
      resolveFirstExecution = resolve;
    });
    let executionCount = 0;
    const execute = vi.fn(async () => {
      executionCount += 1;
      return {
        done: executionCount === 1 ? firstExecution : Promise.resolve(),
      };
    });
    const kernelService = { execute } as unknown as KernelService;
    let shouldContinue = true;

    const runPromise = runCells({
      kernelService,
      cells: [
        { index: 0, source: "first" },
        { index: 1, source: "second" },
      ],
      stopOnError: false,
      shouldContinue: () => shouldContinue,
    });

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    shouldContinue = false;
    resolveFirstExecution?.();

    const result = await runPromise;
    expect(execute).toHaveBeenCalledTimes(1);
    expect([...result.results.keys()]).toEqual([0]);
    expect(result).toMatchObject({ success: false, cancelled: true });
  });

  it("classifies an aborted in-flight cell as cancelled", async () => {
    let resolveExecution: (() => void) | undefined;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });
    let emitAbortReply: (() => void) | undefined;
    const execute = vi.fn(
      async (
        _source: string,
        onMessage?: (message: {
          header: { msg_type: string };
          content: Record<string, unknown>;
        }) => void,
      ) => {
        emitAbortReply = () =>
          onMessage?.({
            header: { msg_type: "execute_reply" },
            content: { status: "abort", execution_count: null },
          });
        return { done: execution };
      },
    );
    const kernelService = { execute } as unknown as KernelService;
    let shouldContinue = true;

    const runPromise = runCells({
      kernelService,
      cells: [
        { index: 0, source: "first" },
        { index: 1, source: "second" },
      ],
      stopOnError: true,
      shouldContinue: () => shouldContinue,
    });

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    shouldContinue = false;
    emitAbortReply?.();
    resolveExecution?.();

    const result = await runPromise;
    expect(execute).toHaveBeenCalledTimes(1);
    expect([...result.results.keys()]).toEqual([0]);
    expect(result).toMatchObject({ success: false, cancelled: true });
  });
});
