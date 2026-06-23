import { z } from "zod";

export const SETTINGS_SCHEMA_VERSION = 1;

/** Max entries for `workspace.pinnedDirectoryPaths` in user settings. */
export const MAX_PINNED_WORKSPACE_DIRECTORY_PATHS = 50;

/** Max entries for `workspace.pinnedFilePaths` in user settings. */
export const MAX_PINNED_FILE_PATHS = 50;

export const ThemeSettingSchema = z.enum(["light", "dark", "system"]);
export const InteractionModeSchema = z.enum(["Agent", "Ask", "Edit"]).catch("Agent");
export const InteractionModeBaseSchema = z.enum(["Agent", "Ask", "Edit"]);
export const InteractionModeBashPolicySchema = z.enum(["read_only", "full"]);
export const InteractionModeConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().catch(""),
  baseMode: InteractionModeBaseSchema,
  toolNames: z.array(z.string()).catch([]),
  customSystemPrompt: z.string().catch(""),
  builtIn: z.boolean(),
  bashPolicy: InteractionModeBashPolicySchema,
});
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

/** Action when the user selects a file Orion cannot open in the editor. */
export const UnopenableFileActionSchema = z
  .enum(["mention_in_chat", "open_externally"])
  .catch("mention_in_chat");

/** Content shown in each column of the empty-editor shortcut cards. */
export const EmptyEditorCardContentSchema = z.enum([
  "recent_files",
  "pinned_files",
  "pinned_workspaces",
]);

export const EmptyEditorCardSettingsSchema = z.object({
  leftCard: EmptyEditorCardContentSchema,
  rightCard: EmptyEditorCardContentSchema,
  /** Max list entries per empty-editor card column. */
  maxItems: z.number().int().min(1).max(20),
});

/** Left sidebar tab identifiers. */
export const SidebarViewIdSchema = z.enum([
  "files",
  "search",
  "toc",
  "cpu",
  "vars",
  "dataSources",
  "secrets",
]);

/** Notebook minimap output preview density. */
export const NotebookMinimapPreviewModeSchema = z.enum(["miniature", "compact"]);

export const AgentContextSettingsSchema = z.object({
  /** Fraction of context cap at which auto-compaction triggers (0–1). */
  compactionAutoThreshold: z.number().min(0).max(1),
  /** User-turn pairs kept verbatim after compaction. */
  compactionRetentionTurns: z.number().int().min(1),
  /** User-turn pairs kept verbatim in the wire optimizer. */
  optimizerRetentionTurns: z.number().int().min(1),
});

export const AgentToolOutputSettingsSchema = z.object({
  textCharBudget: z.number().int().positive(),
  imageBase64CharBudget: z.number().int().positive(),
  maxOmittedRatio: z.number().min(0).max(1),
});

export const AgentTerminalSettingsSchema = z.object({
  pollIntervalMs: z.number().int().positive(),
  foregroundBudgetMs: z.number().int().positive(),
  awaitBudgetMs: z.number().int().positive(),
  maxBlockMs: z.number().int().positive(),
  outputSpillThresholdChars: z.number().int().positive(),
  outputPreviewHeadChars: z.number().int().positive(),
  outputPreviewTailChars: z.number().int().positive(),
  executorTimeoutMs: z.number().int().positive(),
  executorAvailabilityTimeoutMs: z.number().int().positive(),
  executorPollIntervalMs: z.number().int().positive(),
  poolIdleTimeoutMs: z.number().int().positive(),
  poolSystemSize: z.number().int().min(1),
  poolReaperIntervalMs: z.number().int().positive(),
});

export const AgentSearchSettingsSchema = z.object({
  maxMatches: z.number().int().positive(),
  maxLineLength: z.number().int().positive(),
  globTerminalMaxResults: z.number().int().positive(),
  globMaxDisplayResults: z.number().int().positive(),
  grepTimeoutMs: z.number().int().positive(),
  whichTimeoutMs: z.number().int().positive(),
});

export const AgentFilesystemSettingsSchema = z.object({
  ignoreDirs: z.array(z.string().min(1)),
  binaryExtensions: z.array(z.string().min(1)),
  /** RegExp source strings for Ask-mode read-only bash guard. */
  blockedBashCommandPatterns: z.array(z.string().min(1)),
});

export const AgentWebSettingsSchema = z.object({
  toolTimeoutMs: z.number().int().positive(),
  fetchMaxResponseBytes: z.number().int().positive(),
  fetchMaxRedirects: z.number().int().min(0),
  searchDefaultNumResults: z.number().int().min(1),
  exaMcpUrl: z.string().url(),
});

