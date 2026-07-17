import { z } from "zod";

import { COMPACTION_AUTO_THRESHOLD } from "@/lib/agent/token-budget";

export const ContextPreflightSettingsSchema = z.object({
  compactionAutoThreshold: z.number().min(0).max(1).default(COMPACTION_AUTO_THRESHOLD),
  compactionRetentionTurns: z.number().int().min(1).optional(),
  optimizerRetentionTurns: z.number().int().min(1).optional(),
});

export const ContextPreflightRequestSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    messages: z.array(z.record(z.string(), z.unknown())),
    interactionMode: z.string().optional(),
    contextSettings: ContextPreflightSettingsSchema.optional(),
  })
  .passthrough();

export const ContextPreflightResultSchema = z.object({
  version: z.literal(1),
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
    contextWindow: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive().nullable(),
    contextWindowSource: z.string(),
    contextWindowFetchedAt: z.string().nullable(),
    contextWindowIsFallback: z.boolean(),
  }),
  budget: z.object({
    outputReserve: z.number().int().nonnegative(),
    usableInputTokens: z.number().int().positive(),
    thresholdTokens: z.number().int().nonnegative(),
    autoCompactThreshold: z.number(),
  }),
  measurement: z.object({
    rawInputTokens: z.number().int().nonnegative(),
    estimatedInputTokens: z.number().int().nonnegative(),
    percentUsed: z.number().nonnegative(),
    status: z.enum(["ok", "compact", "over"]),
    confidence: z.enum(["low", "calibrated"]),
    calibrationSampleCount: z.number().int().nonnegative(),
    breakdown: z.object({
      system: z.number().int().nonnegative(),
      messages: z.number().int().nonnegative(),
      tools: z.number().int().nonnegative(),
      images: z.number().int().nonnegative(),
      framing: z.number().int().nonnegative(),
    }),
  }),
});

export type ContextPreflightRequest = z.infer<typeof ContextPreflightRequestSchema>;
export type ContextPreflightResult = z.infer<typeof ContextPreflightResultSchema>;

