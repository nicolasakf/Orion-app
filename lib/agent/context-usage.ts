/**
 * The single shared model for "how much context is this conversation using".
 *
 * Before this module the client and the server each had their own estimator with
 * their own field names, and the UI silently swapped between them — so the number
 * could change by a large factor with no user-visible cause. There is now exactly
 * one measurement shape, produced server-side against the real prepared prompt,
 * and a pure resolver that layers locally-priced additions on top of it.
 *
 * Plain `.ts` on purpose: both the API routes and the UI import it, so it must
 * not pull in `server-only` or `"use client"`.
 */

import { z } from "zod";

import { COMPACTION_AUTO_THRESHOLD } from "@/lib/agent/token-budget";

/** Bumped when the wire shape of a measurement changes. */
export const CONTEXT_USAGE_VERSION = 2;

// ────────────────────────────────────────────────────────────────────────────
// Wire schemas
// ────────────────────────────────────────────────────────────────────────────

export const ContextUsageBucketsSchema = z.object({
  system: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  framing: z.number().int().nonnegative(),
});
export type ContextUsageBuckets = z.infer<typeof ContextUsageBucketsSchema>;

export const ContextWindowInfoSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().nullable(),
  contextWindowSource: z.string(),
  contextWindowFetchedAt: z.string().nullable(),
  /** True when the window is a guess, so no honest percentage can be shown. */
  contextWindowIsFallback: z.boolean(),
});
export type ContextWindowInfo = z.infer<typeof ContextWindowInfoSchema>;

export const ContextBudgetInfoSchema = z.object({
  outputReserve: z.number().int().nonnegative(),
  usableInputTokens: z.number().int().positive(),
  thresholdTokens: z.number().int().nonnegative(),
  autoCompactThreshold: z.number(),
});
export type ContextBudgetInfo = z.infer<typeof ContextBudgetInfoSchema>;

export const ContextUsageStatusSchema = z.enum(["ok", "compact", "over"]);
export type ContextUsageStatus = z.infer<typeof ContextUsageStatusSchema>;

/** One server-side observation of the prompt that would be — or was — sent. */
export const ContextMeasurementSchema = z.object({
  version: z.literal(CONTEXT_USAGE_VERSION),
  /** "estimate" measures the prepared prompt; "provider" is the model's own count. */
  kind: z.enum(["estimate", "provider"]),
  /** Sum of `buckets`, before calibration. Invariant, asserted in tests. */
  rawInputTokens: z.number().int().nonnegative(),
  /** The number to display: calibrated estimate, or the provider's exact count. */
  inputTokens: z.number().int().nonnegative(),
  buckets: ContextUsageBucketsSchema,
  /** `inputTokens - rawInputTokens`. Negative when the estimator overshoots. */
  calibrationDelta: z.number().int(),
  confidence: z.enum(["exact", "calibrated", "low"]),
  calibrationSampleCount: z.number().int().nonnegative(),
  estimatorVersion: z.number().int().positive(),
  window: ContextWindowInfoSchema,
  budget: ContextBudgetInfoSchema,
  status: ContextUsageStatusSchema,
  percentUsed: z.number().nonnegative(),
  measuredAt: z.string(),
});
export type ContextMeasurement = z.infer<typeof ContextMeasurementSchema>;

export const ContextUsageSettingsSchema = z.object({
  compactionAutoThreshold: z.number().min(0).max(1).default(COMPACTION_AUTO_THRESHOLD),
  compactionRetentionTurns: z.number().int().min(1).optional(),
  optimizerRetentionTurns: z.number().int().min(1).optional(),
});

export const ContextMeasurementRequestSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    messages: z.array(z.record(z.string(), z.unknown())),
    interactionMode: z.string().optional(),
    contextSettings: ContextUsageSettingsSchema.optional(),
  })
  .passthrough();
export type ContextMeasurementRequest = z.infer<typeof ContextMeasurementRequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Budget decisions
// ────────────────────────────────────────────────────────────────────────────

/**
 * True when a send should compact first.
 *
 * Deliberately looser than `exceedsContextBudget`: compacting early is cheap, so
 * it fires at the auto-compact threshold rather than waiting for a real overflow.
 */
export function shouldCompactBeforeSend(
  measurement: Pick<ContextMeasurement, "status">
): boolean {
  return measurement.status !== "ok";
}

