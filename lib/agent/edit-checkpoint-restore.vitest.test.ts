import { afterEach, describe, expect, it, vi } from "vitest";

import { restoreEditCheckpoint } from "@/lib/agent/edit-checkpoint-restore";
import { hashCheckpointPayload } from "@/lib/agent/edit-checkpoints";
import type { KernelService } from "@/lib/kernel/kernel-service";

/** Creates a valid one-target checkpoint API payload. */
function checkpoint() {
  const createdAt = "2026-08-13T12:00:00.000Z";
  return {
    id: "checkpoint-1",
    requestId: "request-1",
    localChatId: null,
    status: "completed" as const,
    summary: null,
    createdAt,
    updatedAt: createdAt,
    targets: [
      {
        id: "target-1",
        checkpointId: "checkpoint-1",
        kind: "text_file" as const,
        operation: "update" as const,
        path: "script.py",
        targetId: "script.py",
        beforeJson: JSON.stringify({ content: "before\n" }),
        afterJson: JSON.stringify({ content: "after\n" }),
        beforeHash: hashCheckpointPayload({ content: "before\n" }),
        afterHash: hashCheckpointPayload({ content: "after\n" }),
        firstToolCallId: null,
        lastToolCallId: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

/** Creates the minimal checkpoint ContentsManager contract. */
function kernelService() {
  const get = vi.fn().mockResolvedValue({ content: "after\n" });
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    service: {
      getContentsManager: () => ({ get, save }),
    } as unknown as KernelService,
    get,
    save,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("restoreEditCheckpoint editor safety", () => {
  it("skips a target when its dirty editor cannot be saved", async () => {
    const contents = kernelService();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ checkpoint: checkpoint() }),
      }),
    );
    const saveOpenDocumentIfDirty = vi.fn().mockResolvedValue({
      status: "error",
      message: "disk full",
    });

    const result = await restoreEditCheckpoint({
      kernelService: contents.service,
      requestId: "request-1",
      saveOpenDocumentIfDirty,
    });

    expect(saveOpenDocumentIfDirty).toHaveBeenCalledWith("script.py", "text");
    expect(contents.get).not.toHaveBeenCalled();
    expect(contents.save).not.toHaveBeenCalled();
    expect(result.conflicts[0]?.reason).toContain("disk full");
  });

  it("saves the open target before evaluating and restoring it", async () => {
    const contents = kernelService();
    const callOrder: string[] = [];
    contents.get.mockImplementation(async () => {
      callOrder.push("read-checkpoint-side");
      return { content: "after\n" };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
        return {
          ok: true,
          json: async () => ({ checkpoint: checkpoint() }),
        };
      }),
    );

    const result = await restoreEditCheckpoint({
      kernelService: contents.service,
      requestId: "request-1",
      saveOpenDocumentIfDirty: async () => {
        callOrder.push("save-editor");
        return { status: "saved" };
      },
    });

    expect(callOrder.slice(0, 2)).toEqual(["save-editor", "read-checkpoint-side"]);
    expect(contents.save).toHaveBeenCalledWith("script.py", {
      type: "file",
      format: "text",
      content: "before\n",
    });
    expect(result).toEqual({ restoredCount: 1, skippedCount: 0, conflicts: [] });
  });
});
