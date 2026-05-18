import { z } from "zod";

export const SETTINGS_SCHEMA_VERSION = 1;

/** Max entries for `workspace.pinnedDirectoryPaths` in user settings. */
export const MAX_PINNED_WORKSPACE_DIRECTORY_PATHS = 50;

export const ThemeSettingSchema = z.enum(["light", "dark", "system"]);
export const InteractionModeSchema = z.enum(["Agent", "Ask", "Edit"]).catch("Agent");
export const ToolApprovalModeSchema = z.enum(["always_ask", "auto_run"]);
export const WordWrapSchema = z.enum(["off", "on", "wordWrapColumn", "bounded"]);

const SortConfigSchema = z
  .object({
    key: z.string(),
    direction: z.enum(["asc", "desc"]),
  })
  .nullable();

const AdvancedFilterSchema = z.object({
  id: z.string(),
  value: z.string(),
  operation: z.enum([
    "contains",
    "doesNotContain",
    "equals",
    "notEquals",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
    "blank",
    "notBlank",
    "regex",
    "pandas",
  ]),
});

const ColumnFilterSchema = z.object({
  filters: z.array(AdvancedFilterSchema),
  condition: z.enum(["AND", "OR"]),
});

const TableViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  filterConfig: z.record(z.string()),
  advancedFilterConfig: z.record(ColumnFilterSchema),
  sortConfig: SortConfigSchema,
  searchTerm: z.string(),
  visibleColumns: z.array(z.string()),
  columnWidths: z.record(z.number()),
  freezeHeader: z.boolean(),
  fontSize: z.number().int().min(10).max(32),
  rowHeight: z.number().int().min(20).max(200),
});

const ProviderCredentialSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("api_key"),
    /** Encrypted at rest in localStorage — never sent to the Orion server except
     *  as a transient value inside the /api/chat request body over HTTPS. */
    apiKey: z.string(),
  }),
  z.object({
    type: z.literal("chatgpt_oauth"),
    accessToken: z.string(),
    refreshToken: z.string(),
    /** Epoch ms when the access token expires. */
    expiresAt: z.number(),
    /** chatgpt_account_id extracted from the id_token JWT. */
    accountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("local_endpoint"),
    /** OpenAI-compatible local server URL, usually ending in /v1. */
    baseUrl: z.string().min(1),
    /** Runtime-specific model ID to send to the local server. */
    modelId: z.string().min(1),
    /** Optional bearer token for local servers configured with auth. */
    apiKey: z.string().optional(),
  }),
]);

export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

const SettingsDataSchema = z.object({
  appearance: z.object({
    theme: ThemeSettingSchema,
  }),
  layout: z.object({
    sidebars: z.object({
      leftCollapsed: z.boolean(),
      rightCollapsed: z.boolean(),
      bottomCollapsed: z.boolean(),
    }),
    panelSizes: z.object({
      horizontal: z
        .tuple([z.number().min(5).max(90), z.number().min(5).max(90), z.number().min(5).max(90)])
        .describe("Left, center, right panel sizes"),
      vertical: z
        .tuple([z.number().min(5).max(95), z.number().min(5).max(95)])
        .describe("Top, bottom panel sizes in center stack"),
    }),
  }),
  chat: z.object({
    toolApprovalMode: ToolApprovalModeSchema,
    /** Model IDs pinned to the top of the model selector. Order preserved. */
    pinnedModelIds: z.array(z.string()),
    /** Font size in pixels for the chat message stream and composer. */
    fontSize: z.number().int().min(10).max(20),
  }),
  /** Left sidebar file list typography. */
  fileTree: z.object({
    fontSize: z.number().int().min(10).max(20),
  }),
  table: z.object({
    display: z.object({
      freezeHeader: z.boolean(),
      toolbarVisible: z.boolean(),
      visibleRowCount: z.number().int().min(5).max(200),
      rowHeight: z.number().int().min(20).max(120),
      fontSize: z.number().int().min(10).max(24),
      columnWidths: z.record(z.number().min(30).max(2000)),
    }),
    views: z.array(TableViewSchema),
  }),
  editor: z.object({
    fontSize: z.number().int().min(10).max(28),
    wordWrap: WordWrapSchema,
    minimapEnabled: z.boolean(),
    tabSize: z.number().int().min(1).max(8),
    insertSpaces: z.boolean(),
  }),
  notebook: z.object({
    /**
     * When true, the notebook editor shows a vertical scrollbar.
     * When false, scrolling still works but the scrollbar is hidden (overlay-style).
     */
    scrollbarVisible: z.boolean(),
    /**
     * When true, code cell source editors are hidden in the UI (presentation mode).
     * Does not change notebook file metadata.
     */
    presentationHideAllCellInputs: z.boolean(),
  }),
  workspace: z.object({
    /** Jupyter-relative directory paths pinned in the workspace picker (order preserved). */
    pinnedDirectoryPaths: z
      .array(z.string().min(1))
      .max(MAX_PINNED_WORKSPACE_DIRECTORY_PATHS),
  }),
  providers: z
    .object({
      /**
       * Per-provider user credentials (BYOK API keys, ChatGPT OAuth tokens, or
       * local OpenAI-compatible endpoint settings).
       * Keyed by provider_id ("openai" | "anthropic" | "google" | "xai" |
       * "ollama" | "lmstudio").
       * Stored client-side only; never persisted on the server.
       */
      credentials: z.record(ProviderCredentialSchema).default({}),
    })
    .default({ credentials: {} }),
});

export const UserSettingsDocumentSchema = z.object({
  version: z.number().int().min(1),
  settings: SettingsDataSchema,
});

export const ProjectSettingsDocumentSchema = z.object({
  version: z.number().int().min(1),
  overrides: SettingsDataSchema.deepPartial(),
});

export type ThemeSetting = z.infer<typeof ThemeSettingSchema>;
export type InteractionModeSetting = z.infer<typeof InteractionModeSchema>;
export type ToolApprovalMode = z.infer<typeof ToolApprovalModeSchema>;
export type WordWrapSetting = z.infer<typeof WordWrapSchema>;
export type SettingsData = z.infer<typeof SettingsDataSchema>;
export type UserSettingsDocument = z.infer<typeof UserSettingsDocumentSchema>;
export type ProjectSettingsDocument = z.infer<typeof ProjectSettingsDocumentSchema>;
export type ProjectSettingsOverrides = ProjectSettingsDocument["overrides"];
