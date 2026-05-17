import type { ProjectSettingsOverrides, SettingsData } from "@/lib/settings/schema";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) {
    return base;
  }

  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(override)) {
      return base;
    }

    const merged: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
      const overrideValue = override[key];
      if (overrideValue === undefined) {
        continue;
      }
      const baseValue = merged[key];
      if (baseValue === undefined) {
        merged[key] = overrideValue;
        continue;
      }
      merged[key] = deepMerge(baseValue, overrideValue);
    }
    return merged as T;
  }

  return override as T;
}

export function mergeSettings(
  defaults: SettingsData,
  userSettings: SettingsData,
  projectOverrides?: ProjectSettingsOverrides
): SettingsData {
  const mergedWithUser = deepMerge(defaults, userSettings);
  return deepMerge(mergedWithUser, projectOverrides ?? {});
}
