import "server-only";

import { z } from "zod";

import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";
import {
  getPendingVercelGenerationsForChat,
  reconcileVercelModelUsage,
} from "@/lib/chat/chat-sqlite-storage.server";

const VERCEL_GENERATION_URL = "https://ai-gateway.vercel.sh/v1/generation";

const VercelGenerationResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    total_cost: z.number().nonnegative(),
    upstream_inference_cost: z.number().nonnegative().default(0),
    model: z.string(),
    is_byok: z.boolean(),
    provider_name: z.string(),
    tokens_prompt: z.number().int().nonnegative(),
    tokens_completion: z.number().int().nonnegative(),
    native_tokens_reasoning: z.number().int().nonnegative().default(0),
    native_tokens_cached: z.number().int().nonnegative().default(0),
    native_tokens_cache_creation: z.number().int().nonnegative().default(0),
  }),
});

const GatewayMetadataSchema = z.object({
  gateway: z.object({ generationId: z.string().min(1) }).passthrough(),
}).passthrough();

/** Extracts a validated generation ID from AI SDK provider metadata. */
export function getVercelGenerationId(providerMetadata: unknown): string | null {
  const parsed = GatewayMetadataSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data.gateway.generationId : null;
}

/** Fetches and persists one authoritative Vercel generation record. */
export async function reconcileVercelGeneration(
  generationId: string,
  apiKey: string
): Promise<boolean> {
  const response = await fetch(
    `${VERCEL_GENERATION_URL}?id=${encodeURIComponent(generationId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    }
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Vercel generation lookup returned HTTP ${response.status}`);
  const generation = VercelGenerationResponseSchema.parse(await response.json()).data;
  if (generation.id !== generationId) throw new Error("Vercel generation ID mismatch");
  return reconcileVercelModelUsage({
    generationId,
    totalCostUsd: generation.total_cost,
    upstreamInferenceCostUsd: generation.upstream_inference_cost,
    servedProviderId: generation.provider_name,
    isByok: generation.is_byok,
    promptTokens: generation.tokens_prompt,
    completionTokens: generation.tokens_completion,
    reasoningTokens: generation.native_tokens_reasoning,
    cachedTokens: generation.native_tokens_cached,
    cacheCreationTokens: generation.native_tokens_cache_creation,
  });
}

/** Schedules bounded, non-blocking reconciliation attempts after stream completion. */
export function scheduleVercelGenerationReconciliation(
  generationId: string,
  apiKey: string
): void {
  const delays = [500, 2000, 5000, 15000];
  const attempt = (index: number) => {
    if (index >= delays.length) return;
    setTimeout(() => {
      void reconcileVercelGeneration(generationId, apiKey)
        .then((done) => {
          if (!done) attempt(index + 1);
        })
        .catch(() => attempt(index + 1));
    }, delays[index]);
  };
  attempt(0);
}

/** Retries all durable pending Gateway rows when `/cost` is refreshed. */
export async function reconcilePendingVercelUsageForChat(chatId: string): Promise<void> {
  const pending = await getPendingVercelGenerationsForChat(chatId);
  await Promise.allSettled(pending.map(async ({ generationId, modelId }) => {
    const credential = await resolveProviderCredentialForModel("vercel", modelId);
    if (credential?.type !== "byok") return;
    await reconcileVercelGeneration(generationId, credential.apiKey);
  }));
}

