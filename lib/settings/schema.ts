import { z } from "zod";

export const SETTINGS_SCHEMA_VERSION = 1;

/** Max entries for `workspace.pinnedDirectoryPaths` in user settings. */
export const MAX_PINNED_WORKSPACE_DIRECTORY_PATHS = 50;

export const ThemeSettingSchema = z.enum(["light", "dark", "system"]);
export const InteractionModeSchema = z.enum(["Agent", "Ask", "Edit"]).catch("Agent");
/**
 * Communication style preset for the agent's responses.
 * - "default": minimal narration before and after tool calls
 * - "narrative": step-by-step narration before and after each tool call
 * - "friendly": warm, encouraging, and approachable tone
 * - "pragmatic": direct and minimal — only essential information
 */
export const AgentCommunicationStyleSchema = z
  .enum(["default", "narrative", "friendly", "pragmatic"])
  .catch("default");
export const ToolApprovalModeSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "always_ask" || normalized === "alwaysask") {
    return "always_ask";
  }
  if (normalized === "auto_run" || normalized === "autorun") {
    return "auto_run";
  }
  return value;
}, z.enum(["always_ask", "auto_run"]));
export const WordWrapSchema = z.enum(["off", "on", "wordWrapColumn", "bounded"]);

const LocalEndpointModelSchema = z.object({
  /** Runtime-specific model ID returned by the local OpenAI-compatible server. */
  modelId: z.string().min(1),
  /** User-facing label for this runtime model. */
  label: z.string().optional(),
  /** Whether this model should appear in model pickers. */
  enabled: z.boolean().optional(),
});

const ProviderCredentialSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("api_key"),
    /** Browser-only credential; never written to user/workspace settings files.
     *  Sent to the Orion server only as a transient value inside /api/chat. */
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
    /** Default runtime model ID to send to the local server. */
    modelId: z.string().min(1),
    /** User-facing label for the default configured local model. */
    label: z.string().optional(),
    /** Runtime models enabled for this local provider connection. */
    models: z.array(LocalEndpointModelSchema).optional(),
    /** Optional bearer token for local servers configured with auth. */
    apiKey: z.string().optional(),
  }),
]);

export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

const SettingsDataSchema = z.object({
  appearance: z.object({
    theme: ThemeSettingSchema,
  }),
  chat: z.object({
    /** Model ID used for normal chat generation. */
    chatGenerationModelId: z.string().min(1),
    toolApprovalMode: ToolApprovalModeSchema,
    /** Model IDs pinned to the top of the model selector. Order preserved. */
    pinnedModelIds: z.array(z.string()),
    /** Font size in pixels for the chat message stream and composer. */
    fontSize: z.number().int().min(10).max(20),
    /** Communication style preset injected into the agent system prompt. */
    communicationStyle: AgentCommunicationStyleSchema,
  }),
  /** Left sidebar file list typography. */
  fileTree: z.object({
    fontSize: z.number().int().min(10).max(20),
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
       * "ollama" | "lmstudio" | "mlx" | "custom").
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

export const WorkspaceSettingsDocumentSchema = z.object({
  version: z.number().int().min(1),
  overrides: SettingsDataSchema.deepPartial(),
});

export type ThemeSetting = z.infer<typeof ThemeSettingSchema>;
export type InteractionModeSetting = z.infer<typeof InteractionModeSchema>;
export type ToolApprovalMode = z.infer<typeof ToolApprovalModeSchema>;
export type WordWrapSetting = z.infer<typeof WordWrapSchema>;
export type AgentCommunicationStyle = z.infer<typeof AgentCommunicationStyleSchema>;
export type SettingsData = z.infer<typeof SettingsDataSchema>;
export type UserSettingsDocument = z.infer<typeof UserSettingsDocumentSchema>;
export type WorkspaceSettingsDocument = z.infer<typeof WorkspaceSettingsDocumentSchema>;
export type WorkspaceSettingsOverrides = WorkspaceSettingsDocument["overrides"];
