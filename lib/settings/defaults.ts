import type { SettingsData, UserSettingsDocument, WorkspaceSettingsDocument } from "@/lib/settings/schema";
import { SETTINGS_SCHEMA_VERSION } from "@/lib/settings/schema";

export const DEFAULT_CHAT_GENERATION_MODEL_ID = "gemini-3.1-flash-lite";

export const DEFAULT_SETTINGS: SettingsData = {
  appearance: {
    theme: "system",
  },
  chat: {
    chatGenerationModelId: DEFAULT_CHAT_GENERATION_MODEL_ID,
    toolApprovalMode: "always_ask",
    pinnedModelIds: [],
    fontSize: 12,
  },
  fileTree: {
    fontSize: 12,
  },
  editor: {
    fontSize: 12,
    wordWrap: "off",
    minimapEnabled: false,
    tabSize: 2,
    insertSpaces: true,
  },
  notebook: {
    scrollbarVisible: true,
    presentationHideAllCellInputs: false,
  },
  workspace: {
    pinnedDirectoryPaths: [],
  },
  providers: {
    credentials: {},
  },
};

/** Creates an isolated user settings document from the immutable defaults. */
export function createDefaultUserSettingsDocument(): UserSettingsDocument {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Creates an empty workspace settings document for workspace-level overrides. */
export function createDefaultWorkspaceSettingsDocument(): WorkspaceSettingsDocument {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    overrides: {},
  };
}
