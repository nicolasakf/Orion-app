import type { ModelCatalogEntry, ReasoningOption } from "@/lib/agent/model-catalog";
import type { ProviderId } from "@/lib/agent/model-gateway-types";

/** Positive named reasoning-effort values exposed by Orion's Intelligence control. */
export const REASONING_EFFORT_ORDER = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_ORDER)[number];
export type ReasoningProviderFamily = "openai" | "anthropic" | "google" | "xai";

const ADAPTER_REASONING_EFFORTS: Record<
  ReasoningProviderFamily,
  ReadonlySet<ReasoningEffort>
> = {
  openai: new Set(["minimal", "low", "medium", "high", "xhigh"]),
  anthropic: new Set(["low", "medium", "high", "max"]),
  google: new Set(["minimal", "low", "medium", "high"]),
  xai: new Set(["low", "medium", "high"]),
};

/** Returns true when a value is a positive named effort supported by Orion's UI. */
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORT_ORDER.includes(value as ReasoningEffort);
}

/** Resolves the native provider family that owns an effort option. */
export function getReasoningProviderFamily(
  providerId: ProviderId,
  modelId: string
): ReasoningProviderFamily | undefined {
  if (
    providerId === "openai" ||
    providerId === "anthropic" ||
    providerId === "google" ||
    providerId === "xai"
  ) {
    return providerId;
  }

  if (providerId !== "vercel") return undefined;
  const creator = modelId.split("/", 1)[0]?.toLowerCase();
  return creator === "openai" ||
    creator === "anthropic" ||
    creator === "google" ||
    creator === "xai"
    ? creator
    : undefined;
}

/** Returns named catalog efforts that the active provider adapter can serialize. */
export function getSupportedReasoningEfforts(
  providerId: ProviderId,
  modelId: string,
  reasoningOptions: ReasoningOption[] | undefined
): ReasoningEffort[] {
  const family = getReasoningProviderFamily(providerId, modelId);
  if (!family) return [];

  const catalogValues = new Set(
    (reasoningOptions ?? [])
      .filter((option): option is Extract<ReasoningOption, { type: "effort" }> =>
        option.type === "effort"
      )
      .flatMap((option) => option.values)
      .filter(isReasoningEffort)
  );
  const adapterValues = ADAPTER_REASONING_EFFORTS[family];
  return REASONING_EFFORT_ORDER.filter(
    (effort) => catalogValues.has(effort) && adapterValues.has(effort)
  );
}

/** Checks whether the selected adapter can serialize a named effort value. */
export function isAdapterReasoningEffort(
  providerId: ProviderId,
  modelId: string,
  effort: ReasoningEffort
): boolean {
  const family = getReasoningProviderFamily(providerId, modelId);
  return family ? ADAPTER_REASONING_EFFORTS[family].has(effort) : false;
}

/** Drops unsupported client settings before provider options are constructed. */
export function validateReasoningModelSettings(input: {
  providerId: ProviderId;
  modelId: string;
  catalogEntry: ModelCatalogEntry | undefined;
  modelSettings: Record<string, unknown> | undefined;
}): { reasoningEffort: ReasoningEffort } | undefined {
  const effort = input.modelSettings?.reasoningEffort;
  if (!isReasoningEffort(effort)) return undefined;

  const supported = getSupportedReasoningEfforts(
    input.providerId,
    input.modelId,
    input.catalogEntry?.reasoning_options
  );
  return supported.includes(effort) ? { reasoningEffort: effort } : undefined;
}
