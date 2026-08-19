import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";
import { parseModelSelectionKey } from "@/lib/agent/model-selection-key";
import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";
import { loadUserSettingsDocument } from "@/lib/settings/user-file-storage.server";

export interface OnboardingProfileModel {
  providerId: ProviderId;
  modelId: string;
  credential: CredentialMode;
}

/**
 * Returns the models to try for writing `ORION.md`, most preferred first.
 *
 * Only models the user has actually configured are considered — the cheap model
 * they chose for background work, then whatever is pinned in their model picker.
 * Bare legacy ids without a provider prefix are skipped: there is no reliable
 * way to attribute them to a provider here.
 */
export function listProfileModelCandidates(settings: {
  chat: { titleGenerationModelId: string; pinnedModelIds: string[] };
}): { providerId: ProviderId; modelId: string }[] {
  const keys = [settings.chat.titleGenerationModelId, ...settings.chat.pinnedModelIds];
  const candidates: { providerId: ProviderId; modelId: string }[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const parsed = parseModelSelectionKey(key);
    if (!parsed || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      providerId: parsed.providerId as ProviderId,
      modelId: parsed.modelId,
    });
  }
  return candidates;
}

/**
 * Picks a model with a usable credential for generating `ORION.md`.
 *
 * Onboarding is provider-agnostic: a user who connected ChatGPT and a user who
 * pasted an Anthropic key both need this to work, so the provider is taken from
 * their own settings rather than pinned to one vendor.
 */
export async function resolveOnboardingProfileModel(): Promise<
  OnboardingProfileModel | undefined
> {
  const document = await loadUserSettingsDocument();
  for (const candidate of listProfileModelCandidates(document.settings)) {
    const credential = await resolveProviderCredentialForModel(
      candidate.providerId,
      candidate.modelId,
    );
    if (credential) return { ...candidate, credential };
  }
  return undefined;
}
