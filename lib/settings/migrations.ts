import { createDefaultUserSettingsDocument, createDefaultWorkspaceSettingsDocument, DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import type { SettingsData, UserSettingsDocument, WorkspaceSettingsDocument, WorkspaceSettingsOverrides } from "@/lib/settings/schema";
import {
  SETTINGS_SCHEMA_VERSION,
  UserSettingsDocumentSchema,
  WorkspaceSettingsDocumentSchema,
} from "@/lib/settings/schema";
import { normalizeInteractionModeConfigs } from "@/lib/agent/interaction-modes";

/**
 * Ensures a migrated document satisfies the current schema (fills gaps from invalid
 * partial saves or incomplete defaults).
 */
function finalizeUserSettingsDocument(settings: SettingsData): UserSettingsDocument {
  const finalizedSettings = {
    ...settings,
    chat: {
      ...settings.chat,
      interactionModes: normalizeInteractionModeConfigs(settings.chat.interactionModes),
    },
  };
  const candidate = {
    version: SETTINGS_SCHEMA_VERSION,
    settings: stripInvalidWorkspacePins(finalizedSettings),
  };
  const parsed = UserSettingsDocumentSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  const merged = mergeSettings(
    DEFAULT_SETTINGS,
    candidate.settings,
    {}
  );
  const reparsed = UserSettingsDocumentSchema.safeParse({
    version: SETTINGS_SCHEMA_VERSION,
    settings: stripInvalidWorkspacePins(merged),
  });
  if (reparsed.success) {
    return reparsed.data;
  }

  return createDefaultUserSettingsDocument();
}

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

/** Drops legacy notebook table settings removed with the DataTable UI. */
function stripRemovedTableSettings(settings: Record<string, unknown>): void {
  if ("table" in settings) {
    delete settings.table;
  }
}

/** Drops app-shell layout keys that belong to browser session state. */
function stripSessionOnlyLayoutKeys(settings: Record<string, unknown>): void {
  const layout = asObject(settings.layout);
  if (!layout) return;
  if ("sidebars" in layout) {
    delete layout.sidebars;
  }
  if ("panelSizes" in layout) {
    delete layout.panelSizes;
  }
  if (Object.keys(layout).length === 0) {
    delete settings.layout;
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

/** Server root (`""`) is not pin-eligible; strip empty paths from stored pins (legacy cleanup). */
function stripInvalidWorkspacePins(settings: SettingsData): SettingsData {
  return {
    ...settings,
    workspace: {
      ...settings.workspace,
      pinnedDirectoryPaths: settings.workspace.pinnedDirectoryPaths.filter((p) => p !== ""),
      pinnedFilePaths: settings.workspace.pinnedFilePaths.filter((p) => p !== ""),
    },
  };
}

function normalizeWorkspaceDocument(raw: unknown): Record<string, unknown> {
  const obj = asObject(raw);
  if (!obj) {
    return createDefaultWorkspaceSettingsDocument();
  }

  if ("overrides" in obj) {
    return obj;
  }

  // Workspace settings may be authored in the same shape as user settings.
  if ("settings" in obj) {
    return {
      version: SETTINGS_SCHEMA_VERSION,
      overrides: obj.settings,
    };
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
    stripSessionOnlyLayoutKeys(settingsObj);
    stripRemovedTableSettings(settingsObj);
  }
  const parsed = UserSettingsDocumentSchema.safeParse(normalized);
  if (parsed.success) {
    return finalizeUserSettingsDocument(parsed.data.settings);
  }

  const partialSettings = asObject(normalized.settings);
  if (!partialSettings) {
    return createDefaultUserSettingsDocument();
  }

  // Migrate enabledModelIds -> pinnedModelIds (toggle -> pin)
  const chat = asObject(partialSettings.chat);
  if (chat) {
    if ("enabledModelIds" in chat && Array.isArray(chat.enabledModelIds)) {
      chat.pinnedModelIds = chat.enabledModelIds;
      delete chat.enabledModelIds;
    }

    // chatGenerationModelId was removed; preserve its value for title generation.
    if (
      "chatGenerationModelId" in chat &&
      typeof chat.chatGenerationModelId === "string" &&
      !("titleGenerationModelId" in chat)
    ) {
      chat.titleGenerationModelId = chat.chatGenerationModelId;
    }
    if ("chatGenerationModelId" in chat) {
      delete chat.chatGenerationModelId;
    }
  }

  stripLegacyAppearanceKeys(partialSettings);
  stripSessionOnlyLayoutKeys(partialSettings);
  stripRemovedTableSettings(partialSettings);

  const merged = mergeSettings(
    DEFAULT_SETTINGS,
    partialSettings as SettingsData,
    {}
  );

  return finalizeUserSettingsDocument(merged);
}

export function migrateWorkspaceSettingsDocument(raw: unknown): WorkspaceSettingsDocument {
  const normalized = normalizeWorkspaceDocument(raw);
  const parsed = WorkspaceSettingsDocumentSchema.safeParse(normalized);
  if (parsed.success) {
    return {
      version: SETTINGS_SCHEMA_VERSION,
      overrides: parsed.data.overrides,
    };
  }

  const maybeOverrides = asObject(normalized.overrides) ?? {};
  stripSessionOnlyLayoutKeys(maybeOverrides);
  stripRemovedTableSettings(maybeOverrides);
  return {
    version: SETTINGS_SCHEMA_VERSION,
    overrides: maybeOverrides as WorkspaceSettingsOverrides,
  };
}

export function parseUserSettingsDocumentFromJson(raw: string): UserSettingsDocument {
  const parsed = safeParseJson(raw);
  return migrateUserSettingsDocument(parsed);
}

export function parseWorkspaceSettingsDocumentFromJson(raw: string): WorkspaceSettingsDocument {
  const parsed = safeParseJson(raw);
  return migrateWorkspaceSettingsDocument(parsed);
}
