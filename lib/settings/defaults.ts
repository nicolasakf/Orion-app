import type { SettingsData, UserSettingsDocument, WorkspaceSettingsDocument } from "@/lib/settings/schema";
import { SETTINGS_SCHEMA_VERSION } from "@/lib/settings/schema";

export const DEFAULT_SETTINGS: SettingsData = {
  appearance: {
    theme: "system",
  },
  layout: {
    panelSizes: {
      horizontal: [15, 50, 20],
      vertical: [70, 20],
    },
  },
  chat: {
    toolApprovalMode: "always_ask",
    pinnedModelIds: [],
    fontSize: 12,
  },
  fileTree: {
    fontSize: 12,
  },
  table: {
    display: {
      freezeHeader: true,
      toolbarVisible: true,
      visibleRowCount: 15,
      rowHeight: 40,
      fontSize: 14,
      columnWidths: {},
    },
    views: [],
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
