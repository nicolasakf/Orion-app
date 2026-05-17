import { createDefaultProjectSettingsDocument, createDefaultUserSettingsDocument, DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import type { ProjectSettingsDocument, ProjectSettingsOverrides, SettingsData, UserSettingsDocument } from "@/lib/settings/schema";
import { ProjectSettingsDocumentSchema, SETTINGS_SCHEMA_VERSION, UserSettingsDocumentSchema } from "@/lib/settings/schema";

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Drops legacy `zenMode` / `focusMode` appearance keys (Focus mode is session-only in the app shell). */
function stripLegacyAppearanceKeys(settings: Record<string, unknown>): void {
  const appearance = asObject(settings.appearance);
  if (!appearance) return;
  if ("zenMode" in appearance) {
    delete appearance.zenMode;
  }
  if ("focusMode" in appearance) {
    delete appearance.focusMode;
  }
}

function normalizeUserDocument(raw: unknown): Record<string, unknown> {
  const obj = asObject(raw);
  if (!obj) {
    return createDefaultUserSettingsDocument();
  }

  if ("settings" in obj) {
    return obj;
  }

  // Legacy support: treat top-level payload as direct settings object.
  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings: obj,
  };
}

/** Server root (`""`) is not pin-eligible; strip it from stored pins (legacy cleanup). */
function stripInvalidWorkspacePins(settings: SettingsData): SettingsData {
  return {
    ...settings,
    workspace: {
      ...settings.workspace,
      pinnedDirectoryPaths: settings.workspace.pinnedDirectoryPaths.filter((p) => p !== ""),
    },
  };
}

function normalizeProjectDocument(raw: unknown): Record<string, unknown> {
  const obj = asObject(raw);
  if (!obj) {
    return createDefaultProjectSettingsDocument();
  }

  if ("overrides" in obj) {
    return obj;
  }

  // Legacy support: treat top-level payload as override payload.
  return {
    version: SETTINGS_SCHEMA_VERSION,
    overrides: obj,
  };
}

export function migrateUserSettingsDocument(raw: unknown): UserSettingsDocument {
  const normalized = normalizeUserDocument(raw);
  const settingsObj = asObject(normalized.settings);
  if (settingsObj) {
    stripLegacyAppearanceKeys(settingsObj);
  }
  const parsed = UserSettingsDocumentSchema.safeParse(normalized);
  if (parsed.success) {
    return {
      version: SETTINGS_SCHEMA_VERSION,
      settings: stripInvalidWorkspacePins(parsed.data.settings),
    };
  }

  const partialSettings = asObject(normalized.settings);
  if (!partialSettings) {
    return createDefaultUserSettingsDocument();
  }

  // Migrate enabledModelIds -> pinnedModelIds (toggle -> pin)
  const chat = asObject(partialSettings.chat);
  if (chat && "enabledModelIds" in chat && Array.isArray(chat.enabledModelIds)) {
    chat.pinnedModelIds = chat.enabledModelIds;
    delete chat.enabledModelIds;
  }

  stripLegacyAppearanceKeys(partialSettings);

  const merged = mergeSettings(
    DEFAULT_SETTINGS,
    partialSettings as SettingsData,
    {}
  );

  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings: stripInvalidWorkspacePins(merged),
  };
}

export function migrateProjectSettingsDocument(raw: unknown): ProjectSettingsDocument {
  const normalized = normalizeProjectDocument(raw);
  const parsed = ProjectSettingsDocumentSchema.safeParse(normalized);
  if (parsed.success) {
    return {
      version: SETTINGS_SCHEMA_VERSION,
      overrides: parsed.data.overrides,
    };
  }

  const maybeOverrides = asObject(normalized.overrides) ?? {};
  return {
    version: SETTINGS_SCHEMA_VERSION,
    overrides: maybeOverrides as ProjectSettingsOverrides,
  };
}

export function parseUserSettingsDocumentFromJson(raw: string): UserSettingsDocument {
  const parsed = safeParseJson(raw);
  return migrateUserSettingsDocument(parsed);
}

export function parseProjectSettingsDocumentFromJson(raw: string): ProjectSettingsDocument {
  const parsed = safeParseJson(raw);
  return migrateProjectSettingsDocument(parsed);
}
