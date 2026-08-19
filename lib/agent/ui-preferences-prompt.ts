import type { NotebookUiPreferences } from "@/lib/settings/schema";

/** Builds agent instructions for the user's configured UI library preferences. */
export function buildUiPreferencesPromptSection(
  preferences?: NotebookUiPreferences
): string {
  if (!preferences) return "";

  return `## UI Generation Preferences

When creating or revising notebook or App View UI, use these configured preferences unless the user's current request names a different library:
- Charts: ${JSON.stringify(preferences.charts)}
- Tables: ${JSON.stringify(preferences.tables)}
- Other UI elements (including buttons, inputs, cards, and layouts): ${JSON.stringify(preferences.otherElements)}

These preferences take priority over workflow-specific library defaults. If a preferred library is unavailable or incompatible with the requested result, briefly explain that constraint and use the closest supported alternative.`;
}
