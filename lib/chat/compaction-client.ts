/**
 * Client-side helper for the `origin: "compaction"` server endpoint.
 * Mirrors the title-generation fetch in right-sidebar.tsx.
 */

import type { UIMessage } from "ai";
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";

export interface CompactionApiResult {
  summaryText: string;
  tokensUsed: number;
}

/**
 * Send older conversation turns to the server's compaction endpoint and
 * receive a plain-text summary.
 *
 * @param messages - The subset of messages to summarize (older turns only).
 * @param previousSummaryText - If a prior summary exists, pass it here so the
 *   server can extend it rather than re-summarize from scratch.
 * @param userCredential - BYOK / ChatGPT OAuth credential forwarded as-is.
 */
export async function callCompactionApi(
  messages: UIMessage[],
  previousSummaryText?: string,
  userCredential?: unknown,
  model?: string,
  provider?: SupportedProvider
): Promise<CompactionApiResult> {
  const payload: Record<string, unknown> = {
    messages,
    origin: "compaction",
    ...(model && { model }),
    ...(provider && { provider }),
    ...(previousSummaryText && { previousSummaryText }),
    ...(userCredential !== undefined && { userCredential }),
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

  const data = (await response.json()) as { summary: string; tokensUsed: number };
  return { summaryText: data.summary, tokensUsed: data.tokensUsed ?? 0 };
}
