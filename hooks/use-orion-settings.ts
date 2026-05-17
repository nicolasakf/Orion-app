import * as React from "react";

import { useSettingsContext } from "@/components/settings/settings-provider";
import type { SettingsData } from "@/lib/settings/schema";

export function useOrionSettings() {
  return useSettingsContext();
}

export function useOrionSetting<T>(selector: (settings: SettingsData) => T): T {
  const { effectiveSettings } = useSettingsContext();
  return React.useMemo(() => selector(effectiveSettings), [effectiveSettings, selector]);
}
