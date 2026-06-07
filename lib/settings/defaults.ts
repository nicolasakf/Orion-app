import type { SettingsData, UserSettingsDocument, WorkspaceSettingsDocument } from "@/lib/settings/schema";
import { SETTINGS_SCHEMA_VERSION } from "@/lib/settings/schema";
import {
  BUILTIN_AGENT_DEFAULTS,
  BUILTIN_NOTEBOOK_DEFAULTS,
  BUILTIN_SHELL_DEFAULTS,
} from "@/lib/settings/builtin-defaults";
import { DEFAULT_INTERACTION_MODE_CONFIGS } from "@/lib/agent/interaction-modes";

/** Default model for generating short chat titles. */
export const DEFAULT_TITLE_GENERATION_MODEL_ID = "gemini-3.1-flash-lite";

/** Session-only default when no model is stored in sessionStorage. */
export const DEFAULT_SELECTED_CHAT_MODEL_ID = DEFAULT_TITLE_GENERATION_MODEL_ID;

export const DEFAULT_SETTINGS: SettingsData = {
  appearance: {
    theme: "system",
  },
  chat: {
    titleGenerationModelId: DEFAULT_TITLE_GENERATION_MODEL_ID,
    toolApprovalMode: "always_ask",
    pinnedModelIds: [],
    modelLabels: {},
    fontSize: 12,
    communicationStyle: "default" as const,
    customCommunicationStyle: "",
    interactionModes: structuredClone(DEFAULT_INTERACTION_MODE_CONFIGS),
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
    ...BUILTIN_NOTEBOOK_DEFAULTS,
  },
  workspace: {
    pinnedDirectoryPaths: [],
    pinnedFilePaths: [],
  },
  agent: BUILTIN_AGENT_DEFAULTS,
  shell: BUILTIN_SHELL_DEFAULTS,
  providers: {
    credentials: {},
    addedProviderIds: [],
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