export const AgentSettingsSchema = z.object({
  context: AgentContextSettingsSchema,
  toolOutput: AgentToolOutputSettingsSchema,
  terminal: AgentTerminalSettingsSchema,
  search: AgentSearchSettingsSchema,
  filesystem: AgentFilesystemSettingsSchema,
  web: AgentWebSettingsSchema,
});

export const NotebookOutputSettingsSchema = z.object({
  textOutputAutoCollapseThreshold: z.number().int().positive(),
  collapsedHeightDefaultPx: z.number().int().positive(),
  collapsedHeightMinPx: z.number().int().positive(),
  defaultPlotHeightPx: z.number().int().positive(),
  plotMinResizeWidthPx: z.number().int().positive(),
  plotMinResizeHeightPx: z.number().int().positive(),
  plotlyHoverCornerRatio: z.number().min(0).max(1),
  minimapOutputPreviewMaxLines: z.number().int().min(1),
  minimapHeadingNavigateDelayMs: z.number().int().positive(),
  chartColors: z.array(z.string().min(1)).min(1),
});

export const NotebookExportSettingsSchema = z.object({
  sansFontFamily: z.string().min(1),
});

export const NotebookEditorSettingsSchema = z.object({
  doublePressTimeoutMs: z.number().int().positive(),
});

const panelSizeTupleRefine = (sizes: number[]) =>
  sizes.every((n) => Number.isFinite(n) && n > 0);

export const ShellPanelVisibilitySettingsSchema = z.object({
  leftCollapsed: z.boolean(),
  rightCollapsed: z.boolean(),
  bottomCollapsed: z.boolean(),
  isFocusMode: z.boolean(),
});

export const ShellPanelLayoutSettingsSchema = z.object({
  horizontal: z
    .tuple([z.number(), z.number(), z.number()])
    .refine(panelSizeTupleRefine, "horizontal panel sizes must be positive"),
  vertical: z
    .tuple([z.number(), z.number()])
    .refine(panelSizeTupleRefine, "vertical panel sizes must be positive"),
});

export const ShellSidebarSettingsSchema = z.object({
  activeViews: z.array(SidebarViewIdSchema),
  openAccordionItems: z.array(SidebarViewIdSchema),
  showHiddenFiles: z.boolean(),
  showMinimapOutputs: z.boolean(),
  minimapPreviewMode: NotebookMinimapPreviewModeSchema,
  isSearchCaseSensitive: z.boolean(),
});

export const ShellChatSettingsSchema = z.object({
  maxHighlightChars: z.number().int().positive(),
  maxInlineLines: z.number().int().positive(),
  codeBlockInlineMaxHeightClass: z.string().min(1),
  markdownTableMaxHeightClass: z.string().min(1),
  awaitCommandCountdownSeconds: z.number().int().positive(),
});

export const ShellSettingsSchema = z.object({
  panelVisibility: ShellPanelVisibilitySettingsSchema,
  panelLayout: ShellPanelLayoutSettingsSchema,
  sidebar: ShellSidebarSettingsSchema,
  chat: ShellChatSettingsSchema,
  mobileBreakpointPx: z.number().int().positive(),
  minRefreshSpinMs: z.number().int().positive(),
  toastLimit: z.number().int().min(1),
});

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
    /** Client-safe configured state; real keys live in `~/.orion/credentials.json`. */
    configured: z.boolean().default(true),
    /** Optional OpenAI-compatible base URL for dynamically added providers. */
    baseUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal("chatgpt_oauth"),
    /** Client-safe configured state; real OAuth tokens live in `~/.orion/credentials.json`. */
    configured: z.boolean().default(true),
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
    /** Whether a local bearer token is stored server-side. */
    hasApiKey: z.boolean().default(false),
  }),
]);

export type ProviderCredentialSummary = z.infer<typeof ProviderCredentialSchema>;
export type ProviderCredential = ProviderCredentialSummary;

