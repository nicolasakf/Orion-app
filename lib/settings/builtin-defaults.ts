/**
 * Canonical built-in values for settings schema defaults.
 * Mirrors hardcoded product constants until consumers read effectiveSettings.
 */

import {
  COMPACTION_AUTO_THRESHOLD,
  COMPACTION_RETENTION_TURNS,
  OPTIMIZER_RETENTION_TURNS,
} from "@/lib/agent/token-budget";
import {
  TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET,
  TOOL_OUTPUT_MAX_OMITTED_RATIO,
  TOOL_OUTPUT_TEXT_CHAR_BUDGET,
} from "@/lib/agent/tool-output-guard";
import { DEFAULT_MAX_PARALLEL_READ_ONLY_CALLS } from "@/lib/agent/tool-execution-policy";
import {
  DEFAULT_AWAIT_BUDGET_MS,
  DEFAULT_FOREGROUND_BUDGET_MS,
  MAX_TERMINAL_BLOCK_MS,
  TERMINAL_POLL_INTERVAL_MS,
} from "@/lib/agent/tools/terminal-command-utils";
import { BLOCKED_COMMAND_PATTERN_SOURCES } from "@/lib/agent/read-only-bash-guard";
import {
  EXA_MCP_URL,
  WEB_FETCH_MAX_REDIRECTS,
  WEB_FETCH_MAX_RESPONSE_BYTES,
  WEB_SEARCH_DEFAULT_NUM_RESULTS,
  WEB_TOOL_TIMEOUT_MS,
} from "@/lib/agent/web-tools-constants";
import {
  BINARY_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
} from "@/lib/workspace/search-policies";
import {
  DEFAULT_PANEL_LAYOUT_STATE,
  DEFAULT_PANEL_VISIBILITY_STATE,
} from "@/lib/ui-session-state";
import type {
  AgentContextSettings,
  AgentExecutionSettings,
  AgentFilesystemSettings,
  AgentGoalSettings,
  AgentSettings,
  AgentTerminalSettings,
  AgentToolOutputSettings,
  AgentWebSettings,
  NotebookEditorSettings,
  NotebookExportSettings,
  NotebookOutputSettings,
  NotebookSettings,
  ShellChatSettings,
  ShellPanelLayoutSettings,
  ShellPanelVisibilitySettings,
  ShellSettings,
  ShellSidebarSettings,
} from "@/lib/settings/schema";
import { DEFAULT_MAX_QUESTIONS_PER_ASK } from "@/lib/settings/schema";

/** Stable list order for directory names skipped during listings. */
export const DEFAULT_IGNORE_DIRS_LIST: readonly string[] = [
  ...DEFAULT_IGNORE_DIRS,
];

/** Stable list order for extensions treated as binary in search tools. */
export const BINARY_EXTENSIONS_LIST: readonly string[] = [
  ...BINARY_EXTENSIONS,
];

/** Default chart palette (Recharts) for notebook table charts. */
export const NOTEBOOK_CHART_COLORS: readonly string[] = [
  "#8884d8",
  "#83a6ed",
  "#8dd1e1",
  "#82ca9d",
  "#a4de6c",
  "#d0ed57",
  "#ffc658",
  "#ff8042",
  "#ff6361",
  "#bc5090",
];

/** Notebook HTML/PDF export font stack (see lib/notebook/notebook-export.ts). */
export const NOTEBOOK_EXPORT_SANS_FONT_FAMILY = "'Saira', sans-serif";

/** From lib/agent/tools/bash.ts (private module constants). */
export const BASH_OUTPUT_SPILL_THRESHOLD_CHARS = 200_000;
/** From lib/agent/tools/bash.ts. */
export const BASH_OUTPUT_PREVIEW_HEAD_CHARS = 6_000;
/** From lib/agent/tools/bash.ts. */
export const BASH_OUTPUT_PREVIEW_TAIL_CHARS = 6_000;

/** From lib/shell/terminal-pool.ts. */
export const TERMINAL_POOL_IDLE_TIMEOUT_MS = 60 * 60 * 1_000;
/** From lib/shell/terminal-pool.ts. */
export const TERMINAL_POOL_REAPER_INTERVAL_MS = 60_000;

