import { formatModelSelectionKey } from "@/lib/agent/model-selection-key";

/** Returns a trimmed user-defined label for a provider/model pair, if set. */
export function getCustomModelLabel(
  modelLabels: Record<string, string> | undefined,
  providerId: string,
  modelId: string
): string | undefined {
  const custom = modelLabels?.[formatModelSelectionKey(providerId, modelId)]?.trim();
  return custom || undefined;
}

/** Resolves the display label, preferring a user override when present. */
export function resolveModelDisplayLabel(
  providerId: string,
  modelId: string,
  baseLabel: string,
  modelLabels?: Record<string, string>
): string {
  return getCustomModelLabel(modelLabels, providerId, modelId) ?? baseLabel;
}

/** Builds the next `chat.modelLabels` map after editing one model label. */
export function buildModelLabelsUpdate(
  current: Record<string, string>,
  providerId: string,
  modelId: string,
  nextLabel: string,
  baseLabel: string
): Record<string, string> {
  const key = formatModelSelectionKey(providerId, modelId);
  const trimmed = nextLabel.trim();
  if (!trimmed || trimmed === baseLabel.trim()) {
    const { [key]: _removed, ...rest } = current;
    return rest;
  }
  return { ...current, [key]: trimmed };
}
