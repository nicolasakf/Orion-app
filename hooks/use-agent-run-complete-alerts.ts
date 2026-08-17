"use client";

import { useCallback } from "react";

import {
  alertAgentRunComplete,
  shouldAlertOnAgentTurnComplete,
  type AgentRunCompleteAlertSettings,
} from "@/lib/notifications/agent-run-complete";

export interface AgentTurnCompleteAlertParams {
  wasActive: boolean;
  isActive: boolean;
  userStopped: boolean;
  queuedMessageCount: number;
  chatTitle?: string | null;
  settings: AgentRunCompleteAlertSettings;
}

/**
 * Returns a callback that fires completion chime/notification when a full agent turn ends.
 */
export function useAgentRunCompleteAlerts() {
  return useCallback((params: AgentTurnCompleteAlertParams) => {
    if (
      !shouldAlertOnAgentTurnComplete({
        wasActive: params.wasActive,
        isActive: params.isActive,
        userStopped: params.userStopped,
        queuedMessageCount: params.queuedMessageCount,
      })
    ) {
      return;
    }

    const trimmedTitle = params.chatTitle?.trim();
    void alertAgentRunComplete({
      playSound: params.settings.playSoundOnAgentFinish,
      notify: params.settings.notifyOnAgentFinish,
      title: "Orion",
      body: trimmedTitle && trimmedTitle !== "New Chat" ? trimmedTitle : "Agent finished",
    });
  }, []);
}