/**
 * True when the request does not fit and must be rejected or retried.
 *
 * Deliberately stricter than `shouldCompactBeforeSend`: a request merely above the
 * compaction threshold still fits, and telling the user otherwise is a false alarm.
 */
export function exceedsContextBudget(
  measurement: Pick<ContextMeasurement, "status">
): boolean {
  return measurement.status === "over";
}

/** Classifies a token total against a budget. */
export function classifyContextStatus(
  inputTokens: number,
  budget: Pick<ContextBudgetInfo, "usableInputTokens" | "thresholdTokens">
): ContextUsageStatus {
  if (inputTokens >= budget.usableInputTokens) return "over";
  if (inputTokens >= budget.thresholdTokens) return "compact";
  return "ok";
}

// ────────────────────────────────────────────────────────────────────────────
// View model
// ────────────────────────────────────────────────────────────────────────────

/** Identifies a row so the UI can label and order it without string matching. */
export type ContextUsageRowKey =
  | "system"
  | "messages"
  | "tools"
  | "images"
  | "framing"
  | "calibration"
  | "reply"
  | "draft";

export interface ContextUsageRow {
  key: ContextUsageRowKey;
  tokens: number;
}

/** Locally priced composer contents not yet covered by a server measurement. */
export interface DraftTokenEstimate {
  tokens: number;
  textTokens: number;
  referenceTokens: number;
  attachmentTokens: number;
}

/** Locally priced messages that arrived after the anchoring measurement. */
export interface AppendedTokenEstimate {
  tokens: number;
  textTokens: number;
  toolTokens: number;
  imageTokens: number;
}

export const EMPTY_DRAFT_ESTIMATE: DraftTokenEstimate = {
  tokens: 0,
  textTokens: 0,
  referenceTokens: 0,
  attachmentTokens: 0,
};

export const EMPTY_APPENDED_ESTIMATE: AppendedTokenEstimate = {
  tokens: 0,
  textTokens: 0,
  toolTokens: 0,
  imageTokens: 0,
};

export interface ContextUsageView {
  /** Always exactly the sum of `rows`. Enforced by an invariant test. */
  totalTokens: number;
  rows: ContextUsageRow[];
  /** null when the context window is a guess — no honest denominator exists. */
  percentUsed: number | null;
  status: ContextUsageStatus;
  source: "provider" | "estimate";
  confidence: "exact" | "calibrated" | "low";
  /** True when part of the total is locally estimated rather than measured. */
  hasLocalDelta: boolean;
  /** True when the anchor no longer covers the current transcript. */
  isStale: boolean;
  calibrationSampleCount: number;
  window: ContextWindowInfo;
  budget: ContextBudgetInfo;
}

/**
 * Combine a server measurement with locally priced additions into one displayable
 * view whose rows always sum to its own total.
 *
 * The calibration correction is kept as its own row rather than distributed across
 * the buckets: it is a global systematic factor that belongs to no single bucket,
 * spreading it would reintroduce per-row rounding drift, and only a separate row
 * can honestly show a negative correction.
 *
 * @param input.anchor - Last measurement taken by the server or reported by the provider.
 * @param input.appended - Messages that arrived after the anchor was taken.
 * @param input.draft - Composer contents not yet sent.
 * @param input.isStale - True when the anchor no longer covers the transcript.
 */