/** From components/notebook/utils.ts. */
export const NOTEBOOK_TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD = 2000;
/** From components/notebook/output-renderer.tsx. */
export const NOTEBOOK_COLLAPSED_HEIGHT_DEFAULT_PX = 192;
/** From components/notebook/output-renderer.tsx. */
export const NOTEBOOK_COLLAPSED_HEIGHT_MIN_PX = 64;
/** From components/notebook/renderers/plotly-json.tsx. */
export const NOTEBOOK_DEFAULT_PLOT_HEIGHT_PX = 360;
/** From components/notebook/renderers/plotly-json.tsx. */
export const NOTEBOOK_PLOT_MIN_RESIZE_WIDTH_PX = 160;
/** From components/notebook/renderers/plotly-json.tsx. */
export const NOTEBOOK_PLOT_MIN_RESIZE_HEIGHT_PX = 120;
/** From components/notebook/renderers/plotly-json.tsx. */
export const NOTEBOOK_PLOTLY_HOVER_CORNER_RATIO = 0.15;
/** From components/notebook/notebook-minimap-panel.tsx. */
export const NOTEBOOK_MINIMAP_OUTPUT_PREVIEW_MAX_LINES = 4;
/** From components/notebook/notebook-minimap-panel.tsx. */
export const NOTEBOOK_MINIMAP_HEADING_NAVIGATE_DELAY_MS = 220;
/** From components/notebook/notebook-editor.tsx. */
export const NOTEBOOK_EDITOR_DOUBLE_PRESS_TIMEOUT_MS = 400;

/** From components/right-sidebar/code-block.tsx (inlined — do not import client module). */
export const SHELL_CHAT_MAX_HIGHLIGHT_CHARS = 15_000;
/** From components/right-sidebar/code-block.tsx (inlined). */
export const SHELL_CHAT_MAX_INLINE_LINES = 24;
import {
  CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS,
  CODE_BLOCK_INLINE_MAX_HEIGHT_CLASS,
} from "@/lib/right-sidebar/code-block-constants";
/** From components/right-sidebar/tool-invocation-card.tsx. */
export const SHELL_CHAT_AWAIT_COMMAND_COUNTDOWN_SECONDS = 30;

/** From components/ui/use-mobile.tsx. */
export const SHELL_MOBILE_BREAKPOINT_PX = 768;
/** From lib/utils.ts. */
export const SHELL_MIN_REFRESH_SPIN_MS = 500;
/** From components/ui/use-toast.ts. */
export const SHELL_TOAST_LIMIT = 1;

/** Built-in agent settings defaults. */
export const BUILTIN_AGENT_CONTEXT_DEFAULTS: AgentContextSettings = {
  compactionAutoThreshold: COMPACTION_AUTO_THRESHOLD,
  compactionRetentionTurns: COMPACTION_RETENTION_TURNS,
  optimizerRetentionTurns: OPTIMIZER_RETENTION_TURNS,
};

/** Built-in agent tool output guard defaults. */
export const BUILTIN_AGENT_TOOL_OUTPUT_DEFAULTS: AgentToolOutputSettings = {
  textCharBudget: TOOL_OUTPUT_TEXT_CHAR_BUDGET,
  imageBase64CharBudget: TOOL_OUTPUT_IMAGE_BASE64_CHAR_BUDGET,
  maxOmittedRatio: TOOL_OUTPUT_MAX_OMITTED_RATIO,
};

/** Built-in agent tool execution defaults. */
export const BUILTIN_AGENT_EXECUTION_DEFAULTS: AgentExecutionSettings = {
  maxParallelReadOnlyCalls: DEFAULT_MAX_PARALLEL_READ_ONLY_CALLS,
  maxQuestionsPerAsk: DEFAULT_MAX_QUESTIONS_PER_ASK,
};

/** Built-in goal supervisor defaults. */
export const BUILTIN_AGENT_GOAL_DEFAULTS: AgentGoalSettings = {
  maxReviews: 10,
};

