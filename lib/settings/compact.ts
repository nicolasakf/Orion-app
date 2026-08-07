import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import type { SettingsData, UserSettingsDocument } from "@/lib/settings/schema";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep equality for JSON-like settings values (arrays and plain objects). */
export function settingsValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => settingsValuesEqual(value, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) =>
      settingsValuesEqual(left[key], right[key])
    );
  }

  return false;
}

/**
 * Returns only settings keys (recursively) that differ from built-in defaults.
 * Used before writing `~/.orion/settings.json` so the file stays a sparse override list.
 */
export function compactSettingsForPersistence(
  settings: SettingsData,
  defaults: SettingsData = DEFAULT_SETTINGS
): SettingsData {
  const compacted = compactValue(settings, defaults);
  return (compacted ?? {}) as SettingsData;
}

/**
 * Strips default-equal fields while retaining explicit first-run completion flags.
 *
 * Sparse settings files from before onboarding are migrated as existing users, so
 * newly created profiles must persist their false values to remain distinguishable.
 */
export function compactUserSettingsDocument(
  document: UserSettingsDocument,
  defaults: SettingsData = DEFAULT_SETTINGS
): UserSettingsDocument {
  const compactedSettings = compactSettingsForPersistence(
    document.settings,
    defaults,
  );

  return {
    version: document.version,
    settings: {
      ...compactedSettings,
      onboarding: {
        ...compactedSettings.onboarding,
        signInStepCompleted: document.settings.onboarding.signInStepCompleted,
        businessProfileStepCompleted:
          document.settings.onboarding.businessProfileStepCompleted,
      },
      providers: {
        ...compactedSettings.providers,
        inferenceProviderChosen:
          document.settings.providers.inferenceProviderChosen,
      },
    },
  };
}

function compactValue<T>(value: T, defaultValue: T): T | undefined {
  if (settingsValuesEqual(value, defaultValue)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (isPlainObject(value) && isPlainObject(defaultValue)) {
    const result: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(value),
      ...Object.keys(defaultValue),
    ]);

    for (const key of keys) {
      const nextValue = value[key];
      const nextDefault = defaultValue[key];
      if (nextValue === undefined) {
        continue;
      }
      const compactedChild = compactValue(nextValue, nextDefault);
      if (compactedChild !== undefined) {
        result[key] = compactedChild;
      }
    }

    return Object.keys(result).length === 0 ? undefined : (result as T);
  }

  return value;
}
