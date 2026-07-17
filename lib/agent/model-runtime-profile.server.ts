import "server-only";

import { getMergedModelCatalogEntry } from "@/lib/agent/model-catalog.server";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import { UNKNOWN_CONTEXT_FALLBACK_TOKENS } from "@/lib/agent/token-budget";

export interface RuntimeModelProfile {
  providerId: ProviderId;
  modelId: string;
  contextWindow: number;
  maxOutputTokens: number | null;
  contextWindowSource: string;
  contextWindowFetchedAt: string | null;
  contextWindowIsFallback: boolean;
}

/** Resolves model limits with a clearly marked fallback for unknown models. */
export async function getRuntimeModelProfile(
  providerId: ProviderId,
  modelId: string
): Promise<RuntimeModelProfile> {
  const entry = await getMergedModelCatalogEntry(providerId, modelId);
  const isFallback = entry?.context_window_is_fallback === true || entry?.context_window == null;
  return {
    providerId,
    modelId,
    contextWindow: entry?.context_window ?? UNKNOWN_CONTEXT_FALLBACK_TOKENS,
    maxOutputTokens: entry?.max_output_tokens ?? null,
    contextWindowSource: isFallback
      ? "fallback"
      : (entry?.context_window_source ?? entry?.source ?? "snapshot"),
    contextWindowFetchedAt: entry?.context_window_fetched_at ?? entry?.created_at ?? null,
    contextWindowIsFallback: isFallback,
  };
}