/** Built-in terminal tool defaults. */
export const BUILTIN_AGENT_TERMINAL_DEFAULTS: AgentTerminalSettings = {
  pollIntervalMs: TERMINAL_POLL_INTERVAL_MS,
  foregroundBudgetMs: DEFAULT_FOREGROUND_BUDGET_MS,
  awaitBudgetMs: DEFAULT_AWAIT_BUDGET_MS,
  maxBlockMs: MAX_TERMINAL_BLOCK_MS,
  outputSpillThresholdChars: BASH_OUTPUT_SPILL_THRESHOLD_CHARS,
  outputPreviewHeadChars: BASH_OUTPUT_PREVIEW_HEAD_CHARS,
  outputPreviewTailChars: BASH_OUTPUT_PREVIEW_TAIL_CHARS,
  poolIdleTimeoutMs: TERMINAL_POOL_IDLE_TIMEOUT_MS,
  poolReaperIntervalMs: TERMINAL_POOL_REAPER_INTERVAL_MS,
};

/** Built-in filesystem policy defaults. */
export const BUILTIN_AGENT_FILESYSTEM_DEFAULTS: AgentFilesystemSettings = {
  ignoreDirs: [...DEFAULT_IGNORE_DIRS_LIST],
  binaryExtensions: [...BINARY_EXTENSIONS_LIST],
  blockedBashCommandPatterns: [...BLOCKED_COMMAND_PATTERN_SOURCES],
};

/** Built-in web tool defaults. */
export const BUILTIN_AGENT_WEB_DEFAULTS: AgentWebSettings = {
  toolTimeoutMs: WEB_TOOL_TIMEOUT_MS,
  fetchMaxResponseBytes: WEB_FETCH_MAX_RESPONSE_BYTES,
  fetchMaxRedirects: WEB_FETCH_MAX_REDIRECTS,
  searchDefaultNumResults: WEB_SEARCH_DEFAULT_NUM_RESULTS,
  exaMcpUrl: EXA_MCP_URL,
};

/** Full built-in agent settings tree. */
export const BUILTIN_AGENT_DEFAULTS: AgentSettings = {
  context: BUILTIN_AGENT_CONTEXT_DEFAULTS,
  toolOutput: BUILTIN_AGENT_TOOL_OUTPUT_DEFAULTS,
  execution: BUILTIN_AGENT_EXECUTION_DEFAULTS,
  goals: BUILTIN_AGENT_GOAL_DEFAULTS,
  terminal: BUILTIN_AGENT_TERMINAL_DEFAULTS,
  filesystem: BUILTIN_AGENT_FILESYSTEM_DEFAULTS,
  web: BUILTIN_AGENT_WEB_DEFAULTS,
};

/** Built-in notebook output UI defaults. */
export const BUILTIN_NOTEBOOK_OUTPUT_DEFAULTS: NotebookOutputSettings = {
  textOutputAutoCollapseThreshold: NOTEBOOK_TEXT_OUTPUT_AUTO_COLLAPSE_THRESHOLD,
  collapsedHeightDefaultPx: NOTEBOOK_COLLAPSED_HEIGHT_DEFAULT_PX,
  collapsedHeightMinPx: NOTEBOOK_COLLAPSED_HEIGHT_MIN_PX,
  defaultPlotHeightPx: NOTEBOOK_DEFAULT_PLOT_HEIGHT_PX,
  plotMinResizeWidthPx: NOTEBOOK_PLOT_MIN_RESIZE_WIDTH_PX,
  plotMinResizeHeightPx: NOTEBOOK_PLOT_MIN_RESIZE_HEIGHT_PX,
  plotlyHoverCornerRatio: NOTEBOOK_PLOTLY_HOVER_CORNER_RATIO,
  minimapOutputPreviewMaxLines: NOTEBOOK_MINIMAP_OUTPUT_PREVIEW_MAX_LINES,
  minimapHeadingNavigateDelayMs: NOTEBOOK_MINIMAP_HEADING_NAVIGATE_DELAY_MS,
  chartColors: [...NOTEBOOK_CHART_COLORS],
};

