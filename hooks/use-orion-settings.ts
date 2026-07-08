import * as React from "react";

import { useSettingsContext } from "@/components/settings/settings-provider";
import type { ExperienceMode, SettingsData } from "@/lib/settings/schema";

export function useOrionSettings() {
  return useSettingsContext();
}

export function useOrionSetting<T>(selector: (settings: SettingsData) => T): T {
  const { effectiveSettings } = useSettingsContext();
  return React.useMemo(() => selector(effectiveSettings), [effectiveSettings, selector]);
}

/** Returns the active product experience shell. */
export function useExperienceMode(): ExperienceMode {
  return useOrionSetting(React.useCallback((settings) => settings.appearance.experienceMode, []));
}