export function resolveContextUsage(input: {
  anchor: ContextMeasurement;
  appended?: AppendedTokenEstimate;
  draft?: DraftTokenEstimate;
  isStale?: boolean;
}): ContextUsageView {
  const appended = input.appended ?? EMPTY_APPENDED_ESTIMATE;
  const draft = input.draft ?? EMPTY_DRAFT_ESTIMATE;
  const { anchor } = input;

  // Derive the correction from the authoritative total rather than trusting the
  // stored delta. This makes `inputTokens` the number on screen by construction,
  // so the rows cannot disagree with their own header even if a measurement
  // arrives with inconsistent fields.
  const bucketSum = Object.values(anchor.buckets).reduce((sum, value) => sum + value, 0);
  const calibration = anchor.inputTokens - bucketSum;

  const allRows: ContextUsageRow[] = [
    { key: "system", tokens: anchor.buckets.system },
    { key: "messages", tokens: anchor.buckets.messages },
    { key: "tools", tokens: anchor.buckets.tools },
    { key: "images", tokens: anchor.buckets.images },
    { key: "framing", tokens: anchor.buckets.framing },
    { key: "calibration", tokens: calibration },
    { key: "reply", tokens: appended.tokens },
    { key: "draft", tokens: draft.tokens },
  ];

  // Sum before filtering: a zero row is hidden, never subtracted.
  const totalTokens = allRows.reduce((sum, row) => sum + row.tokens, 0);
  const rows = allRows.filter((row) => row.tokens !== 0);

  const hasLocalDelta = appended.tokens > 0 || draft.tokens > 0;
  const percentUsed = anchor.window.contextWindowIsFallback
    ? null
    : totalTokens / anchor.budget.usableInputTokens;

  return {
    totalTokens,
    rows,
    percentUsed,
    status: classifyContextStatus(totalTokens, anchor.budget),
    source: anchor.kind === "provider" ? "provider" : "estimate",
    // Describes the anchor only. Whether anything is estimated *on top* of it is
    // `hasLocalDelta`; folding that in here would mislabel an exact provider count
    // as "calibrated", which means something else entirely.
    confidence: anchor.confidence,
    hasLocalDelta,
    isStale: input.isStale ?? false,
    calibrationSampleCount: anchor.calibrationSampleCount,
    window: anchor.window,
    budget: anchor.budget,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Construction
// ────────────────────────────────────────────────────────────────────────────

/** The estimator output this module wraps, restated to avoid a server-only import. */
export interface PreparedPromptBuckets {
  rawInputTokens: number;
  estimatedInputTokens: number;
  confidence: "low" | "calibrated";
  calibrationSampleCount: number;
  breakdown: ContextUsageBuckets;
}

/** Builds an estimate measurement from a prepared-prompt measurement. */
export function buildEstimateContextMeasurement(input: {
  prepared: PreparedPromptBuckets;
  window: ContextWindowInfo;
  budget: ContextBudgetInfo;
  estimatorVersion: number;
  measuredAt?: Date;
}): ContextMeasurement {
  const { prepared } = input;
  return {
    version: CONTEXT_USAGE_VERSION,
    kind: "estimate",
    rawInputTokens: prepared.rawInputTokens,
    inputTokens: prepared.estimatedInputTokens,
    buckets: prepared.breakdown,
    calibrationDelta: prepared.estimatedInputTokens - prepared.rawInputTokens,
    confidence: prepared.confidence,
    calibrationSampleCount: prepared.calibrationSampleCount,
    estimatorVersion: input.estimatorVersion,
    window: input.window,
    budget: input.budget,
    status: classifyContextStatus(prepared.estimatedInputTokens, input.budget),
    percentUsed: prepared.estimatedInputTokens / input.budget.usableInputTokens,
    measuredAt: (input.measuredAt ?? new Date()).toISOString(),
  };
}

/**
 * Builds an exact measurement from the token count the provider actually charged.
 *
 * The buckets stay at their estimated values — the provider reports one total, not
 * a breakdown — so the difference between that total and the estimate is carried in
 * `calibrationDelta`. The rows therefore still sum to the exact number.
 *
 * @param input.prepared - The estimate made for this same request.
 * @param input.actualInputTokens - Input tokens reported by the provider.
 */
export function buildProviderContextMeasurement(input: {
  prepared: PreparedPromptBuckets;
  actualInputTokens: number;
  window: ContextWindowInfo;
  budget: ContextBudgetInfo;
  estimatorVersion: number;
  measuredAt?: Date;
}): ContextMeasurement {
  const { prepared } = input;
  const inputTokens = Math.max(0, Math.round(input.actualInputTokens));
  return {
    version: CONTEXT_USAGE_VERSION,
    kind: "provider",
    rawInputTokens: prepared.rawInputTokens,
    inputTokens,
    buckets: prepared.breakdown,
    calibrationDelta: inputTokens - prepared.rawInputTokens,
    confidence: "exact",
    calibrationSampleCount: prepared.calibrationSampleCount,
    estimatorVersion: input.estimatorVersion,
    window: input.window,
    budget: input.budget,
    status: classifyContextStatus(inputTokens, input.budget),
    percentUsed: inputTokens / input.budget.usableInputTokens,
    measuredAt: (input.measuredAt ?? new Date()).toISOString(),
  };
}
