import type { SettingsData } from "@/lib/settings/schema";

/** Migrates known legacy browser-stored values into the new settings shape. */
export function applyLegacyClientSettings(base: SettingsData): SettingsData {
  if (typeof window === "undefined") {
    return base;
  }

  const next: SettingsData = {
    ...base,
    appearance: { ...base.appearance },
  };

  try {
    const legacyTheme = localStorage.getItem("theme");
    if (
      legacyTheme === "light" ||
      legacyTheme === "dark" ||
      legacyTheme === "system"
    ) {
      next.appearance.theme = legacyTheme;
    }
  } catch {
    // Ignore localStorage access failures.
  }

  return next;
}
