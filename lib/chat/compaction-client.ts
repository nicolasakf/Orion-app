/**
 * Client-side helper for the `origin: "compaction"` server endpoint.
 * Mirrors the title-generation fetch in right-sidebar.tsx.
 */

import type { UIMessage } from "ai";
import type { AgentContextSettings } from "@/lib/settings/schema";
import type { ProviderId } from "@/lib/agent/model-gateway-types";

export interface CompactionApiResult {
  summaryText: string;
  tokensUsed: number;
  coversThrough: string;
}

/**
 * Send older conversation turns to the server's compaction endpoint and
 * receive a plain-text summary.
 *
 * @param messages - The subset of messages to summarize (older turns only).
 * @param previousSummaryText - If a prior summary exists, pass it here so the
 *   server can extend it rather than re-summarize from scratch.
 * @param contextSettings - The user's context settings. Without these the server
 *   fits summary chunks against the default threshold, silently ignoring a
 *   threshold the user lowered.
 */
export async function callCompactionApi(
  messages: UIMessage[],
  previousSummaryText?: string,
  model?: string,
  provider?: ProviderId,
  chatId?: string,
  contextSettings?: AgentContextSettings
): Promise<CompactionApiResult> {
  const payload: Record<string, unknown> = {
    messages,
    origin: "compaction",
    ...(model && { model }),
    ...(provider && { provider }),
    ...(chatId && { chatId }),
    ...(previousSummaryText && { previousSummaryText }),
    ...(contextSettings && { contextSettings }),
  };

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(no body)");
    throw new Error(
      `Compaction request failed: ${response.status} ${response.statusText} — ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    summary: string;
    tokensUsed: number;
    coversThrough?: string;
  };
  return {
    summaryText: data.summary,
    tokensUsed: data.tokensUsed ?? 0,
    coversThrough: data.coversThrough ?? messages.at(-1)?.id ?? "",
  };
}
