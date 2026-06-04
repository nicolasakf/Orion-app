import type { SettingsData } from "@/lib/settings/schema";

/**
 * Provider IDs the user has added via Providers settings or configured with a credential.
 * Excludes built-in default remote providers until the user adds or configures them.
 */
export function getVisibleProviderIds(
  providers: SettingsData["providers"] | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const id of providers?.addedProviderIds ?? []) ids.add(id);
  for (const [id, credential] of Object.entries(providers?.credentials ?? {})) {
    if (credential) ids.add(id);
  }
  return ids;
}