/** Built-in notebook export defaults. */
export const BUILTIN_NOTEBOOK_EXPORT_DEFAULTS: NotebookExportSettings = {
  sansFontFamily: NOTEBOOK_EXPORT_SANS_FONT_FAMILY,
};

/** Built-in notebook editor defaults. */
export const BUILTIN_NOTEBOOK_EDITOR_DEFAULTS: NotebookEditorSettings = {
  doublePressTimeoutMs: NOTEBOOK_EDITOR_DOUBLE_PRESS_TIMEOUT_MS,
};

/** Full built-in notebook settings (scrollbar flag filled in defaults.ts). */
export const BUILTIN_NOTEBOOK_DEFAULTS: Omit<
  NotebookSettings,
  "scrollbarVisible"
> = {
  output: BUILTIN_NOTEBOOK_OUTPUT_DEFAULTS,
  export: BUILTIN_NOTEBOOK_EXPORT_DEFAULTS,
  editor: BUILTIN_NOTEBOOK_EDITOR_DEFAULTS,
};

/** Built-in shell panel visibility defaults. */
export const BUILTIN_SHELL_PANEL_VISIBILITY_DEFAULTS: ShellPanelVisibilitySettings =
  {
    leftCollapsed: DEFAULT_PANEL_VISIBILITY_STATE.leftCollapsed,
    rightCollapsed: DEFAULT_PANEL_VISIBILITY_STATE.rightCollapsed,
    bottomCollapsed: DEFAULT_PANEL_VISIBILITY_STATE.bottomCollapsed,
    isFocusMode: DEFAULT_PANEL_VISIBILITY_STATE.isFocusMode,
  };

/** Built-in shell panel layout defaults (percentages). */
export const BUILTIN_SHELL_PANEL_LAYOUT_DEFAULTS: ShellPanelLayoutSettings = {
  horizontal: [...DEFAULT_PANEL_LAYOUT_STATE.horizontal] as [
    number,
    number,
    number,
  ],
  vertical: [...DEFAULT_PANEL_LAYOUT_STATE.vertical] as [number, number],
};

/** Built-in left sidebar defaults (from left-sidebar session defaults). */
export const BUILTIN_SHELL_SIDEBAR_DEFAULTS: ShellSidebarSettings = {
  activeViews: ["files"],
  openAccordionItems: ["files", "toc"],
  showHiddenFiles: true,
  showMinimapOutputs: true,
  minimapPreviewMode: "compact",
  isSearchCaseSensitive: false,
};

/** Built-in chat chrome defaults. */
export const BUILTIN_SHELL_CHAT_DEFAULTS: ShellChatSettings = {
  maxHighlightChars: SHELL_CHAT_MAX_HIGHLIGHT_CHARS,
  maxInlineLines: SHELL_CHAT_MAX_INLINE_LINES,
  codeBlockInlineMaxHeightClass: CODE_BLOCK_INLINE_MAX_HEIGHT_CLASS,
  markdownTableMaxHeightClass: CHAT_MARKDOWN_TABLE_MAX_HEIGHT_CLASS,
  awaitCommandCountdownSeconds: SHELL_CHAT_AWAIT_COMMAND_COUNTDOWN_SECONDS,
};

/** Full built-in shell settings tree. */
export const BUILTIN_SHELL_DEFAULTS: ShellSettings = {
  panelVisibility: BUILTIN_SHELL_PANEL_VISIBILITY_DEFAULTS,
  panelLayout: BUILTIN_SHELL_PANEL_LAYOUT_DEFAULTS,
  sidebar: BUILTIN_SHELL_SIDEBAR_DEFAULTS,
  chat: BUILTIN_SHELL_CHAT_DEFAULTS,
  userTerminalWorkingDirectory: "workspace",
  mobileBreakpointPx: SHELL_MOBILE_BREAKPOINT_PX,
  minRefreshSpinMs: SHELL_MIN_REFRESH_SPIN_MS,
  toastLimit: SHELL_TOAST_LIMIT,
};
