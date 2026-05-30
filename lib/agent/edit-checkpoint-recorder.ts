import {
  hashCheckpointPayload,
  type EditCheckpointStatus,
  type RecordEditCheckpointTargetRequest,
} from "@/lib/agent/edit-checkpoints";

export interface EditCheckpointContext {
  modelRequestId?: string;
  chatId?: string | null;
  toolCallId?: string;
}

export interface EditCheckpointRecorder {
  recordTarget: (
    target: Omit<
      RecordEditCheckpointTargetRequest,
      "requestId" | "localChatId" | "toolCallId"
    >,
    context?: EditCheckpointContext
  ) => Promise<void>;
  updateStatus: (
    status: EditCheckpointStatus,
    context?: Pick<EditCheckpointContext, "modelRequestId">
  ) => Promise<void>;
}

/** No-op recorder used when a request has no modelRequestId. */
export const nullEditCheckpointRecorder: EditCheckpointRecorder = {
  recordTarget: async () => {},
  updateStatus: async () => {},
};

/** Browser-side recorder that persists checkpoint records through API routes. */
export class ApiEditCheckpointRecorder implements EditCheckpointRecorder {
  /**
   * Record one target after a tool save succeeds.
   */
  async recordTarget(
    target: Omit<
      RecordEditCheckpointTargetRequest,
      "requestId" | "localChatId" | "toolCallId"
    >,
    context?: EditCheckpointContext
  ): Promise<void> {
    if (!context?.modelRequestId) return;

    const beforeHash = target.beforeHash ?? hashCheckpointPayload(target.before);
    const afterHash = target.afterHash ?? hashCheckpointPayload(target.after);

    try {
      await fetch("/api/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          requestId: context.modelRequestId,
          localChatId: context.chatId ?? undefined,
          toolCallId: context.toolCallId,
          beforeHash,
          afterHash,
        }),
      });
    } catch (error) {
      console.warn("Failed to record edit checkpoint:", error);
    }
  }

  /** Mark the request checkpoint completed, interrupted, reverted, or open. */
  async updateStatus(
    status: EditCheckpointStatus,
    context?: Pick<EditCheckpointContext, "modelRequestId">
  ): Promise<void> {
    if (!context?.modelRequestId) return;

    try {
      await fetch(`/api/checkpoints/${encodeURIComponent(context.modelRequestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.warn("Failed to update edit checkpoint status:", error);
    }
  }
}