const SettingsDataSchema = z.object({
  appearance: z.object({
    theme: ThemeSettingSchema,
  }),
  chat: z.object({
    /** Model ID used when generating short chat titles. */
    titleGenerationModelId: z.string().min(1),
    toolApprovalMode: ToolApprovalModeSchema,
    /** Model IDs shown in the chat model selector. Order preserved. */
    pinnedModelIds: z.array(z.string()),
    /** User-defined display labels keyed by `providerId/modelId`. */
    modelLabels: z.record(z.string()).default({}),
    /** Font size in pixels for the chat message stream and composer. */
    fontSize: z.number().int().min(10).max(20),
    /** Communication style preset injected into the agent system prompt. */
    communicationStyle: AgentCommunicationStyleSchema,
    /**
     * Optional custom communication instructions. When non-empty, overrides
     * `communicationStyle` in the agent system prompt.
     */
    customCommunicationStyle: z.string().catch(""),
    /** User-configurable built-in and custom chat interaction modes. */
    interactionModes: z.array(InteractionModeConfigSchema).default([]),
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
    /** When a file cannot be opened in Orion, mention it in chat or open externally. */
    unopenableFileAction: UnopenableFileActionSchema,
    /** Left/right shortcut lists shown when no file is open in the editor. */
    emptyEditor: EmptyEditorCardSettingsSchema,
  }),
  notebook: z.object({
    /**
     * When true, the notebook editor shows a vertical scrollbar.
     * When false, scrolling still works but the scrollbar is hidden (overlay-style).
     */
    scrollbarVisible: z.boolean(),
    output: NotebookOutputSettingsSchema,
    export: NotebookExportSettingsSchema,
    editor: NotebookEditorSettingsSchema,
  }),
  workspace: z.object({
    /** Jupyter-relative directory paths pinned in the workspace picker (order preserved). */
    pinnedDirectoryPaths: z
      .array(z.string().min(1))
      .max(MAX_PINNED_WORKSPACE_DIRECTORY_PATHS),
    /** Jupyter-relative file paths pinned in the recent-files combobox (order preserved). */
    pinnedFilePaths: z.array(z.string().min(1)).max(MAX_PINNED_FILE_PATHS),
  }),
  agent: AgentSettingsSchema,
  shell: ShellSettingsSchema,
  providers: z
    .object({
      /** Client-safe per-provider credential summaries. Real secrets live in `~/.orion/credentials.json`. */
      credentials: z.record(ProviderCredentialSchema).default({}),
      /** Non-secret provider IDs the user explicitly added to the Providers tab. */
      addedProviderIds: z.array(z.string()).default([]),
    })
    .default({ credentials: {}, addedProviderIds: [] }),
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
export type InteractionModeBase = z.infer<typeof InteractionModeBaseSchema>;
export type InteractionModeBashPolicy = z.infer<typeof InteractionModeBashPolicySchema>;
export type InteractionModeConfig = z.infer<typeof InteractionModeConfigSchema>;
export type ToolApprovalMode = z.infer<typeof ToolApprovalModeSchema>;
export type WordWrapSetting = z.infer<typeof WordWrapSchema>;
export type UnopenableFileAction = z.infer<typeof UnopenableFileActionSchema>;
export type EmptyEditorCardContent = z.infer<typeof EmptyEditorCardContentSchema>;
export type EmptyEditorCardSettings = z.infer<typeof EmptyEditorCardSettingsSchema>;
export type AgentCommunicationStyle = z.infer<typeof AgentCommunicationStyleSchema>;
export type SidebarViewId = z.infer<typeof SidebarViewIdSchema>;
export type NotebookMinimapPreviewMode = z.infer<
  typeof NotebookMinimapPreviewModeSchema
>;
export type AgentContextSettings = z.infer<typeof AgentContextSettingsSchema>;
export type AgentToolOutputSettings = z.infer<typeof AgentToolOutputSettingsSchema>;
export type AgentTerminalSettings = z.infer<typeof AgentTerminalSettingsSchema>;
export type AgentSearchSettings = z.infer<typeof AgentSearchSettingsSchema>;
export type AgentFilesystemSettings = z.infer<typeof AgentFilesystemSettingsSchema>;
export type AgentWebSettings = z.infer<typeof AgentWebSettingsSchema>;
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;
export type NotebookOutputSettings = z.infer<typeof NotebookOutputSettingsSchema>;
export type NotebookExportSettings = z.infer<typeof NotebookExportSettingsSchema>;
export type NotebookEditorSettings = z.infer<typeof NotebookEditorSettingsSchema>;
export type ShellPanelVisibilitySettings = z.infer<
  typeof ShellPanelVisibilitySettingsSchema
>;
export type ShellPanelLayoutSettings = z.infer<typeof ShellPanelLayoutSettingsSchema>;
export type ShellSidebarSettings = z.infer<typeof ShellSidebarSettingsSchema>;
export type ShellChatSettings = z.infer<typeof ShellChatSettingsSchema>;
export type ShellSettings = z.infer<typeof ShellSettingsSchema>;
export type SettingsData = z.infer<typeof SettingsDataSchema>;
export type NotebookSettings = SettingsData["notebook"];
export type UserSettingsDocument = z.infer<typeof UserSettingsDocumentSchema>;
export type WorkspaceSettingsDocument = z.infer<typeof WorkspaceSettingsDocumentSchema>;
export type WorkspaceSettingsOverrides = WorkspaceSettingsDocument["overrides"];
