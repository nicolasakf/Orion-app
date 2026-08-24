"use client";

import * as React from "react";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { flushSync } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { type UIMessage, type FileUIPart, DefaultChatTransport } from "ai";
import { Bot, ChevronLeft, Target } from "lucide-react";

import { toast } from "sonner";
import {
  chatStorage,
  getTextContent,
  type Chat,
  type ChatCostSummary,
  type ChatMessage,
  type CompactionSummary,
  type SubagentSession,
  type SubagentSessionStatus,
} from "@/lib/chat/chat-storage";
import { deduplicateMessagesById } from "@/lib/chat/chat-message-deduplication";
import {
  createChatFork,
  getInPlaceEditRestoreCheckpointIds as getRestorableInPlaceEditCheckpointIds,
  truncateChatForInPlaceEdit,
} from "@/lib/chat/chat-forking";
import {
  buildManagedExternalFileReference,
  cleanupExpiredChatAttachments,
  markManagedAttachmentMessageReferencesUnavailable,
  markManagedAttachmentReferencesUnavailable,
  scheduleChatAttachmentCleanup,
  storeChatAttachment,
} from "@/lib/chat/chat-attachments.client";
import { downloadChatTranscriptMarkdown } from "@/lib/chat/export-chat-transcript";
import {
  formatCellReferenceLabel,
  formatOutputReferenceLabel,
  formatReferencesForMessage,
  normalizeChatMessageMetadata,
  parseChatMessageReferences,
  type ChatReferenceOption,
  type ChatReferenceType,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import {
  getInsertChatMessageDetail,
  getInsertChatSkillDetail,
  INSERT_CHAT_MESSAGE_EVENT,
  INSERT_CHAT_SKILL_EVENT,
  insertMessageIntoComposerInput,
  insertSkillIntoComposerInput,
  shouldDispatchAutoFix,
} from "@/lib/chat/chat-composer-events";
import { parseChatApiErrorMessage } from "@/lib/chat/chat-api-errors";
import {
  canStartContextRecovery,
  runContextRecoveryAttempt,
} from "@/lib/chat/context-recovery";
import { compactConversation } from "@/lib/agent/context-manager";
import {
  buildWirePayload,
  stripAllRasterData,
} from "@/lib/agent/context-optimizer";
import { resolveModelDisplayLabel } from "@/lib/agent/model-display-label";
import { getLocalModelLabel } from "@/lib/agent/local-model-labels";
import {
  decodeLocalModelCatalogId,
  encodeLocalModelCatalogId,
  isLocalProvider,
  normalizeLocalEndpointModels,
} from "@/lib/agent/local-provider-models";
import { UNKNOWN_CONTEXT_FALLBACK_TOKENS } from "@/lib/agent/token-budget";
import {
  ContextMeasurementSchema,
  exceedsContextBudget,
  shouldCompactBeforeSend,
  type ContextMeasurement,
} from "@/lib/agent/context-usage";
import { useAssistantChatOptional } from "@/lib/agent";
import type { AgentRule } from "@/lib/agent/rules";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { getMissingToolRuntimeDependency } from "@/lib/agent/tool-runtime-readiness";
import {
  isAbsoluteAgentPath,
  toAgentAbsolutePath,
} from "@/lib/agent/path-resolver";
import {
  normalizeInteractionModeConfigs,
  resolveInteractionModeConfig,
  resolveSelectorInteractionModeId,
} from "@/lib/agent/interaction-modes";
import { modeAllowsChainedCellExecution } from "@/lib/agent/mode-capabilities";
import { isReadOnlyBashBlocked } from "@/lib/agent/read-only-bash-guard";
import { restoreEditCheckpoint } from "@/lib/agent/edit-checkpoint-restore";
import { prepareToolResultForModel } from "@/lib/agent/visual-evidence";
import {
  advanceResearchSessionForContinuation,
  createInactiveResearchSession,
  createResearchSession,
  getResearchTurnActivity,
  RESEARCH_SESSION_MAX_STEPS,
  type ResearchNudge,
  type ResearchSessionIntensity,
  type ResearchSessionSnapshot,
} from "@/lib/agent/research-session";
import type { EditCheckpointStatus } from "@/lib/agent/edit-checkpoints";
import { needsApproval } from "@/lib/agent/tool-approval";
import type { AskQuestionResult } from "@/lib/agent/ask-question";
import {
  OrderedToolExecutionScheduler,
  throwIfToolExecutionAborted,
} from "@/lib/agent/tool-execution-scheduler";
import type { ToolApprovalMode } from "@/lib/settings/schema";
import {
  DEFAULT_TITLE_GENERATION_MAX_LENGTH,
  DEFAULT_TITLE_GENERATION_MODEL_ID,
} from "@/lib/settings/defaults";
import type { KernelStatus, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useAgentRunCompleteAlerts } from "@/hooks/use-agent-run-complete-alerts";
import { useJupyterShellReady } from "@/hooks/use-jupyter-shell-ready";
import { useKernelVariables } from "@/hooks/use-kernel-variables";
import { useIsDesktopApp, usePlatformOs } from "@/hooks/use-platform";
import { useOpenSettings } from "@/contexts/open-settings-context";
import {
  requestAgentCompleteNotificationPermission,
  unlockAgentCompleteAudio,
} from "@/lib/notifications/agent-run-complete";
import { AutoRunConfirmDialog } from "@/components/common/auto-run-confirm-dialog";
import { ProviderLogo } from "@/components/provider-logo";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  createGoalSession,
  endGoalSupervision,
  failGoalEvaluation,
  finishGoalEvaluation,
  pauseGoalSupervision,
  startGoalEvaluation,
} from "@/lib/agent/goals/controller";
import {
  buildGoalArtifactManifest,
  scanGoalWorkspace,
} from "@/lib/agent/goals/manifest";
import {
  isRecoverableGoalEvaluationError,
  runGoalEvaluation,
  trimGoalEvaluatorTranscript,
} from "@/lib/agent/goals/evaluator-runner";
import {
  GoalContractSchema,
  type GoalContinuation,
  type GoalSession,
} from "@/lib/agent/goals/types";
import {
  GOAL_CONTRACT_AUTHOR_MAX_INVESTIGATION_STEPS,
  GOAL_CONTRACT_PROPOSAL_TOOL_NAME,
  applyGoalContractProposalResult,
  countGoalContractAuthorInvestigationSteps,
  deriveGoalContractDraftState,
  findGoalContractProposal,
  findGoalContractProposalPart,
  lastAssistantTurnHasGoalContractProposal,
} from "@/lib/agent/goals/contract-author";
import {
  loadGoalSession,
  removeGoalSession,
  persistGoalSession,
} from "@/lib/agent/goals/storage.client";
import { buildGoalSupervisorMessages } from "@/lib/agent/goals/supervisor-transcript";

import { runSubagent } from "@/lib/agent/subagents/client-runner";
import { getSubagentStepDescription } from "./tool-invocation-helpers";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";
import { ChatToolbar } from "./chat-toolbar";
import { ChatBody } from "./chat-body";
import { BUSINESS_PROMPT_CATEGORIES } from "./business-prompt-library";
import { ChatSurface } from "./chat-surface";
import { createCostSummaryMessageId } from "./cost-summary-card";
import { ChatTextbox, type ReferenceTab } from "./chat-textbox";
import {
  attachPersistedToolTimings,
  finalizeCompletedToolTimings,
  type ToolTiming,
} from "./assistant-activity-grouping";
import {
  getCompletedToolContinuationKey,
  getTranscriptProgressCount,
  shouldContinueAfterToolCalls,
} from "./assistant-turn-state";
import { useContextUsage } from "./use-context-usage";
import { usePendingCostAutoRefresh } from "./use-pending-cost-auto-refresh";
import {
  ORION_GITHUB_ISSUES_URL,
  buildSkillSlashCommands,
  buildSubagentSlashCommands,
  detectActiveSlashCommand,
  type SlashCommand,
} from "./slash-commands";
import { resolveSubagentExecutionModel } from "./subagent-model-resolution";
import type {
  ChatDraftAttachment,
  EditingState,
  InteractionMode,
  LLM,
  ModelSettings,
  ModelSettingsMap,
  QueuedMessage,
} from "./types";

import type { SettingsTab } from "@/components/settings-dialog/types";
import {
  loadGoalEvaluatorModelFromSession,
  loadModelSettingsMapFromSession,
  loadSelectedModelFromSession,
  resolveSelectedModelFallback,
  saveGoalEvaluatorModelToSession,
  saveModelSettingsMapToSession,
  saveSelectedModelToSession,
} from "./model-selection";
import { resolveTitleGenerationModel } from "./title-generation-model";
import { GoalStatusBar } from "./goal-status-bar";
import {
  resolveGoalModeSubmission,
  type GoalModeActivation,
} from "./goal-mode-submission";
import {
  findModelBySelectionKey,
  formatModelSelectionKey,
  normalizePinnedModelKeys,
  parseModelSelectionKey,
  resolveCatalogModelIdForApi,
} from "@/lib/agent/model-selection-key";

/** Builds the candidate transcript that will exist after the current draft is sent. */
function appendDraftForPreflight(
  messages: UIMessage[],
  text: string,
  files: FileUIPart[],
  references: ResolvedChatReference[],
): UIMessage[] {
  if (!text.trim() && files.length === 0 && references.length === 0)
    return messages;
  return [
    ...messages,
    {
      id: "context-preflight-draft",
      role: "user",
      parts: [
        ...(text.trim() ? [{ type: "text" as const, text }] : []),
        ...files,
      ],
      ...(references.length > 0 ? { metadata: { references } } : {}),
    },
  ];
}

const MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS = 1;
const MAX_GOAL_CONTRACT_PROPOSAL_RETRIES = 2;
const CANCELLED_TOOL_RESULT = { error: "cancelled_by_user" } as const;
const REJECTED_TOOL_RESULT = { error: "rejected_by_user" } as const;

/** Stable retry key shared by every prose-only response to one contract instruction. */
function getGoalContractProposalRetryKey(messages: UIMessage[]): string | null {
  const latestUserMessage = messages.findLast(
    (message) => message.role === "user",
  );
  return latestUserMessage
    ? `goal-contract:proposal:${latestUserMessage.id}`
    : null;
}

/**
 * Extract assistant text from `/api/chat` stream responses for title generation.
 * AI SDK v6+ uses SSE lines `data: {"type":"text-delta","delta":"..."}`; older
 * clients used `d:` / `0:` prefixed lines — we support both.
 */
function parseTitleFromChatStreamResponse(raw: string): string {
  let out = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("data: ")) {
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const data = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          textDelta?: string;
          text?: string;
        };
        if (data.type === "text-delta") {
          if (typeof data.delta === "string") out += data.delta;
          else if (typeof data.textDelta === "string") out += data.textDelta;
        } else if (data.type === "text" && typeof data.text === "string") {
          out += data.text;
        }
      } catch {
        // ignore malformed SSE JSON
      }
      continue;
    }

    if (line.startsWith("d:")) {
      try {
        const data = JSON.parse(line.slice(2)) as {
          type?: string;
          text?: string;
          textDelta?: string;
        };
        if (data.type === "text" && data.text) out += data.text;
        else if (data.type === "text-delta" && data.textDelta)
          out += data.textDelta;
      } catch {
        // skip
      }
      continue;
    }

    if (line.startsWith("0:")) {
      try {
        out += JSON.parse(line.slice(2)) as string;
      } catch {
        // skip
      }
    }
  }
  return out;
}

function isStaticLocalModelValue(modelId: string): boolean {
  return decodeLocalModelCatalogId(modelId) === undefined;
}

/**
 * Maps the editor's active file path into `/api/chat` agent context fields.
 * `.ipynb` → notebookPath; any other path → activeFilePath (mutually exclusive).
 */
function agentEditorContext(activeEditorPath: string | undefined): {
  notebookPath: string | undefined;
  activeFilePath: string | undefined;
} {
  if (!activeEditorPath) {
    return { notebookPath: undefined, activeFilePath: undefined };
  }
  if (activeEditorPath.endsWith(".ipynb")) {
    return { notebookPath: activeEditorPath, activeFilePath: undefined };
  }
  return { notebookPath: undefined, activeFilePath: activeEditorPath };
}

/** Display basename for a Jupyter-relative path. */
function fileNameFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function truncatePreview(text: string, maxLength = 900): string {
  const compact = text.trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function notebookCellSourcePreview(
  cell: NotebookType["cells"][number],
  maxLength = 900,
): string {
  const source = cell.source.join("");
  return truncatePreview(source || "(empty cell)", maxLength);
}

function notebookCellDescription(
  cell: NotebookType["cells"][number],
  index: number,
): string {
  const firstLine = cell.source.join("").trim().split(/\r?\n/).find(Boolean);
  const sourceSummary = firstLine
    ? truncatePreview(firstLine, 160)
    : "empty cell";
  return `${cell.cell_type} cell #${index + 1}: ${sourceSummary}`;
}

/** Formats a compact line-range suffix for editor selection references. */
function formatLineRange(lineStart: number, lineEnd: number): string {
  return lineStart === lineEnd ? `L${lineStart}` : `L${lineStart}-L${lineEnd}`;
}

/** Formats the chip label for a selected file or notebook-cell source range. */
function formatFileSelectionReferenceLabel(
  path: string,
  lineStart: number,
  lineEnd: number,
): string {
  return `${fileNameFromPath(path)}:${formatLineRange(lineStart, lineEnd)}`;
}

/** Formats the chip label for selected source lines inside a notebook cell. */
function formatCellSelectionReferenceLabel(
  cellIndex: number,
  lineStart: number,
  lineEnd: number,
): string {
  return `${formatCellReferenceLabel([cellIndex])}:${formatLineRange(lineStart, lineEnd)}`;
}

/** Creates a short stable suffix so separate conversation snippets remain distinct chips. */
function hashConversationSelection(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/** Formats the chip label for a selected assistant or tool-card snippet. */
function formatConversationSelectionReferenceLabel(
  source: "assistant" | "tool",
  messageIndex: number,
  toolName?: string,
): string {
  if (source === "tool") {
    return toolName
      ? `${toolName} output #${messageIndex + 1}`
      : `Tool output #${messageIndex + 1}`;
  }
  return `Assistant #${messageIndex + 1}`;
}

function makeReference(
  type: ChatReferenceType,
  label: string,
  locator: ResolvedChatReference["locator"],
  preview: string,
  toolHint?: string,
): ResolvedChatReference {
  return {
    id: `${type}:${JSON.stringify(locator)}`,
    type,
    label,
    locator,
    status: "resolved",
    preview: truncatePreview(preview),
    resolvedAt: new Date().toISOString(),
    ...(toolHint ? { toolHint } : {}),
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("File reader returned a non-string result."));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function makeExternalFileReference(file: File): ResolvedChatReference {
  const mediaType = file.type || "application/octet-stream";
  const locator = {
    type: "external-file" as const,
    fileName: file.name,
    mediaType,
    size: file.size,
    ...(file.lastModified > 0 ? { lastModified: file.lastModified } : {}),
  };
  const kind = mediaType.startsWith("image/") ? "image" : "file";
  return makeReference(
    "external-file",
    file.name,
    locator,
    `${kind === "image" ? "Image" : "External file"}: ${file.name} (${mediaType}, ${file.size} bytes).`,
    "This external file is pointer-only unless a separate image input is present in the message; no file contents are available through workspace tools.",
  );
}

function stripSessionOnlyFileParts(message: UIMessage): UIMessage {
  if (
    !Array.isArray(message.parts) ||
    !message.parts.some((part) => part.type === "file")
  ) {
    return message;
  }
  return {
    ...message,
    parts: message.parts.filter((part) => part.type !== "file"),
  };
}

type CancelledToolOutput = {
  error: "cancelled_by_user";
  durationMs?: number;
};

const PENDING_TOOL_STATES = new Set([
  "input-available",
  "input-streaming",
  "approval-requested",
  "approval-responded",
]);

const TERMINAL_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

/** True when a tool part is still awaiting execution, approval, or output. */
function isPendingToolPart(
  part: UIMessage["parts"][number],
): part is UIMessage["parts"][number] & {
  toolCallId: string;
  state: string;
} {
  return (
    part.type.startsWith("tool-") &&
    part.type !== `tool-${GOAL_CONTRACT_PROPOSAL_TOOL_NAME}` &&
    "toolCallId" in part &&
    typeof part.toolCallId === "string" &&
    "state" in part &&
    typeof part.state === "string" &&
    PENDING_TOOL_STATES.has(part.state)
  );
}

/** Convert pending tool parts to a durable cancelled terminal state. */
function cancelPendingToolParts<T extends UIMessage>(
  messages: T[],
  options: {
    getCancelledOutput: (toolCallId: string) => CancelledToolOutput;
    onCancelledToolCall?: (
      toolCallId: string,
      result: CancelledToolOutput,
    ) => void;
  },
): { messages: T[]; changed: boolean } {
  let changed = false;
  const nextMessages = messages.map((msg) => {
    let messageChanged = false;
    const nextParts = msg.parts.map((part) => {
      if (!isPendingToolPart(part)) return part;

      messageChanged = true;
      changed = true;
      const cancelledOutput = options.getCancelledOutput(part.toolCallId);
      options.onCancelledToolCall?.(part.toolCallId, cancelledOutput);
      return {
        ...part,
        state: "output-error" as const,
        output: cancelledOutput,
        errorText: "cancelled_by_user",
      };
    });

    return messageChanged ? ({ ...msg, parts: nextParts } as T) : msg;
  });

  return { messages: nextMessages, changed };
}

/** Repair persisted chats whose browser session ended with pending tool calls. */
function cancelStalePendingToolsInChat(chat: Chat): {
  chat: Chat;
  changed: boolean;
} {
  const result = cancelPendingToolParts(chat.messages, {
    getCancelledOutput: () => ({ error: "cancelled_by_user" }),
  });
  if (!result.changed) return { chat, changed: false };
  return {
    chat: {
      ...chat,
      messages: result.messages,
    },
    changed: true,
  };
}

/** Repair repeated AI SDK message snapshots left by an overlapping-send race. */
function deduplicateMessagesInChat(chat: Chat): {
  chat: Chat;
  changed: boolean;
} {
  const result = deduplicateMessagesById(chat.messages);
  if (!result.changed) return { chat, changed: false };
  return {
    chat: {
      ...chat,
      messages: result.messages,
    },
    changed: true,
  };
}

type ReferenceWorkspaceEntry = {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
};

type SerializedSubagent = {
  name: string;
  label?: string;
  description: string;
  options?: {
    model?: string;
    disableModelInvocation: boolean;
  };
};

type SerializedSkill = {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
};

type SerializedAgentRule = AgentRule;

/** Pulls selected skill slash tokens out of a user message while preserving message text. */
function extractSkillSlashCommands(
  value: string,
  skillCommands: SlashCommand[],
): { skillNames: string[]; message: string } {
  if (skillCommands.length === 0 || !value.includes("/")) {
    return { skillNames: [], message: value.trim() };
  }

  const labelToName = new Map(
    skillCommands.map((command) => [
      command.label,
      command.name.slice("skill:".length),
    ]),
  );
  const skillNames: string[] = [];
  const seen = new Set<string>();
  const message = value
    .replace(
      /(^|\s)(\/[\w-]+)(?=\s|$)/g,
      (match, leading: string, label: string) => {
        const skillName = labelToName.get(label);
        if (!skillName) return match;
        if (!seen.has(skillName)) {
          seen.add(skillName);
          skillNames.push(skillName);
        }
        return leading;
      },
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { skillNames, message };
}

/** Human-friendly fallback request when the user submits only selected skills. */
function formatApplySkillsRequest(skillNames: string[]): string {
  if (skillNames.length === 1) return `Apply the ${skillNames[0]} skill.`;
  return `Apply the ${skillNames.join(", ")} skills.`;
}

type NotebookCellMentionEventDetail = {
  notebookPath?: unknown;
  cellIndex?: unknown;
  preview?: unknown;
};

type NotebookOutputMentionEventDetail = {
  notebookPath?: unknown;
  cellIndex?: unknown;
  outputIndex?: unknown;
  preview?: unknown;
};

type WorkspacePathMentionEventDetail = {
  path?: unknown;
  itemType?: unknown;
  name?: unknown;
};

type EditorSelectionAttachEventDetail = {
  path?: unknown;
  lineStart?: unknown;
  lineEnd?: unknown;
  selectedText?: unknown;
  notebookCellIndex?: unknown;
};

type ConversationSelectionMentionEventDetail = {
  selectedText?: unknown;
  source?: unknown;
  messageId?: unknown;
  messageIndex?: unknown;
  partIndex?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
};

/** Preserve skill invocation metadata in the request body while omitting client-only fields. */
function serializeAvailableSkills(
  skills: Array<{
    name: string;
    description: string;
    disableModelInvocation?: boolean;
  }>,
): SerializedSkill[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    ...(skill.disableModelInvocation !== undefined
      ? { disableModelInvocation: skill.disableModelInvocation }
      : {}),
  }));
}

function serializeAvailableSubagents(
  subagents: Array<{
    name: string;
    label?: string;
    description: string;
    options?: { model?: string; disableModelInvocation: boolean };
  }>,
): SerializedSubagent[] {
  return subagents.map((subagent) => ({
    name: subagent.name,
    label: subagent.label,
    description: subagent.description,
    ...(subagent.options ? { options: subagent.options } : {}),
  }));
}

function serializeAgentRules(rules: AgentRule[]): SerializedAgentRule[] {
  return rules.map((rule) => ({
    path: rule.path,
    filename: rule.filename,
    scope: rule.scope,
    content: rule.content,
  }));
}

function formatRuleDisplayName(rule: AgentRule): string {
  return rule.scope === "workspace"
    ? rule.filename
    : `${rule.filename} (${rule.scope})`;
}

interface DelegateToolOutput {
  summary: string;
  tmpNotebookPath: string;
  subagent: string;
  reconnected: boolean;
}

const CURRENT_CHAT_SESSION_KEY = "orion:currentChatId";

/** Reads the last selected chat for the current browser tab. */
function loadCurrentChatIdFromSession(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(CURRENT_CHAT_SESSION_KEY);
  } catch {
    return null;
  }
}

/** Stores the selected chat for this browser tab, or clears it when unavailable. */
function saveCurrentChatIdToSession(chatId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (chatId) {
      window.sessionStorage.setItem(CURRENT_CHAT_SESSION_KEY, chatId);
    } else {
      window.sessionStorage.removeItem(CURRENT_CHAT_SESSION_KEY);
    }
  } catch {
    // Losing the selected chat is harmless; the chat list falls back to newest.
  }
}

/** Returns true when a document keydown event belongs to the right sidebar panel. */
function isRightSidebarKeyboardScope(
  event: KeyboardEvent,
  sidebarRoot: HTMLElement | null,
): boolean {
  if (!sidebarRoot) return false;

  const target = event.target;
  const activeElement = document.activeElement;

  return (
    (target instanceof Node && sidebarRoot.contains(target)) ||
    (activeElement instanceof Node && sidebarRoot.contains(activeElement))
  );
}

/** Returns true when chat shortcuts should run for the current keydown event. */
function shouldHandleChatShortcut(
  event: KeyboardEvent,
  sidebarRoot: HTMLElement | null,
  isDesktopApp: boolean,
): boolean {
  if (isDesktopApp) return true;
  return isRightSidebarKeyboardScope(event, sidebarRoot);
}

// ============================================================================
// RightSidebar
// ============================================================================

export function RightSidebar({
  className,
  activeNotebookPath,
  activeNotebook,
  kernelService,
  kernelStatus = "disconnected",
  onOpenKernelDropdown,
  workspaceDirectory,
  recentFiles = [],
  onOpenFile,
  ...props
}: {
  className?: string;
  activeNotebookPath?: string;
  activeNotebook?: NotebookType | null;
  kernelService?: KernelService | null;
  kernelStatus?: KernelStatus;
  onOpenKernelDropdown?: () => void;
  workspaceDirectory?: string | null;
  recentFiles?: Array<{ name: string; path: string; openAsText?: boolean }>;
  onOpenFile?: (file: { name: string; path: string }) => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const {
    effectiveSettings,
    isHydrated: settingsHydrated,
    userSettingsLoadStatus,
    setUserSettings,
  } = useOrionSettings();
  const { openWithTab } = useOpenSettings();
  const notifyAgentTurnComplete = useAgentRunCompleteAlerts();
  const { serverAvailable } = useJupyterShellReady(kernelService ?? null);

  // State management
  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;
  const [isChatsLoaded, setIsChatsLoaded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const editedTitleRef = useRef(editedTitle);
  editedTitleRef.current = editedTitle;
  const titleGenerationRequestIdRef = useRef(0);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isHistoryPopoverOpen, setIsHistoryPopoverOpen] = useState(false);
  const SESSION_MODE_KEY = "orion:interactionMode";
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(
    () => {
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem(SESSION_MODE_KEY);
        if (stored && stored.trim().length > 0) return stored;
      }
      return "Agent";
    },
  );
  const [selectedModel, setSelectedModel] = useState(
    loadSelectedModelFromSession,
  );
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRootRef = useRef<HTMLDivElement>(null);
  const createNewChatRef = useRef<() => void>(() => {});
  const [models, setModels] = useState<LLM[]>([]);
  const [modelRows, setModelRows] = useState<ModelCatalogEntry[]>([]);
  const [modelsCatalogLoaded, setModelsCatalogLoaded] = useState(false);
  const settingsUrlHandledRef = useRef(false);
  const [autoRunConfirmOpen, setAutoRunConfirmOpen] = useState(false);
  const [showKernelPrompt, setShowKernelPrompt] = useState(false);
  const [activeSubagentToolCallId, setActiveSubagentToolCallId] = useState<
    string | null
  >(null);
  const isBusinessExperience =
    effectiveSettings.appearance.experienceMode === "business";
  const isDesktopApp = useIsDesktopApp();
  const toolApprovalMode = isBusinessExperience
    ? "auto_run"
    : effectiveSettings.chat.toolApprovalMode;
  const [modelSettingsMap, setModelSettingsMap] = useState<ModelSettingsMap>(
    loadModelSettingsMapFromSession,
  );
  const [isCompacting, setIsCompacting] = useState(false);
  const [checkpointStatuses, setCheckpointStatuses] = useState<
    Map<string, EditCheckpointStatus>
  >(new Map());
  const [checkpointRequestByMessageId, setCheckpointRequestByMessageId] =
    useState<Map<string, string>>(new Map());
  const [ephemeralCostMessage, setEphemeralCostMessage] = useState<{
    chatId: string;
    message: UIMessage;
    summary: ChatCostSummary;
    modelLabels: Record<string, string>;
  } | null>(null);
  const [isRefreshingCostSummary, setIsRefreshingCostSummary] = useState(false);
  const [emptyPromptLibraryResetCount, setEmptyPromptLibraryResetCount] =
    useState(0);
  const [goalSession, setGoalSession] = useState<GoalSession | null>(null);
  const goalSessionRef = useRef<GoalSession | null>(null);
  goalSessionRef.current = goalSession;
  const [goalSupervisorOpen, setGoalSupervisorOpen] = useState(false);
  // Reviewer model, chosen per goal but remembered across them. Null until the
  // user picks one, so the composer's model stays the default.
  const [goalEvaluatorModelChoice, setGoalEvaluatorModelChoice] = useState<
    string | null
  >(loadGoalEvaluatorModelFromSession);
  const [isGoalStarting, setIsGoalStarting] = useState(false);
  const [isGoalContractDraftActive, setIsGoalContractDraftActive] =
    useState(false);
  const goalContractDraftActiveRef = useRef(false);
  goalContractDraftActiveRef.current = isGoalContractDraftActive;
  const [goalContractActionIds, setGoalContractActionIds] = useState<
    Set<string>
  >(new Set());
  const [goalContractErrors, setGoalContractErrors] = useState<
    Map<string, string>
  >(new Map());
  const goalContractFailureToastIdsRef = useRef<Set<string>>(new Set());
  const goalStartAbortRef = useRef<AbortController | null>(null);
  const goalEvaluationAbortRef = useRef<AbortController | null>(null);
  const goalEvaluationRunningRef = useRef(false);
  const goalWorkerStartProgressRef = useRef<number | null>(null);
  // Live reviewer transcript, so the supervisor panel shows the evaluator
  // working instead of staying blank until its verdict lands.
  const [liveEvaluatorTranscript, setLiveEvaluatorTranscript] = useState<
    UIMessage[] | null
  >(null);
  const liveEvaluatorTranscriptRef = useRef<UIMessage[] | null>(null);
  const goalContinuationRef = useRef<GoalContinuation | undefined>(undefined);
  /** Shared request id for model calls triggered by the current user turn. */
  const modelRequestIdRef = useRef<string | undefined>(undefined);
  /** Ref holding the latest compaction summary for the transport interceptor. */
  const compactionSummaryRef = useRef<CompactionSummary | undefined>(undefined);
  /** Prevents concurrent compaction runs. */
  const compactionInFlightRef = useRef(false);
  /** Allows only one reactive context recovery attempt for the active user turn. */
  const reactiveContextRetryRef = useRef(false);
  /** Exact UI message state submitted before wire optimization for safe recovery. */
  const lastOutboundMessagesRef = useRef<UIMessage[] | null>(null);
  /** Latest effective context settings for stable transport callbacks. */
  const contextSettingsRef = useRef(effectiveSettings.agent.context);
  contextSettingsRef.current = effectiveSettings.agent.context;

  /** Map provider ID to the models.dev provider logo component. */
  const getProviderIcon = (provider: ProviderId) =>
    function Icon(props: { className?: string }) {
      return <ProviderLogo providerId={provider} className={props.className} />;
    };

  // Fetch available models from the static OSS catalog.
  useEffect(() => {
    goalStartAbortRef.current?.abort();
    goalStartAbortRef.current = null;
    setModelsCatalogLoaded(false);

    const fetchModels = async () => {
      try {
        const response = await fetch("/api/models");

        if (!response.ok) {
          throw new Error("Failed to fetch models");
        }

        const json = (await response.json()) as { models: ModelCatalogEntry[] };
        const data = json.models;

        setModelRows(data);

        const mappedModels: LLM[] = data.map((m) => {
          const provider = m.provider_id;
          return {
            value: m.model_id,
            label: m.label,
            provider,
            inputPrice: m.input_price_per_1m ?? undefined,
            outputPrice: m.output_price_per_1m ?? undefined,
            cachedPrice: m.cached_price_per_1m ?? undefined,
            cacheWritePrice: m.cache_write_price_per_1m ?? undefined,
            icon: getProviderIcon(provider),
            apiModelId: m.api_model_id,
            contextWindow: m.context_window ?? undefined,
            contextWindowSource: m.context_window_source,
            contextWindowFetchedAt: m.context_window_fetched_at,
            contextWindowIsFallback: m.context_window_is_fallback,
            maxOutputTokens: m.max_output_tokens ?? undefined,
            supportsImageInput: m.supports_image_input === true,
            supportsToolCalling: m.supports_tool_calling,
            supportsForcedToolChoice: m.supports_forced_tool_choice === true,
            supportsReasoning: m.supports_reasoning,
            reasoningOptions: m.reasoning_options,
            longContextThreshold: m.long_context_threshold ?? undefined,
            longContextInputPrice:
              m.long_context_input_price_per_1m ?? undefined,
            longContextOutputPrice:
              m.long_context_output_price_per_1m ?? undefined,
            catalogSource: m.source,
            pinnedByDefault: m.pinned_by_default,
            catalogCreatedAt: m.created_at,
            clientAvailable: m.client_avail,
          };
        });
        setModels(mappedModels);
      } catch (error) {
        console.error("Failed to fetch models:", error);
        toast.error("Failed to fetch models");
      } finally {
        setModelsCatalogLoaded(true);
      }
    };

    void fetchModels();
  }, []);

  // Auto-open settings when the URL contains ?settings=<tab> (e.g. OAuth return).
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !modelsCatalogLoaded ||
      settingsUrlHandledRef.current
    ) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("settings");
    const validTabs: SettingsTab[] = [
      "appearance",
      "notebook",
      "agent",
      "models",
      "providers",
      "settings-file",
    ];
    if (tab && validTabs.includes(tab as SettingsTab)) {
      settingsUrlHandledRef.current = true;
      openWithTab(tab as SettingsTab);
    }
  }, [modelsCatalogLoaded, openWithTab]);

  /** When user has no pinned models, use models with pinned_by_default from DB. */
  const pinnedModelIds = React.useMemo(() => {
    const userPinned = effectiveSettings.chat.pinnedModelIds ?? [];
    const base =
      userPinned.length > 0
        ? userPinned
        : modelRows
            .filter((m) => m.pinned_by_default)
            .map((m) => formatModelSelectionKey(m.provider_id, m.model_id));
    return normalizePinnedModelKeys(base, modelRows);
  }, [effectiveSettings.chat.pinnedModelIds, modelRows]);

  const configuredLocalProviderModels = React.useMemo<LLM[]>(() => {
    const credentials = effectiveSettings.providers?.credentials ?? {};
    const rows: LLM[] = [];

    for (const [providerId, credential] of Object.entries(credentials)) {
      if (credential?.type !== "local_endpoint") continue;

      const endpointModels = isLocalProvider(providerId)
        ? normalizeLocalEndpointModels(providerId, credential)
        : [
            {
              modelId: credential.modelId,
              label: credential.label ?? credential.modelId,
              enabled: true,
            },
            ...(credential.models ?? []),
          ];

      for (const model of endpointModels) {
        if (model.enabled === false) continue;
        const value = isLocalProvider(providerId)
          ? encodeLocalModelCatalogId(providerId, model.modelId)
          : model.modelId;
        rows.push({
          value,
          label:
            model.label ??
            getLocalModelLabel(providerId, model.modelId) ??
            model.modelId,
          provider: providerId,
          inputPrice: 0,
          outputPrice: 0,
          cachedPrice: 0,
          icon: getProviderIcon(providerId),
          // Locally served models have no catalog entry, so their real window is
          // unknown. The server resolves the same models to
          // UNKNOWN_CONTEXT_FALLBACK_TOKENS; matching it keeps the model tooltip
          // from contradicting the budget every measurement is taken against.
          contextWindow: UNKNOWN_CONTEXT_FALLBACK_TOKENS,
          supportsImageInput: false,
          supportsForcedToolChoice: false,
          supportsToolCalling: false,
          supportsReasoning: false,
          catalogSource: "local",
          pinnedByDefault: false,
          clientAvailable: true,
        });
      }
    }

    return rows;
  }, [effectiveSettings.providers?.credentials]);

  const allModels = React.useMemo<LLM[]>(() => {
    const configuredLocalProviders = new Set(
      configuredLocalProviderModels.map((model) => model.provider),
    );
    const staticModels = models.filter(
      (model) =>
        !(
          isLocalProvider(model.provider) &&
          configuredLocalProviders.has(model.provider)
        ),
    );

    return [...staticModels, ...configuredLocalProviderModels];
  }, [configuredLocalProviderModels, models]);

  const getModel = useCallback(
    (modelKey: string) => findModelBySelectionKey(allModels, modelKey),
    [allModels],
  );

  /**
   * Models enriched with reactive `isAccessible` based on local credentials.
   * Recomputes whenever credentials change (e.g. user adds/removes a provider key).
   */
  const modelsWithAccess = React.useMemo<LLM[]>(() => {
    const credentials = effectiveSettings.providers?.credentials ?? {};
    const modelLabels = effectiveSettings.chat.modelLabels ?? {};
    const hasByokForProvider = (providerId: string) =>
      !!credentials[providerId];

    return allModels.map((m) => {
      const credential = credentials[m.provider];
      const localLabel =
        credential?.type === "local_endpoint" && isLocalProvider(m.provider)
          ? (credential.label ??
            getLocalModelLabel(m.provider, credential.modelId) ??
            credential.modelId)
          : undefined;
      const baseLabel =
        localLabel && isStaticLocalModelValue(m.value) ? localLabel : m.label;

      return {
        ...m,
        label: resolveModelDisplayLabel(
          m.provider,
          m.value,
          baseLabel,
          modelLabels,
        ),
        isAccessible: hasByokForProvider(m.provider),
      };
    });
  }, [
    allModels,
    effectiveSettings.chat.modelLabels,
    effectiveSettings.providers?.credentials,
  ]);

  useEffect(() => {
    const pinnedSelectionForStoredModel =
      parseModelSelectionKey(selectedModel) === null
        ? pinnedModelIds.find(
            (pinKey) =>
              parseModelSelectionKey(pinKey)?.modelId === selectedModel,
          )
        : undefined;
    if (pinnedSelectionForStoredModel) {
      setSelectedModel(pinnedSelectionForStoredModel);
      saveSelectedModelToSession(pinnedSelectionForStoredModel);
      return;
    }

    const fallbackModel = resolveSelectedModelFallback({
      selectedModel,
      models: modelsWithAccess,
      modelsCatalogLoaded,
      settingsReady: settingsHydrated && userSettingsLoadStatus !== "failed",
    });
    if (!fallbackModel) return;

    setSelectedModel(fallbackModel);
    saveSelectedModelToSession(fallbackModel);
  }, [
    modelsCatalogLoaded,
    modelsWithAccess,
    pinnedModelIds,
    selectedModel,
    settingsHydrated,
    userSettingsLoadStatus,
  ]);

  const handleInteractionModeChange = useCallback(
    (nextMode: InteractionMode) => {
      setInteractionMode(nextMode);
      sessionStorage.setItem(SESSION_MODE_KEY, nextMode);
    },
    [],
  );

  /**
   * Model that will review the goal. Falls back to the composer's model until the
   * user picks a reviewer, and degrades the same way when a remembered choice
   * loses its credential.
   */
  const goalEvaluatorModel = React.useMemo(() => {
    const preferred = goalEvaluatorModelChoice ?? selectedModel;
    const resolved = findModelBySelectionKey(modelsWithAccess, preferred);
    return resolved && resolved.isAccessible !== false ? preferred : selectedModel;
  }, [goalEvaluatorModelChoice, modelsWithAccess, selectedModel]);

  const handleReorderPinned = useCallback(
    (newOrder: string[]) => {
      void setUserSettings((current) => ({
        ...current,
        chat: {
          ...current.chat,
          pinnedModelIds: newOrder,
        },
      }));
    },
    [setUserSettings],
  );

  const handleModelChange = useCallback((nextModel: string) => {
    setSelectedModel(nextModel);
    saveSelectedModelToSession(nextModel);
  }, []);

  const handleGoalEvaluatorModelChange = useCallback((nextModel: string) => {
    setGoalEvaluatorModelChoice(nextModel);
    saveGoalEvaluatorModelToSession(nextModel);
  }, []);

  /** Opens settings directly on Providers for BYOK setup. */
  const handleOpenProvidersSettings = useCallback(() => {
    openWithTab("providers");
  }, [openWithTab]);

  const goalEvaluatorPicker = React.useMemo(
    () => ({
      models: modelsWithAccess,
      pinnedModelIds,
      selectedModel: goalEvaluatorModel,
      onSelectedModelChange: handleGoalEvaluatorModelChange,
      onOpenModelsSettings: () => openWithTab("models"),
      onOpenProvidersSettings: handleOpenProvidersSettings,
    }),
    [
      goalEvaluatorModel,
      handleGoalEvaluatorModelChange,
      handleOpenProvidersSettings,
      modelsWithAccess,
      openWithTab,
      pinnedModelIds,
    ],
  );

  /** Opens Settings on Providers so the user can add local credentials. */
  const handleConfigureProvider = useCallback(() => {
    openWithTab("providers");
  }, [openWithTab]);

  /** Update settings for a specific model */
  const handleModelSettingsChange = useCallback(
    (modelId: string, settings: ModelSettings) => {
      setModelSettingsMap((prev) => {
        const next = { ...prev, [modelId]: settings };
        saveModelSettingsMapToSession(next);
        return next;
      });
    },
    [],
  );

  /** Approve a pending tool call */
  const handleApprove = useCallback((toolCallId: string) => {
    const pending = pendingApprovalToolCallsRef.current.get(toolCallId);
    if (!pending) return;
    pending.resolve("approve");
    pendingApprovalToolCallsRef.current.delete(toolCallId);
    setPendingApprovalIds((prev) => {
      const next = new Set(prev);
      next.delete(toolCallId);
      return next;
    });
  }, []);

  /** Reject a pending tool call */
  const handleReject = useCallback((toolCallId: string) => {
    const pending = pendingApprovalToolCallsRef.current.get(toolCallId);
    if (!pending) return;
    pending.resolve("reject");
    pendingApprovalToolCallsRef.current.delete(toolCallId);
    setPendingApprovalIds((prev) => {
      const next = new Set(prev);
      next.delete(toolCallId);
      return next;
    });
  }, []);

  /**
   * Resolves one parked `ask_question` call and reports whether it existed.
   *
   * Every teardown path (stop, chat switch, regenerate) has to release these
   * promises too, or the scheduler keeps the turn's tool slot forever.
   */
  const resolveAskQuestion = useCallback(
    (toolCallId: string, result: AskQuestionResult): boolean => {
      const pending = pendingAskQuestionsRef.current.get(toolCallId);
      if (!pending) return false;
      pendingAskQuestionsRef.current.delete(toolCallId);
      pending.resolve(result);
      return true;
    },
    [],
  );

  /** Submit the user's questionnaire answers as the tool result. */
  const handleAnswerQuestions = useCallback(
    (toolCallId: string, result: AskQuestionResult) => {
      if (!resolveAskQuestion(toolCallId, result)) return;
      setAnsweredAskQuestionIds((prev) => new Set(prev).add(toolCallId));
    },
    [resolveAskQuestion],
  );

  /** Dismiss the questionnaire and let the agent continue on its own judgement. */
  const handleDismissQuestions = useCallback(
    (toolCallId: string) => {
      if (!resolveAskQuestion(toolCallId, { answers: [], cancelled: true })) {
        return;
      }
      setAnsweredAskQuestionIds((prev) => new Set(prev).add(toolCallId));
    },
    [resolveAskQuestion],
  );

  /** Releases every parked questionnaire when the turn or chat goes away. */
  const cancelPendingAskQuestions = useCallback(() => {
    if (pendingAskQuestionsRef.current.size === 0) return;
    for (const [, pending] of pendingAskQuestionsRef.current) {
      pending.resolve({ answers: [], cancelled: true });
    }
    pendingAskQuestionsRef.current.clear();
    setAnsweredAskQuestionIds(new Set());
  }, []);

  /** Change tool approval mode and persist to settings */
  const handleToolApprovalModeChange = useCallback(
    (mode: ToolApprovalMode) => {
      if (mode === toolApprovalMode) return;
      if (mode === "auto_run") {
        setAutoRunConfirmOpen(true);
        return;
      }
      void setUserSettings((current) => ({
        ...current,
        chat: {
          ...current.chat,
          toolApprovalMode: mode,
        },
      }));
    },
    [setUserSettings, toolApprovalMode],
  );

  /** Apply auto_run mode after user confirms the warning dialog */
  const handleAutoRunConfirm = useCallback(() => {
    if (toolApprovalMode === "auto_run") {
      setAutoRunConfirmOpen(false);
      return;
    }
    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        toolApprovalMode: "auto_run",
      },
    }));
    setAutoRunConfirmOpen(false);
  }, [setUserSettings, toolApprovalMode]);

  // Auto-approve all pending tool calls when mode changes to "auto_run"
  useEffect(() => {
    if (toolApprovalMode !== "auto_run") return;
    if (pendingApprovalToolCallsRef.current.size === 0) return;

    for (const [, pending] of pendingApprovalToolCallsRef.current) {
      pending.resolve("approve");
    }
    pendingApprovalToolCallsRef.current.clear();
    setPendingApprovalIds(new Set());
  }, [toolApprovalMode]);

  /** Generate a short title from the first user and assistant messages in a chat. */
  const generateChatTitle = async (
    chatMessages: ChatMessage[],
    chatId: string,
  ): Promise<string | null> => {
    const userMessage = chatMessages.find((m) => m.role === "user");
    const assistantMessage = chatMessages.find((m) => m.role === "assistant");

    if (!userMessage || !assistantMessage) return null;

    const userText = getTextContent(userMessage);
    const assistantText = getTextContent(assistantMessage);

    const titleMaxLength =
      effectiveSettings.chat.titleGenerationMaxLength ??
      DEFAULT_TITLE_GENERATION_MAX_LENGTH;
    const fallbackTitle =
      userText.length > titleMaxLength
        ? `${userText.slice(0, titleMaxLength - 3)}...`
        : userText.slice(0, titleMaxLength) || "New Chat";

    const titlePrompt = `Based on the following conversation, create a short, descriptive title for the chat session. The title must always be written in the same language as the user's first message. Do not translate the title or infer its language from the people, places, or subject matter discussed. Return only the title, no other text. The title must be ${titleMaxLength} characters or less.\n\nUser's first message: ${userText}\nAssistant's first response: ${assistantText}\n\nTitle:`;

    const titleGenerationModel = resolveTitleGenerationModel({
      configuredModelId: effectiveSettings.chat.titleGenerationModelId,
      defaultModelId: DEFAULT_TITLE_GENERATION_MODEL_ID,
      models: allModels,
      credentials: effectiveSettings.providers?.credentials ?? {},
    });
    if (!titleGenerationModel) {
      console.error("Title generation model not found");
      return null;
    }

    const bodyPayload = {
      messages: [{ role: "user", content: titlePrompt }],
      provider: titleGenerationModel.provider,
      model: titleGenerationModel.value,
      chatId,
      origin: "title_generation",
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate title: ${response.statusText}`);
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      let newTitle = "";

      if (contentType.includes("application/json")) {
        const json = (await response.json()) as { title?: unknown };
        newTitle = typeof json.title === "string" ? json.title : "";
      } else {
        const rawResponse = await response.text();
        newTitle = parseTitleFromChatStreamResponse(rawResponse);
      }

      newTitle = newTitle.replace(/^"|"$/g, "").trim();

      if (newTitle) {
        return newTitle.slice(0, titleMaxLength);
      } else {
        throw new Error("Parsed title is empty");
      }
    } catch (error) {
      console.error("Error generating chat title:", error);
      return fallbackTitle;
    }
  };

  /** Generate and persist a short title for a newly created chat. */
  const generateAndSetTitle = async (
    chatMessages: ChatMessage[],
    chatId: string,
  ) => {
    const newTitle = await generateChatTitle(chatMessages, chatId);
    if (!newTitle) return;

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, title: newTitle } : chat,
      ),
    );
  };

  // Derived values — when `currentChatId` is briefly null after load, fall back to
  // the first chat so `/api/chat` always receives a chatId and persistence matches.
  const effectiveChatId = currentChatId ?? chats[0]?.id ?? null;
  const currentChat = effectiveChatId
    ? chats.find((chat) => chat.id === effectiveChatId)
    : undefined;
  const activeSubagentSession = activeSubagentToolCallId
    ? currentChat?.subagentSessions?.[activeSubagentToolCallId]
    : undefined;
  const isSubagentChatView =
    !!activeSubagentToolCallId && !!activeSubagentSession;
  const isGoalSupervisorView = goalSupervisorOpen && goalSession !== null;
  const goalSupervisorMessages = React.useMemo(
    () =>
      goalSession
        ? buildGoalSupervisorMessages(goalSession, liveEvaluatorTranscript)
        : [],
    [goalSession, liveEvaluatorTranscript],
  );
  const subagentReportPaths = React.useMemo(() => {
    const sessions = currentChat?.subagentSessions;
    if (!sessions) return undefined;
    const paths = new Map<string, string>();
    for (const [toolCallId, session] of Object.entries(sessions)) {
      if (session.tmpNotebookPath) {
        paths.set(toolCallId, session.tmpNotebookPath);
      }
    }
    return paths;
  }, [currentChat?.subagentSessions]);
  const modelInfo = getModel(selectedModel);
  const apiModelId = resolveCatalogModelIdForApi(selectedModel, modelInfo);

  /** Refresh persisted, non-empty edit checkpoints and their current undo/redo state. */
  const refreshCheckpointStatuses = useCallback(async (): Promise<void> => {
    if (!effectiveChatId) {
      setCheckpointStatuses(new Map());
      return;
    }

    try {
      const response = await fetch(
        `/api/chats/${encodeURIComponent(effectiveChatId)}/checkpoints`,
      );
      if (!response.ok) {
        throw new Error(`Checkpoint list failed with ${response.status}`);
      }
      const data = (await response.json()) as {
        checkpoints?: Array<{
          requestId?: unknown;
          status?: unknown;
          targets?: unknown[];
        }>;
      };
      const nextStatuses = new Map<string, EditCheckpointStatus>();
      for (const checkpoint of data.checkpoints ?? []) {
        if (
          typeof checkpoint.requestId === "string" &&
          (checkpoint.status === "open" ||
            checkpoint.status === "completed" ||
            checkpoint.status === "interrupted" ||
            checkpoint.status === "reverted") &&
          Array.isArray(checkpoint.targets) &&
          checkpoint.targets.length > 0
        ) {
          nextStatuses.set(checkpoint.requestId, checkpoint.status);
        }
      }
      setCheckpointStatuses(nextStatuses);
    } catch (error) {
      console.warn("Failed to refresh edit checkpoints:", error);
      setCheckpointStatuses(new Map());
    }
  }, [effectiveChatId]);

  useEffect(() => {
    void refreshCheckpointStatuses();
  }, [refreshCheckpointStatuses]);

  const handleOpenSubagentReport = useCallback(
    (path: string) => {
      if (!path) return;
      onOpenFile?.({ name: fileNameFromPath(path), path });
    },
    [onOpenFile],
  );

  /** Opens a skill/subagent Jupyter definition path selected from the slash command palette. */
  const handleOpenSlashDefinition = useCallback(
    (path: string) => {
      if (!path) return;
      onOpenFile?.({ name: fileNameFromPath(path), path });
    },
    [onOpenFile],
  );

  /** Latest id for persisting chat in `useChat` `onFinish` (avoids stale/null `currentChatId`). */
  const effectiveChatIdRef = useRef<string | null>(null);
  effectiveChatIdRef.current = effectiveChatId;

  // AI Assistant context (optional — may not be in provider)
  const assistant = useAssistantChatOptional();
  useEffect(() => {
    goalEvaluationAbortRef.current?.abort();
    goalEvaluationAbortRef.current = null;
    goalEvaluationRunningRef.current = false;
    goalWorkerStartProgressRef.current = null;
    goalContinuationRef.current = undefined;
    liveEvaluatorTranscriptRef.current = null;
    setLiveEvaluatorTranscript(null);
    setGoalSupervisorOpen(false);
    setIsGoalStarting(false);
    goalContractDraftActiveRef.current = false;
    setIsGoalContractDraftActive(false);
    setGoalContractActionIds(new Set());
    setGoalContractErrors(new Map());
    goalContractFailureToastIdsRef.current.clear();
    goalSessionRef.current = null;
    setGoalSession(null);
    if (!effectiveChatId) {
      return;
    }
    let cancelled = false;
    void loadGoalSession(effectiveChatId)
      .then(async (stored) => {
        if (cancelled) return;
        if (stored?.status === "active") {
          const paused: GoalSession = {
            ...stored,
            status: "paused",
            phase: "paused",
            updatedAt: new Date().toISOString(),
          };
          setGoalSession(paused);
          await persistGoalSession(paused).catch((error) => {
            console.warn("Failed to pause restored goal session:", error);
          });
          return;
        }
        setGoalSession(stored);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Failed to load goal session:", error);
          setGoalSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveChatId]);

  /** Re-scan skills and subagents so the slash palette reflects workspace changes immediately. */
  const handleRefreshSlashCommands = useCallback(async (): Promise<void> => {
    if (!assistant) return;

    try {
      await Promise.all([
        assistant.refreshSkills(),
        assistant.refreshSubagents(),
      ]);
      toast.success("Skills and subagents refreshed.");
    } catch (error) {
      console.error("Failed to refresh slash commands:", error);
      toast.error("Failed to refresh skills and subagents.");
    }
  }, [assistant]);
  const agentPromptPath = useCallback(
    (path: string): string =>
      isAbsoluteAgentPath(path)
        ? path
        : (toAgentAbsolutePath(path, {
            rootDirectory: assistant?.rootDirectory,
          }) ?? path),
    [assistant?.rootDirectory],
  );
  const clientPlatformOs = usePlatformOs();
  const { variables: kernelVariables, refresh: refreshKernelVariables } =
    useKernelVariables(kernelService ?? null);
  const [selectedNotebookCellIndex, setSelectedNotebookCellIndex] = useState<
    number | null
  >(null);
  const [workspaceReferenceEntries, setWorkspaceReferenceEntries] = useState<
    ReferenceWorkspaceEntry[]
  >([]);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState("");
  const [referenceSearchTab, setReferenceSearchTab] =
    useState<ReferenceTab>("all");
  const referenceSearchSeqRef = useRef(0);

  useEffect(() => {
    const handleNotebookSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ selectedCellIndex?: unknown }>)
        .detail;
      const nextIndex = detail?.selectedCellIndex;
      setSelectedNotebookCellIndex(
        typeof nextIndex === "number" && Number.isInteger(nextIndex)
          ? nextIndex
          : null,
      );
    };

    window.addEventListener(
      "notebookMinimapSelectionUpdate",
      handleNotebookSelection,
    );
    return () => {
      window.removeEventListener(
        "notebookMinimapSelectionUpdate",
        handleNotebookSelection,
      );
    };
  }, []);

  /** Refreshes dynamic @-reference candidates for the active query and picker tab. */
  const refreshReferenceSearch = useCallback(
    (query: string, tab: ReferenceTab) => {
      const searchSeq = ++referenceSearchSeqRef.current;
      const normalizedQuery = query.trim().toLowerCase();
      setReferenceSearchQuery(normalizedQuery);
      setReferenceSearchTab(tab);
      const shouldSearchWorkspace = tab === "all" || tab === "files";
      const shouldSearchVariables = tab === "all" || tab === "variables";

      if (shouldSearchWorkspace && assistant) {
        void (async () => {
          try {
            const queuedFolders = [workspaceDirectory ?? ""];
            const visitedFolders = new Set<string>();
            const matches: ReferenceWorkspaceEntry[] = [];

            while (
              queuedFolders.length > 0 &&
              visitedFolders.size < 20 &&
              matches.length < 80
            ) {
              const folderPath = queuedFolders.shift() ?? "";
              if (visitedFolders.has(folderPath)) continue;
              visitedFolders.add(folderPath);

              const entries = await assistant.listDirectoryEntries(folderPath);
              for (const entry of entries) {
                const haystack =
                  `${entry.name} ${entry.path} ${entry.type}`.toLowerCase();
                if (!normalizedQuery || haystack.includes(normalizedQuery)) {
                  matches.push(entry);
                }

                if (
                  normalizedQuery &&
                  entry.type === "folder" &&
                  queuedFolders.length < 40
                ) {
                  queuedFolders.push(entry.path);
                }

                if (matches.length >= 80) break;
              }

              if (!normalizedQuery) break;
            }

            if (referenceSearchSeqRef.current === searchSeq) {
              setWorkspaceReferenceEntries(matches);
            }
          } catch (error) {
            console.warn("Failed to refresh workspace @ references", error);
            if (referenceSearchSeqRef.current === searchSeq) {
              setWorkspaceReferenceEntries([]);
            }
          }
        })();
      }

      if (shouldSearchVariables) {
        void refreshKernelVariables();
      }
    },
    [assistant, refreshKernelVariables, workspaceDirectory],
  );

  const referenceOptions = React.useMemo<ChatReferenceOption[]>(() => {
    const options: ChatReferenceOption[] = [];
    const addOption = (
      reference: ResolvedChatReference,
      description: string,
    ) => {
      if (options.some((option) => option.id === reference.id)) return;
      options.push({
        id: reference.id,
        type: reference.type,
        label: reference.label,
        description,
        reference,
      });
    };

    const { notebookPath } = agentEditorContext(activeNotebookPath);
    if (activeNotebookPath) {
      const isNotebook = activeNotebookPath.endsWith(".ipynb");
      const promptPath = agentPromptPath(activeNotebookPath);
      addOption(
        makeReference(
          "file",
          fileNameFromPath(activeNotebookPath),
          { type: "file", path: activeNotebookPath },
          `Active file: ${activeNotebookPath}`,
          isNotebook
            ? `Use use_notebook with notebookPath="${promptPath}", then read_notebook or read_cell for exact cells.`
            : `Use read_file with path="${promptPath}" for exact contents.`,
        ),
        "Active file",
      );
    }

    if (notebookPath && selectedNotebookCellIndex !== null) {
      const promptPath = agentPromptPath(notebookPath);
      addOption(
        makeReference(
          "cell",
          formatCellReferenceLabel([selectedNotebookCellIndex]),
          {
            type: "cell",
            notebookPath,
            cellIndices: [selectedNotebookCellIndex],
          },
          `Selected notebook cell ${selectedNotebookCellIndex} in ${notebookPath}.`,
          `Use use_notebook with notebookPath="${promptPath}", then read_cell for cell index ${selectedNotebookCellIndex}.`,
        ),
        "Selected cell",
      );
    }

    const shouldIncludeNotebookCells =
      notebookPath !== undefined &&
      activeNotebook !== null &&
      activeNotebook !== undefined &&
      (referenceSearchTab === "cells" || referenceSearchQuery.length > 0);
    if (shouldIncludeNotebookCells) {
      const promptPath = agentPromptPath(notebookPath);
      activeNotebook.cells.forEach((cell, index) => {
        addOption(
          makeReference(
            "cell",
            formatCellReferenceLabel([index]),
            { type: "cell", notebookPath, cellIndices: [index] },
            notebookCellSourcePreview(cell),
            `Use use_notebook with notebookPath="${promptPath}", then read_cell for cell index ${index}.`,
          ),
          notebookCellDescription(cell, index),
        );
      });
    }

    const recentFileOptions = recentFiles
      .filter((file) => file.path && file.path !== activeNotebookPath)
      .slice(0, 2);
    for (const file of recentFileOptions) {
      const promptPath = agentPromptPath(file.path);
      addOption(
        makeReference(
          "file",
          file.name || fileNameFromPath(file.path),
          { type: "file", path: file.path },
          `Recent file: ${file.path}`,
          file.path.endsWith(".ipynb")
            ? `Use use_notebook with notebookPath="${promptPath}", then read_notebook or read_cell for exact cells.`
            : `Use read_file with path="${promptPath}" for exact contents.`,
        ),
        "Recent file",
      );
    }

    if (workspaceDirectory !== null && workspaceDirectory !== undefined) {
      const label = workspaceDirectory || "/";
      const promptPath = agentPromptPath(workspaceDirectory);
      addOption(
        makeReference(
          "folder",
          label,
          { type: "folder", path: workspaceDirectory },
          `Current workspace folder: ${label}`,
          `Use file and shell tools with absolute paths under "${promptPath}" when exact contents are needed.`,
        ),
        "Current workspace",
      );
    }

    for (const entry of workspaceReferenceEntries) {
      const promptPath = agentPromptPath(entry.path);
      addOption(
        makeReference(
          entry.type,
          entry.name,
          { type: entry.type, path: entry.path },
          `${entry.type === "folder" ? "Folder" : "File"}: ${entry.path}`,
          entry.type === "folder"
            ? `Use bash with safe read-only commands scoped to "${promptPath}" when exact folder contents are needed.`
            : `Use read_file with path="${promptPath}" for exact contents.`,
        ),
        entry.path,
      );
    }

    const matchingVariables = kernelVariables
      .filter((variable) => {
        if (!referenceSearchQuery) return true;
        return `${variable.name} ${variable.type} ${variable.repr ?? ""}`
          .toLowerCase()
          .includes(referenceSearchQuery);
      })
      .slice(0, 80);
    for (const variable of matchingVariables) {
      const shape = variable.shape?.length
        ? `shape=${variable.shape.join("x")}`
        : null;
      const length =
        typeof variable.length === "number"
          ? `length=${variable.length}`
          : null;
      const previewLines = [
        `Variable ${variable.name}: ${variable.type}`,
        shape,
        length,
        variable.repr ? truncatePreview(variable.repr, 700) : null,
      ].filter(
        (line): line is string => typeof line === "string" && line.length > 0,
      );

      addOption(
        makeReference(
          "variable",
          variable.name,
          {
            type: "variable",
            name: variable.name,
            notebookPath: notebookPath ?? undefined,
          },
          previewLines.join("\n"),
          `Use notebook execution or variable inspection plumbing with name="${variable.name}" for fresh detail.`,
        ),
        [variable.type, shape, length].filter(Boolean).join(" · "),
      );
    }

    const terminals = assistant?.terminalPool?.getState().terminals ?? [];
    for (const terminal of terminals) {
      if (
        terminal.type === "agent" &&
        effectiveChatId &&
        terminal.chatId !== effectiveChatId
      )
        continue;
      addOption(
        makeReference(
          "terminal",
          terminal.name,
          {
            type: "terminal",
            terminalName: terminal.name,
            chatId: terminal.chatId ?? undefined,
          },
          terminal.pendingCommand?.buffer
            ? truncatePreview(terminal.pendingCommand.buffer, 900)
            : `Terminal ${terminal.name} (${terminal.type})`,
          `Use await_command with terminalName="${terminal.name}" if a command is still running.`,
        ),
        terminal.type === "agent" ? "Chat terminal" : "User terminal",
      );
    }

    return options;
  }, [
    activeNotebookPath,
    activeNotebook,
    agentPromptPath,
    assistant?.terminalPool,
    effectiveChatId,
    kernelVariables,
    recentFiles,
    referenceSearchQuery,
    referenceSearchTab,
    selectedNotebookCellIndex,
    workspaceDirectory,
    workspaceReferenceEntries,
  ]);

  const disabledReferenceTabs = React.useMemo<ReferenceTab[]>(() => {
    const hasOpenNotebook =
      activeNotebookPath !== undefined &&
      activeNotebookPath.endsWith(".ipynb") &&
      activeNotebook !== null &&
      activeNotebook !== undefined;
    return hasOpenNotebook ? [] : ["cells"];
  }, [activeNotebook, activeNotebookPath]);

  // Sync current chat ID to assistant for dev logging (one log file per chat session)
  useEffect(() => {
    assistant?.setChatId(effectiveChatId);
  }, [effectiveChatId, assistant]);

  // Keep compactionSummaryRef in sync with the active chat's summary.
  // The ref is read by the transport interceptor which runs outside React's render cycle.
  useEffect(() => {
    compactionSummaryRef.current = currentChat?.compactionSummary;
  }, [currentChat?.compactionSummary]);

  useEffect(() => {
    if (!activeSubagentToolCallId) return;
    if (currentChat?.subagentSessions?.[activeSubagentToolCallId]) return;
    setActiveSubagentToolCallId(null);
  }, [activeSubagentToolCallId, currentChat?.subagentSessions]);

  // Ref to latest messages for use inside useChat callbacks
  const messagesRef = useRef<UIMessage[]>([]);

  type ToolCallTracker = {
    status: "queued" | "running" | "completed";
    result?: unknown;
    lastResubmittedAt?: number;
  };

  // Track tool calls across rerenders:
  // - running: dispatched/queued, avoid duplicate execution
  // - completed: result available; can be re-submitted if provider keeps call state unresolved
  const trackedToolCallsRef = useRef<Map<string, ToolCallTracker>>(new Map());

  // Tool calls blocked because no kernel was connected at execution time.
  // Stored here so they can be retried once the kernel connects, without
  // re-running the full LLM turn. useChat will resume naturally once all
  // pending tool results are submitted.
  const pendingKernelToolCallsRef = useRef<
    Array<{
      toolCallId: string;
      toolName: OrionToolName;
      args: Record<string, unknown>;
    }>
  >([]);
  // Tool calls that only need a Jupyter server connection (no kernel required).
  // Flushed as soon as assistant.toolsReady becomes true.
  const pendingServerToolCallsRef = useRef<
    Array<{
      toolCallId: string;
      toolName: OrionToolName;
      args: Record<string, unknown>;
    }>
  >([]);
  const isToolServerReady = Boolean(
    kernelService && assistant?.toolsReady && serverAvailable,
  );
  const toolExecutionSchedulerRef =
    useRef<OrderedToolExecutionScheduler | null>(null);
  const toolExecutionAbortControllerRef = useRef<AbortController | null>(null);
  const toolExecutionHandoffRef = useRef<Promise<void>>(Promise.resolve());
  const toolExecutionTurnIdRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const [stopRequestActive, setStopRequestActive] = useState(false);
  const lastStopRequestedAtRef = useRef<number>(0);

  /** Pending confirmation action when user tries to switch/create chat while processing */
  const [stopConfirmAction, setStopConfirmAction] = useState<
    { type: "new-chat" } | { type: "switch-chat"; targetChatId: string } | null
  >(null);
  type PendingInPlaceEditAction = {
    sourceChat: Chat;
    sourceMessageIndex: number;
    messageId: string;
    editedText: string;
    references: ResolvedChatReference[];
    attachments: ChatDraftAttachment[];
  };
  const [pendingInPlaceEditAction, setPendingInPlaceEditAction] =
    useState<PendingInPlaceEditAction | null>(null);
  const [isRestoringEditWorkspace, setIsRestoringEditWorkspace] =
    useState(false);

  // Guard against calling generateAndSetTitle more than once per chat session.
  // A ref is used so the check is synchronous and not subject to stale closure
  // issues across multiple rapid onFinish calls (e.g. with maxSteps > 1).
  const titleGeneratedForChatsRef = useRef<Set<string>>(new Set());

  // Tool approval: pending tool calls awaiting user accept/reject
  type PendingApproval = {
    toolCallId: string;
    toolName: OrionToolName;
    args: Record<string, unknown>;
    resolve: (action: "approve" | "reject") => void;
  };
  const pendingApprovalToolCallsRef = useRef<Map<string, PendingApproval>>(
    new Map(),
  );
  const [pendingApprovalIds, setPendingApprovalIds] = useState<Set<string>>(
    new Set(),
  );

  // `ask_question`: tool calls parked until the user answers the embedded
  // questionnaire. The resolver is the tool's result.
  type PendingAskQuestion = {
    toolCallId: string;
    resolve: (result: AskQuestionResult) => void;
  };
  const pendingAskQuestionsRef = useRef<Map<string, PendingAskQuestion>>(
    new Map(),
  );
  const [answeredAskQuestionIds, setAnsweredAskQuestionIds] = useState<
    Set<string>
  >(new Set());

  /** Chat-scoped bundle handed to the embedded questionnaire cards. */
  const askQuestionHandlers = React.useMemo(
    () => ({
      maxQuestions: effectiveSettings.agent.execution.maxQuestionsPerAsk,
      busyToolCallIds: answeredAskQuestionIds,
      onSubmit: handleAnswerQuestions,
      onDismiss: handleDismissQuestions,
    }),
    [
      answeredAskQuestionIds,
      effectiveSettings.agent.execution.maxQuestionsPerAsk,
      handleAnswerQuestions,
      handleDismissQuestions,
    ],
  );

  /** Live progress descriptions for running sub-agent tool calls, keyed by toolCallId. */
  const [subagentProgress, setSubagentProgress] = useState<Map<string, string>>(
    new Map(),
  );
  const [toolTimings, setToolTimings] = useState<Map<string, ToolTiming>>(
    new Map(),
  );
  const toolTimingsRef = useRef<Map<string, ToolTiming>>(new Map());

  /** Record the first moment a tool call entered the client execution loop. */
  const markToolStarted = useCallback((toolCallId: string) => {
    const startedAt = Date.now();
    const current = toolTimingsRef.current.get(toolCallId);
    if (current?.startedAt) return;
    const next = new Map(toolTimingsRef.current);
    next.set(toolCallId, { startedAt });
    toolTimingsRef.current = next;
    setToolTimings(next);
  }, []);

  /** Record a terminal tool timestamp without extending completed durations on resubmits. */
  const markToolEnded = useCallback((toolCallId: string) => {
    const endedAt = Date.now();
    const current = toolTimingsRef.current.get(toolCallId);
    if (current?.endedAt) return;
    const next = new Map(toolTimingsRef.current);
    next.set(toolCallId, {
      startedAt: current?.startedAt ?? endedAt,
      endedAt,
    });
    toolTimingsRef.current = next;
    setToolTimings(next);
  }, []);

  /**
   * Per parent-chat + subagent type, how many delegate runs have started (for dev log
   * filenames: {chatId}-{agentName}#n.log).
   */
  const subagentRunIndexRef = useRef<Map<string, number>>(new Map());
  const activeSubagentRunToolCallsRef = useRef<Set<string>>(new Set());
  const researchSessionRef = useRef<ResearchSessionSnapshot>(
    createInactiveResearchSession(),
  );
  const researchNudgeRef = useRef<ResearchNudge | undefined>(undefined);
  const lastAutomaticContinuationKeyRef = useRef<string | null>(null);
  const automaticContinuationAttemptsRef = useRef<Map<string, number>>(
    new Map(),
  );
  const automaticContinuationPendingRef = useRef(false);
  const forcedSubagentForCurrentTurnRef = useRef<string | null>(null);

  // Manual input state — v6 useChat no longer manages input
  const [input, setInput] = useState("");
  const [draftReferences, setDraftReferences] = useState<
    ResolvedChatReference[]
  >([]);
  const [draftAttachments, setDraftAttachments] = useState<
    ChatDraftAttachment[]
  >([]);
  const [pendingAttachmentUploadCount, setPendingAttachmentUploadCount] =
    useState(0);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const pendingSubmitRef = useRef<{
    text: string;
    references: ResolvedChatReference[];
    attachments: ChatDraftAttachment[];
  } | null>(null);
  const customHandleSubmitRef = useRef<
    (event: React.FormEvent<HTMLFormElement>) => unknown
  >(() => {});
  const queueProcessingRef = useRef(false);
  const prevAgentTurnActiveRef = useRef(false);
  const attachmentCleanupInFlightRef = useRef(false);
  const isAttachmentUploadActive = pendingAttachmentUploadCount > 0;
  /** Starts a fresh model turn and clears UI-level cancellation state. */
  const beginAgentTurn = useCallback(() => {
    const outgoingScheduler = toolExecutionSchedulerRef.current;
    toolExecutionAbortControllerRef.current?.abort();
    if (outgoingScheduler) {
      toolExecutionHandoffRef.current = outgoingScheduler.drain();
    }
    const abortController = new AbortController();
    toolExecutionAbortControllerRef.current = abortController;
    toolExecutionTurnIdRef.current += 1;
    toolExecutionSchedulerRef.current = new OrderedToolExecutionScheduler(
      effectiveSettings.agent.execution.maxParallelReadOnlyCalls,
      abortController.signal,
      toolExecutionHandoffRef.current,
    );
    stopRequestedRef.current = false;
    automaticContinuationPendingRef.current = false;
    reactiveContextRetryRef.current = false;
    lastAutomaticContinuationKeyRef.current = null;
    automaticContinuationAttemptsRef.current.clear();
    researchNudgeRef.current = undefined;
    setStopRequestActive(false);
  }, [effectiveSettings.agent.execution.maxParallelReadOnlyCalls]);
  useEffect(
    () => () => {
      toolExecutionAbortControllerRef.current?.abort();
    },
    [],
  );
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setInput(e.target.value),
    [],
  );

  /** Adds a reference chip to the active draft and returns focus to the composer. */
  const addDraftReference = useCallback((reference: ResolvedChatReference) => {
    setDraftReferences((current) => {
      if (current.some((item) => item.id === reference.id)) return current;
      return [...current, reference].slice(-20);
    });
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 120);
  }, []);

  /**
   * Converts images into model file parts and copies non-images into managed
   * Jupyter storage before exposing them to the composer.
   */
  const handleAttachFiles = useCallback(
    async (files: FileList | readonly File[]) => {
      const selectedFiles = Array.from(files);
      if (selectedFiles.length === 0) return;

      const supportsImageInput =
        getModel(selectedModel)?.supportsImageInput === true;
      const nextAttachments: ChatDraftAttachment[] = [];
      let unsupportedImageCount = 0;

      setPendingAttachmentUploadCount((current) => current + 1);

      try {
        for (const file of selectedFiles) {
          const mediaType = file.type || "application/octet-stream";
          let reference: ResolvedChatReference;
          let imageFilePart: FileUIPart | undefined;

          if (mediaType.startsWith("image/")) {
            reference = makeExternalFileReference(file);
            if (supportsImageInput) {
              try {
                imageFilePart = {
                  type: "file",
                  mediaType,
                  filename: file.name,
                  url: await fileToDataUrl(file),
                };
              } catch (error) {
                console.error("Failed to read image attachment:", error);
                toast.error(`Could not attach ${file.name}.`);
                continue;
              }
            } else {
              unsupportedImageCount += 1;
            }
          } else {
            if (!kernelService || !effectiveChatId) {
              toast.error(
                `Could not attach ${file.name}: connect to a Jupyter server first.`,
              );
              continue;
            }

            const uploadToastId = toast.loading(`Uploading ${file.name}…`);
            try {
              const attachmentId = crypto.randomUUID();
              const manifest = await storeChatAttachment(
                kernelService.getContentsManager(),
                effectiveChatId,
                file,
                { attachmentId },
              );
              reference = buildManagedExternalFileReference(file, manifest);
              toast.success(`${file.name} attached.`, { id: uploadToastId });
            } catch (error) {
              console.error("Failed to store managed chat attachment:", error);
              const message =
                error instanceof Error ? error.message : String(error);
              toast.error(`Could not attach ${file.name}: ${message}`, {
                id: uploadToastId,
              });
              continue;
            }
          }

          nextAttachments.push({
            id: `${reference.id}:${crypto.randomUUID()}`,
            fileName: file.name,
            mediaType,
            size: file.size,
            ...(file.lastModified > 0
              ? { lastModified: file.lastModified }
              : {}),
            reference,
            ...(imageFilePart ? { imageFilePart } : {}),
          });
        }
      } finally {
        setPendingAttachmentUploadCount((current) => Math.max(0, current - 1));
      }

      if (unsupportedImageCount > 0) {
        toast.warning(
          unsupportedImageCount === 1
            ? "This model cannot see image attachments, so the image was attached as a pointer."
            : "This model cannot see image attachments, so the images were attached as pointers.",
        );
      }

      if (nextAttachments.length === 0) return;
      setDraftAttachments((current) =>
        [...current, ...nextAttachments].slice(-20),
      );
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    [effectiveChatId, getModel, kernelService, selectedModel, textareaRef],
  );

  useEffect(() => {
    const handleMentionNotebookCell = (event: Event) => {
      const detail = (event as CustomEvent<NotebookCellMentionEventDetail>)
        .detail;
      if (
        typeof detail?.notebookPath !== "string" ||
        typeof detail.cellIndex !== "number" ||
        !Number.isInteger(detail.cellIndex)
      ) {
        return;
      }

      addDraftReference(
        makeReference(
          "cell",
          formatCellReferenceLabel([detail.cellIndex]),
          {
            type: "cell",
            notebookPath: detail.notebookPath,
            cellIndices: [detail.cellIndex],
          },
          typeof detail.preview === "string"
            ? detail.preview
            : `Notebook cell ${detail.cellIndex} in ${detail.notebookPath}.`,
          `Use use_notebook with notebookPath="${agentPromptPath(detail.notebookPath)}", then read_cell for cell index ${detail.cellIndex}.`,
        ),
      );
    };

    window.addEventListener(
      "orion:mention-notebook-cell",
      handleMentionNotebookCell,
    );
    return () => {
      window.removeEventListener(
        "orion:mention-notebook-cell",
        handleMentionNotebookCell,
      );
    };
  }, [addDraftReference, agentPromptPath]);

  useEffect(() => {
    /** Converts output mention events from notebook surfaces into composer chips. */
    const handleMentionNotebookOutput = (event: Event) => {
      const detail = (event as CustomEvent<NotebookOutputMentionEventDetail>)
        .detail;
      if (
        typeof detail?.notebookPath !== "string" ||
        typeof detail.cellIndex !== "number" ||
        typeof detail.outputIndex !== "number" ||
        !Number.isInteger(detail.cellIndex) ||
        !Number.isInteger(detail.outputIndex) ||
        detail.cellIndex < 0 ||
        detail.outputIndex < 0
      ) {
        return;
      }

      addDraftReference(
        makeReference(
          "output",
          formatOutputReferenceLabel(detail.cellIndex, detail.outputIndex),
          {
            type: "output",
            notebookPath: detail.notebookPath,
            cellIndex: detail.cellIndex,
            outputIndex: detail.outputIndex,
          },
          typeof detail.preview === "string"
            ? detail.preview
            : `Notebook cell ${detail.cellIndex}, output ${detail.outputIndex} in ${detail.notebookPath}.`,
          `Use use_notebook with notebookPath="${agentPromptPath(detail.notebookPath)}", then read_cell_output with reads=[{cellIndex:${detail.cellIndex},outputIndex:${detail.outputIndex}}].`,
        ),
      );
    };

    window.addEventListener(
      "orion:mention-notebook-output",
      handleMentionNotebookOutput,
    );
    return () => {
      window.removeEventListener(
        "orion:mention-notebook-output",
        handleMentionNotebookOutput,
      );
    };
  }, [addDraftReference, agentPromptPath]);

  useEffect(() => {
    const handleMentionWorkspacePath = (event: Event) => {
      const detail = (event as CustomEvent<WorkspacePathMentionEventDetail>)
        .detail;
      if (typeof detail?.path !== "string" || detail.path.length === 0) {
        return;
      }
      if (detail.itemType !== "file" && detail.itemType !== "folder") {
        return;
      }

      const label =
        typeof detail.name === "string" && detail.name.length > 0
          ? detail.name
          : fileNameFromPath(detail.path);

      if (detail.itemType === "folder") {
        const promptPath = agentPromptPath(detail.path);
        addDraftReference(
          makeReference(
            "folder",
            label,
            { type: "folder", path: detail.path },
            `Folder: ${detail.path}`,
            `Use bash with safe read-only commands scoped to "${promptPath}" when exact folder contents are needed.`,
          ),
        );
        return;
      }

      const isNotebook = detail.path.endsWith(".ipynb");
      const promptPath = agentPromptPath(detail.path);
      addDraftReference(
        makeReference(
          "file",
          label,
          { type: "file", path: detail.path },
          `File: ${detail.path}`,
          isNotebook
            ? `Use use_notebook with notebookPath="${promptPath}", then read_notebook or read_cell for exact cells.`
            : `Use read_file with path="${promptPath}" for exact contents.`,
        ),
      );
    };

    window.addEventListener(
      "orion:mention-workspace-path",
      handleMentionWorkspacePath,
    );
    return () => {
      window.removeEventListener(
        "orion:mention-workspace-path",
        handleMentionWorkspacePath,
      );
    };
  }, [addDraftReference, agentPromptPath]);

  useEffect(() => {
    const handleAttachEditorSelection = (event: Event) => {
      const detail = (event as CustomEvent<EditorSelectionAttachEventDetail>)
        .detail;
      if (
        typeof detail?.path !== "string" ||
        typeof detail.lineStart !== "number" ||
        typeof detail.lineEnd !== "number" ||
        typeof detail.selectedText !== "string" ||
        !Number.isInteger(detail.lineStart) ||
        !Number.isInteger(detail.lineEnd) ||
        detail.lineStart < 1 ||
        detail.lineEnd < detail.lineStart
      ) {
        return;
      }

      const notebookCellIndex =
        typeof detail.notebookCellIndex === "number" &&
        Number.isInteger(detail.notebookCellIndex)
          ? detail.notebookCellIndex
          : undefined;
      const label =
        notebookCellIndex !== undefined
          ? formatCellSelectionReferenceLabel(
              notebookCellIndex,
              detail.lineStart,
              detail.lineEnd,
            )
          : formatFileSelectionReferenceLabel(
              detail.path,
              detail.lineStart,
              detail.lineEnd,
            );
      const range = formatLineRange(detail.lineStart, detail.lineEnd);
      const toolHint =
        typeof notebookCellIndex === "number"
          ? `Use use_notebook with notebookPath="${agentPromptPath(detail.path)}", then read_cell for cell index ${notebookCellIndex}; the selected source lines ${range} are included inline.`
          : `Use read_file with path="${agentPromptPath(detail.path)}", startLine=${detail.lineStart - 1}, endLine=${detail.lineEnd - 1} for exact contents.`;

      addDraftReference(
        makeReference(
          notebookCellIndex !== undefined ? "cell" : "file",
          label,
          notebookCellIndex !== undefined
            ? {
                type: "cell",
                notebookPath: detail.path,
                cellIndices: [notebookCellIndex],
                lineStart: detail.lineStart,
                lineEnd: detail.lineEnd,
              }
            : {
                type: "file",
                path: detail.path,
                lineStart: detail.lineStart,
                lineEnd: detail.lineEnd,
              },
          detail.selectedText,
          toolHint,
        ),
      );
    };

    window.addEventListener(
      "orion:attach-editor-selection",
      handleAttachEditorSelection,
    );
    return () => {
      window.removeEventListener(
        "orion:attach-editor-selection",
        handleAttachEditorSelection,
      );
    };
  }, [addDraftReference, agentPromptPath]);

  useEffect(() => {
    const handleMentionConversationSelection = (event: Event) => {
      const detail = (
        event as CustomEvent<ConversationSelectionMentionEventDetail>
      ).detail;
      if (
        typeof detail?.selectedText !== "string" ||
        typeof detail.messageId !== "string" ||
        typeof detail.messageIndex !== "number" ||
        typeof detail.partIndex !== "number" ||
        !Number.isInteger(detail.messageIndex) ||
        !Number.isInteger(detail.partIndex) ||
        detail.messageIndex < 0 ||
        detail.partIndex < 0 ||
        (detail.source !== "assistant" && detail.source !== "tool")
      ) {
        return;
      }

      const toolName =
        typeof detail.toolName === "string" ? detail.toolName : undefined;
      const toolCallId =
        typeof detail.toolCallId === "string" ? detail.toolCallId : undefined;
      const label = formatConversationSelectionReferenceLabel(
        detail.source,
        detail.messageIndex,
        toolName,
      );

      addDraftReference(
        makeReference(
          "conversation",
          label,
          {
            type: "conversation",
            messageId: detail.messageId,
            messageIndex: detail.messageIndex,
            partIndex: detail.partIndex,
            source: detail.source,
            toolName,
            toolCallId,
            selectionHash: hashConversationSelection(detail.selectedText),
          },
          detail.selectedText,
          "Use the selected conversation text included inline as context from this chat.",
        ),
      );
    };

    window.addEventListener(
      "orion:mention-conversation-selection",
      handleMentionConversationSelection,
    );
    return () => {
      window.removeEventListener(
        "orion:mention-conversation-selection",
        handleMentionConversationSelection,
      );
    };
  }, [addDraftReference]);

  const agentCommunicationStyle = effectiveSettings.chat.communicationStyle;
  const agentCustomCommunicationStyle =
    effectiveSettings.chat.customCommunicationStyle;
  const interactionModeConfigs = React.useMemo(
    () =>
      normalizeInteractionModeConfigs(effectiveSettings.chat.interactionModes),
    [effectiveSettings.chat.interactionModes],
  );

  React.useEffect(() => {
    const visibleModeId = resolveSelectorInteractionModeId(
      interactionMode,
      interactionModeConfigs,
    );
    if (visibleModeId === interactionMode) return;
    setInteractionMode(visibleModeId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_MODE_KEY, visibleModeId);
    }
    // Re-check only when selector visibility settings change, not when mode is set programmatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interactionMode intentionally omitted
  }, [interactionModeConfigs]);
  const resolvedInteractionModeConfig = React.useMemo(
    () =>
      resolveInteractionModeConfig({
        modeId: interactionMode,
        modes: interactionModeConfigs,
      }),
    [interactionMode, interactionModeConfigs],
  );

  // Edit mode ships the cell mutation tools without `execute_cell`, so the
  // execution chained onto insert_cell / overwrite_cell_source has to answer to
  // the mode's tool list rather than run regardless.
  const chainedCellExecutionAllowed = React.useMemo(
    () => modeAllowsChainedCellExecution(resolvedInteractionModeConfig.toolNames),
    [resolvedInteractionModeConfig.toolNames],
  );

  useEffect(() => {
    if (resolvedInteractionModeConfig.id === interactionMode) return;
    setInteractionMode(resolvedInteractionModeConfig.id);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        SESSION_MODE_KEY,
        resolvedInteractionModeConfig.id,
      );
    }
  }, [interactionMode, resolvedInteractionModeConfig.id]);

  const buildChatRequestBody = useCallback(
    (overrides?: Record<string, unknown>) => {
      const { notebookPath, activeFilePath } =
        agentEditorContext(activeNotebookPath);
      const requestInteractionMode =
        goalContractDraftActiveRef.current ||
        goalSessionRef.current?.status === "active"
          ? (interactionModeConfigs.find((mode) => mode.id === "Agent") ??
            resolvedInteractionModeConfig)
          : resolvedInteractionModeConfig;
      return {
        provider: modelInfo?.provider,
        model: apiModelId,
        interactionMode: requestInteractionMode.id,
        interactionModeConfig: requestInteractionMode,
        agentMode:
          requestInteractionMode.baseMode === "Explore" ||
          requestInteractionMode.baseMode === "Agent",
        chatId: effectiveChatId ?? undefined,
        modelRequestId: modelRequestIdRef.current,
        modelSettings: modelSettingsMap[selectedModel],
        notebookPath,
        activeFilePath,
        connectedNotebookPath:
          assistant?.getCurrentConnectedNotebookPath() ?? undefined,
        workspaceDirectory: workspaceDirectory ?? undefined,
        availableSkills: serializeAvailableSkills(
          assistant?.availableSkills ?? [],
        ),
        availableSubagents: serializeAvailableSubagents(
          assistant?.availableSubagents ?? [],
        ),
        agentRules: serializeAgentRules(assistant?.availableRules ?? []),
        serverInfo: assistant?.serverInfo ?? undefined,
        jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
        rootDirectory: assistant?.rootDirectory ?? undefined,
        clientPlatformOs,
        agentCommunicationStyle,
        agentCustomCommunicationStyle,
        researchSession: researchSessionRef.current.active
          ? researchSessionRef.current
          : undefined,
        researchNudge: researchNudgeRef.current,
        goalContractDraft: goalContractDraftActiveRef.current || undefined,
        goalContinuation: goalContinuationRef.current,
        businessExperienceMode: isBusinessExperience,
        contextSettings: effectiveSettings.agent.context,
        maxQuestionsPerAsk: effectiveSettings.agent.execution.maxQuestionsPerAsk,
        ...overrides,
      };
    },
    [
      activeNotebookPath,
      agentCommunicationStyle,
      agentCustomCommunicationStyle,
      apiModelId,
      assistant,
      clientPlatformOs,
      effectiveChatId,
      modelInfo?.provider,
      modelSettingsMap,
      resolvedInteractionModeConfig,
      selectedModel,
      workspaceDirectory,
      isBusinessExperience,
      effectiveSettings.agent.context,
      effectiveSettings.agent.execution.maxQuestionsPerAsk,
      interactionModeConfigs,
    ],
  );

  /** Runs the server-side context measurement against the real prepared prompt. */
  const requestContextPreflight = useCallback(
    async (
      candidateMessages: UIMessage[],
      signal?: AbortSignal,
    ): Promise<ContextMeasurement> => {
      const wireMessages = buildWirePayload(
        candidateMessages,
        compactionSummaryRef.current,
        { retentionTurns: contextSettingsRef.current.optimizerRetentionTurns },
      );
      const response = await fetch("/api/chat/context/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildChatRequestBody(),
          messages: wireMessages,
        }),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Context preflight returned HTTP ${response.status}`);
      }
      return ContextMeasurementSchema.parse(await response.json());
    },
    [buildChatRequestBody],
  );

  // Ref for dynamic body values — read by the transport function at send time
  const bodyRef = useRef<Record<string, unknown>>(buildChatRequestBody());
  const setMessagesRef = useRef<
    | ((
        updater: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
      ) => void)
    | null
  >(null);

  /** Clear automatic follow-up retry bookkeeping after durable research progress. */
  const resetAutomaticContinuationGuards = useCallback(() => {
    lastAutomaticContinuationKeyRef.current = null;
    automaticContinuationAttemptsRef.current.clear();
    automaticContinuationPendingRef.current = false;
    researchNudgeRef.current = undefined;
    bodyRef.current = {
      ...bodyRef.current,
      researchNudge: undefined,
    };
  }, []);

  /** Synchronize client loop state before useChat schedules its next request. */
  const syncAgentLoopRequestBody = useCallback(() => {
    bodyRef.current = {
      ...bodyRef.current,
      researchSession: researchSessionRef.current.active
        ? researchSessionRef.current
        : undefined,
      researchNudge: researchNudgeRef.current,
    };
  }, []);

  /** Starts a notebook-native research session for the current model turn. */
  const activateResearchSession = useCallback(
    (
      activation: "explore-mode" | "slash",
      objective: string,
      profile = "general",
      intensity: ResearchSessionIntensity = "standard",
    ) => {
      researchSessionRef.current = createResearchSession({
        activation,
        objective,
        profile,
        intensity,
      });
      resetAutomaticContinuationGuards();
      syncAgentLoopRequestBody();
    },
    [resetAutomaticContinuationGuards, syncAgentLoopRequestBody],
  );

  /** Ends the active research session without altering durable notebook work. */
  const deactivateResearchSession = useCallback(() => {
    researchSessionRef.current = createInactiveResearchSession();
    researchNudgeRef.current = undefined;
    resetAutomaticContinuationGuards();
    syncAgentLoopRequestBody();
  }, [resetAutomaticContinuationGuards, syncAgentLoopRequestBody]);

  /** Explore mode activates the notebook-native research loop before sending. */
  const ensureResearchSessionActive = useCallback(
    (objective: string) => {
      if (goalContractDraftActiveRef.current) return;
      if (goalSessionRef.current?.status === "active") return;
      if (resolvedInteractionModeConfig.baseMode !== "Explore") return;
      activateResearchSession(
        "explore-mode",
        objective.trim() || "Explore mode task",
        "general",
        "standard",
      );
    },
    [activateResearchSession, resolvedInteractionModeConfig.baseMode],
  );

  // Keep bodyRef in sync with latest values
  useEffect(() => {
    bodyRef.current = buildChatRequestBody();
  }, [buildChatRequestBody]);

  // Stable transport instance — uses bodyRef for dynamic body values.
  // prepareSendMessagesRequest intercepts every outbound send to apply the
  // wire optimizer (stub old tool results, drop old images) and replay any
  // active compaction summary as a synthetic summary pair.
  const transportRef = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      body: () => bodyRef.current,
      prepareSendMessagesRequest: ({ messages, body }) => {
        lastOutboundMessagesRef.current = messages.slice();
        return {
          body: {
            ...body,
            messages: buildWirePayload(messages, compactionSummaryRef.current, {
              retentionTurns:
                contextSettingsRef.current.optimizerRetentionTurns,
            }),
          },
        };
      },
    }),
  );

  /** Allow automatic model follow-ups while preventing the same stalled key from looping forever. */
  const allowAutomaticContinuation = useCallback(
    (
      key: string | null,
      options?: {
        maxAttempts?: number;
        reason?: string;
      },
    ): boolean => {
      if (!key) return false;
      const maxAttempts =
        options?.maxAttempts ?? MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS;
      const attempts = automaticContinuationAttemptsRef.current.get(key) ?? 0;
      if (attempts >= maxAttempts) return false;
      const nextAttempt = attempts + 1;
      automaticContinuationAttemptsRef.current.set(key, nextAttempt);
      lastAutomaticContinuationKeyRef.current = key;
      automaticContinuationPendingRef.current = true;
      bodyRef.current = {
        ...bodyRef.current,
        automaticContinuationAttempt: nextAttempt,
        automaticContinuationReason: options?.reason,
      };
      return true;
    },
    [],
  );

  const allowResearchContinuation = useCallback(
    (
      key: string | null,
      reason: string,
      currentMessages: UIMessage[],
    ): boolean => {
      if (!researchSessionRef.current.active || stopRequestedRef.current)
        return false;

      const lastAssistantMessage = currentMessages.findLast(
        (message) => message.role === "assistant",
      );
      const decision = advanceResearchSessionForContinuation(
        researchSessionRef.current,
        getResearchTurnActivity(lastAssistantMessage),
      );
      researchSessionRef.current = decision.session;
      researchNudgeRef.current = decision.nudge;
      syncAgentLoopRequestBody();

      if (!decision.continue) {
        if (decision.terminal) {
          toast.info(
            `Explore session ended after ${decision.session.stepCount} steps.`,
          );
        }
        return false;
      }

      return allowAutomaticContinuation(
        `research:${reason}:${decision.reason}:${key ?? "unknown"}`,
        {
          maxAttempts: RESEARCH_SESSION_MAX_STEPS,
          reason: decision.nudge ?? reason,
        },
      );
    },
    [allowAutomaticContinuation, syncAgentLoopRequestBody],
  );

  /** Check whether the UI should still consider a pending follow-up turn active. */
  const hasAutomaticContinuationAttemptsRemaining = useCallback(
    (
      key: string | null,
      maxAttempts = MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS,
    ): boolean => {
      if (!key) return false;
      return (
        (automaticContinuationAttemptsRef.current.get(key) ?? 0) < maxAttempts
      );
    },
    [],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
    addToolOutput,
  } = useChat({
    transport: transportRef.current,
    // Streaming can arrive at 50+ chunks/sec; throttle UI state commits so
    // markdown/tool rendering does not monopolize the main thread.
    experimental_throttle: 50,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      if (shouldContinueAfterToolCalls(currentMessages)) {
        const continuationKey = `tool:${getCompletedToolContinuationKey(currentMessages) ?? "unknown"}`;
        if (goalContractDraftActiveRef.current) {
          // Contract authoring is scoping, not working: once the author has
          // spent its investigation budget the next turn forces the proposal.
          const draftState = deriveGoalContractDraftState(
            currentMessages,
            goalSessionRef.current,
          );
          const investigationSteps =
            draftState.goalMessageIndex == null
              ? 0
              : countGoalContractAuthorInvestigationSteps(
                  currentMessages,
                  draftState.goalMessageIndex,
                );
          return allowAutomaticContinuation(continuationKey, {
            maxAttempts: MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS,
            reason:
              investigationSteps >= GOAL_CONTRACT_AUTHOR_MAX_INVESTIGATION_STEPS
                ? "goal_contract_investigation_budget_spent"
                : undefined,
          });
        }
        if (researchSessionRef.current.active) {
          return allowResearchContinuation(
            continuationKey,
            "research_tool_result",
            currentMessages,
          );
        }
        return allowAutomaticContinuation(continuationKey, {
          maxAttempts: MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS,
        });
      }
      if (goalContractDraftActiveRef.current && !stopRequestedRef.current) {
        const lastMessage = currentMessages.at(-1);
        if (
          lastMessage?.role === "assistant" &&
          !lastAssistantTurnHasGoalContractProposal(currentMessages) &&
          !lastMessage.parts.some((part) => part.type.startsWith("tool-"))
        ) {
          return allowAutomaticContinuation(
            getGoalContractProposalRetryKey(currentMessages),
            {
              maxAttempts: MAX_GOAL_CONTRACT_PROPOSAL_RETRIES,
              reason: "goal_contract_proposal_required",
            },
          );
        }
      }
      if (goalSessionRef.current?.status === "active") return false;
      if (!researchSessionRef.current.active || stopRequestedRef.current)
        return false;
      const lastMessage = currentMessages.at(-1);
      if (lastMessage?.role !== "assistant") return false;
      const hasToolPart = lastMessage.parts.some((part) =>
        part.type.startsWith("tool-"),
      );
      if (hasToolPart) return false;
      return allowResearchContinuation(
        `prose:${lastMessage.id}`,
        "research_prose_only",
        currentMessages,
      );
    },
    onFinish: ({ messages: finalMessages }) => {
      const persistId = effectiveChatIdRef.current;
      if (!persistId) return;

      const normalizedFinalMessages =
        deduplicateMessagesById(finalMessages).messages;
      const latestChats = chatsRef.current;
      const chatForPersist = latestChats.find((c) => c.id === persistId);
      const checkpointRequestId = modelRequestIdRef.current;
      const checkpointUserMessageIndex = checkpointRequestId
        ? normalizedFinalMessages.findLastIndex(
            (candidate) => candidate.role === "user",
          )
        : -1;
      const checkpointUserMessageId =
        checkpointUserMessageIndex >= 0
          ? normalizedFinalMessages[checkpointUserMessageIndex]?.id
          : undefined;
      const persistedMessages = attachPersistedToolTimings(
        stripAllRasterData(normalizedFinalMessages),
        toolTimingsRef.current,
      );
      const newChatMessages: ChatMessage[] = persistedMessages.map(
        (m, messageIndex) => {
          const messageForStorage = stripSessionOnlyFileParts(m);
          const existing = chatForPersist?.messages.find(
            (msg) => msg.id === m.id,
          );
          return {
            ...messageForStorage,
            metadata: normalizeChatMessageMetadata(m.metadata),
            timestamp: existing?.timestamp || new Date(),
            modelUsed: selectedModel,
            checkpointId:
              existing?.checkpointId ??
              (messageIndex === checkpointUserMessageIndex
                ? checkpointRequestId
                : undefined),
          };
        },
      );

      const chatBeforeUpdate = latestChats.find((c) => c.id === persistId);
      const isFirstUserMessage =
        chatBeforeUpdate?.messages.length === 0 &&
        newChatMessages.some((m) => m.role === "user");

      if (
        isFirstUserMessage &&
        !titleGeneratedForChatsRef.current.has(persistId)
      ) {
        titleGeneratedForChatsRef.current.add(persistId);
        generateAndSetTitle(newChatMessages, persistId);
      }

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === persistId) {
            return {
              ...chat,
              messages: newChatMessages,
              updatedAt: new Date(),
            };
          }
          return chat;
        }),
      );
      if (checkpointRequestId && checkpointUserMessageId) {
        setCheckpointRequestByMessageId((current) => {
          const next = new Map(current);
          next.set(checkpointUserMessageId, checkpointRequestId);
          return next;
        });
      }

      setEditingState(null);
    },
    onError: (error) => {
      console.log(error);
      const apiError = parseChatApiErrorMessage(error?.message);
      if (goalContractDraftActiveRef.current) {
        const contractAuthorError = apiError?.message?.trim();
        toast.error(
          contractAuthorError &&
            !/^failed to fetch$/iu.test(contractAuthorError)
            ? contractAuthorError
            : "The goal contract author could not continue. Check the connection, then add instructions in the composer to retry.",
        );
      }
      const isContextError = apiError?.code === "context_budget_exceeded";
      if (isContextError && reactiveContextRetryRef.current) {
        toast.error(apiError.message);
        return;
      }
      if (
        canStartContextRecovery({
          isContextError,
          alreadyAttempted: reactiveContextRetryRef.current,
          compactionInFlight: compactionInFlightRef.current,
          hasChatId: Boolean(effectiveChatIdRef.current),
        })
      ) {
        if (!modelInfo?.provider) return;
        const chatId = effectiveChatIdRef.current;
        if (!chatId) return;
        reactiveContextRetryRef.current = true;
        compactionInFlightRef.current = true;
        setIsCompacting(true);
        const recoveryToastId = toast.loading(
          "Compacting context and retrying…",
        );
        const outboundSnapshot = lastOutboundMessagesRef.current?.slice();
        const currentMessages = outboundSnapshot ?? messagesRef.current.slice();
        const prevSummary = compactionSummaryRef.current;
        void (async () => {
          await runContextRecoveryAttempt({
            messages: currentMessages,
            previousSummary: prevSummary,
            preflight: (candidateMessages) =>
              requestContextPreflight(candidateMessages).catch(() => null),
            buildPayload: (candidateMessages) =>
              buildWirePayload(
                candidateMessages,
                compactionSummaryRef.current,
                {
                  retentionTurns:
                    contextSettingsRef.current.optimizerRetentionTurns,
                },
              ),
            compact: async () =>
              (
                await compactConversation(currentMessages, {
                  chatId,
                  previousSummary: prevSummary,
                  model: apiModelId,
                  provider: modelInfo.provider,
                  retentionTurns: 1,
                  contextSettings: contextSettingsRef.current,
                })
              ).summary,
            persistSummary: async (summary) => {
              await chatStorage.updateCompactionSummary(chatId, summary);
              setChats((prev) =>
                prev.map((chat) =>
                  chat.id === chatId
                    ? { ...chat, compactionSummary: summary }
                    : chat,
                ),
              );
            },
            applySummary: (summary) => {
              compactionSummaryRef.current = summary;
            },
            restoreMessages: (snapshot) => {
              setMessages(snapshot);
              messagesRef.current = snapshot;
            },
            resend: () => {
              void sendMessage();
            },
          });
          toast.success("Context compacted. Retrying request…", {
            id: recoveryToastId,
          });
        })()
          .catch((err) => {
            console.error("Reactive compaction failed:", err);
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Context recovery stopped: ${message}`, {
              id: recoveryToastId,
            });
          })
          .finally(() => {
            compactionInFlightRef.current = false;
            setIsCompacting(false);
          });
      }
    },
  });
  setMessagesRef.current = setMessages;

  // Derived isLoading for backward compat with child components
  const isLoading = status === "streaming" || status === "submitted";
  useEffect(() => {
    if (
      status === "streaming" ||
      status === "submitted" ||
      status === "error"
    ) {
      automaticContinuationPendingRef.current = false;
    }
  }, [status]);
  const draftImageAttachmentCount = React.useMemo(
    () =>
      draftAttachments.filter((attachment) => attachment.imageFilePart).length,
    [draftAttachments],
  );
  const deferredMessagesForContext = React.useDeferredValue(messages);

  // Bumped on every successful compaction so a pre-compaction measurement is
  // never carried over onto a transcript it no longer describes.
  const [compactionEpoch, setCompactionEpoch] = useState(0);

  const contextDraft = React.useMemo(
    () => ({
      text: input,
      imageAttachmentCount: draftImageAttachmentCount,
      // The server inlines exactly this block, so price its real length.
      referenceBlockChars: formatReferencesForMessage(draftReferences).length,
    }),
    [input, draftImageAttachmentCount, draftReferences],
  );

  const {
    usage: contextUsage,
    phase: contextUsagePhase,
    setAnchor: setContextAnchor,
  } = useContextUsage({
    messages: deferredMessagesForContext,
    draft: contextDraft,
    modelKey: selectedModel,
    chatId: effectiveChatId ?? null,
    compactionEpoch,
    isTurnActive: isLoading,
    requestMeasurement: requestContextPreflight,
  });

  // Ref to always hold the latest addToolOutput so async tool callbacks
  // never invoke a stale closure (which would see an outdated `status`
  // and skip the follow-up LLM request).
  const addToolOutputRef = useRef(addToolOutput);

  const hasPendingToolCalls = React.useMemo(() => {
    const modeUsesTools =
      isGoalContractDraftActive ||
      resolvedInteractionModeConfig.toolNames.length > 0 ||
      resolvedInteractionModeConfig.baseMode === "Explore" ||
      resolvedInteractionModeConfig.baseMode === "Agent";
    if (!modeUsesTools) return false;

    return messages.some((msg) =>
      msg.parts.some(
        (part) =>
          part.type.startsWith("tool-") &&
          "state" in part &&
          part.state === "input-available",
      ),
    );
  }, [
    isGoalContractDraftActive,
    messages,
    resolvedInteractionModeConfig.baseMode,
    resolvedInteractionModeConfig.toolNames.length,
  ]);

  /**
   * True while the agent is mid-turn: streaming, executing tools, or waiting for
   * the automatic follow-up request after tool results (the gap where status is
   * briefly "ready" but the assistant has not finished responding yet).
   */
  const isAgentTurnActive = React.useMemo(() => {
    if (stopRequestActive) return false;
    if (status === "streaming" || status === "submitted") return true;
    if (automaticContinuationPendingRef.current) return true;
    if (hasPendingToolCalls) return true;
    if (pendingApprovalIds.size > 0) return true;
    if (researchSessionRef.current.active) {
      if (researchSessionRef.current.stepCount >= RESEARCH_SESSION_MAX_STEPS)
        return false;
      const lastMessage = messages.at(-1);
      if (
        lastMessage?.role === "assistant" &&
        !lastMessage.parts.some((part) => part.type.startsWith("tool-"))
      ) {
        return true;
      }
    }
    if (goalContractDraftActiveRef.current) {
      const lastMessage = messages.at(-1);
      if (
        lastMessage?.role === "assistant" &&
        !lastAssistantTurnHasGoalContractProposal(messages) &&
        !lastMessage.parts.some((part) => part.type.startsWith("tool-"))
      ) {
        return hasAutomaticContinuationAttemptsRemaining(
          getGoalContractProposalRetryKey(messages),
          MAX_GOAL_CONTRACT_PROPOSAL_RETRIES,
        );
      }
    }
    if (!shouldContinueAfterToolCalls(messages)) return false;
    const baseContinuationKey = `tool:${getCompletedToolContinuationKey(messages) ?? "unknown"}`;
    if (researchSessionRef.current.active) return true;
    const continuationKey = baseContinuationKey;
    return hasAutomaticContinuationAttemptsRemaining(
      continuationKey,
      MAX_STANDARD_AUTO_CONTINUATION_ATTEMPTS,
    );
  }, [
    stopRequestActive,
    status,
    hasPendingToolCalls,
    pendingApprovalIds,
    messages,
    hasAutomaticContinuationAttemptsRemaining,
  ]);

  const isInputLocked = isAgentTurnActive || isGoalStarting;

  /** Stamp terminal tool timings when a turn completes so compact rows can show duration. */
  const prevTurnActiveForTimingsRef = useRef(isAgentTurnActive);
  useLayoutEffect(() => {
    const wasActive = prevTurnActiveForTimingsRef.current;
    prevTurnActiveForTimingsRef.current = isAgentTurnActive;

    if (!wasActive || isAgentTurnActive) return;

    const endedAt = Date.now();
    setToolTimings((prev) => {
      const next = finalizeCompletedToolTimings(messages, prev, endedAt);
      toolTimingsRef.current = next;
      return next;
    });
  }, [isAgentTurnActive, messages]);

  /** Skill slash commands built from the currently available skills. */
  const skillSlashCommands = React.useMemo(
    () => buildSkillSlashCommands(assistant?.availableSkills ?? []),
    [assistant?.availableSkills],
  );
  const subagentSlashCommands = React.useMemo(
    () => buildSubagentSlashCommands(assistant?.availableSubagents ?? []),
    [assistant?.availableSubagents],
  );

  /**
   * Detect which slash command (if any) is active based on the current input.
   */
  const activeSlashCommand = React.useMemo(
    () =>
      detectActiveSlashCommand(input, [
        ...subagentSlashCommands,
        ...skillSlashCommands,
      ]),
    [input, subagentSlashCommands, skillSlashCommands],
  );

  useEffect(() => {
    const focusComposer = () => textareaRef.current?.focus();

    /** Inserts plain text requested by notebook UI affordances into the chat draft. */
    const handleInsertChatMessage = (event: Event) => {
      const detail = getInsertChatMessageDetail(event);
      if (!detail) return;

      if (detail.submit) {
        if (!shouldDispatchAutoFix(detail.dedupeKey)) {
          return;
        }

        if (isInputLocked) {
          setMessageQueue((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              text: detail.message,
              references: [],
              attachments: [],
            },
          ]);
          return;
        }

        pendingSubmitRef.current = {
          text: detail.message,
          references: [],
          attachments: [],
        };
        void Promise.resolve(
          customHandleSubmitRef.current({
            preventDefault: () => {},
          } as React.FormEvent<HTMLFormElement>),
        ).finally(() => {
          pendingSubmitRef.current = null;
        });
        return;
      }

      if (isInputLocked) return;

      setInput((current) =>
        insertMessageIntoComposerInput(current, detail.message),
      );
      focusComposer();
      window.setTimeout(focusComposer, 0);
      window.setTimeout(focusComposer, 120);
    };

    const handleInsertChatSkill = (event: Event) => {
      if (isInputLocked) return;

      const detail = getInsertChatSkillDetail(event);
      if (!detail) return;

      const skillAvailable = (assistant?.availableSkills ?? []).some(
        (skill) => skill.name === detail.skillName,
      );
      if (!skillAvailable) return;

      if (detail.newChat) {
        createNewChatRef.current();
        setInput(
          insertSkillIntoComposerInput("", detail.skillName, detail.message),
        );
      } else {
        setInput((current) =>
          insertSkillIntoComposerInput(
            current,
            detail.skillName,
            detail.message,
          ),
        );
      }
      focusComposer();
      window.setTimeout(focusComposer, 0);
      window.setTimeout(focusComposer, 120);
    };

    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, handleInsertChatMessage);
    window.addEventListener(INSERT_CHAT_SKILL_EVENT, handleInsertChatSkill);
    return () => {
      window.removeEventListener(
        INSERT_CHAT_MESSAGE_EVENT,
        handleInsertChatMessage,
      );
      window.removeEventListener(
        INSERT_CHAT_SKILL_EVENT,
        handleInsertChatSkill,
      );
    };
  }, [assistant?.availableSkills, isInputLocked, textareaRef]);

  /** Clears queued messages when switching chats. */
  useEffect(() => {
    setMessageQueue([]);
  }, [effectiveChatId]);

  const handleRemoveQueuedMessage = useCallback((id: string) => {
    setMessageQueue((current) =>
      current.filter((message) => message.id !== id),
    );
  }, []);

  /** Opens the selected active rule file in Orion's main editor. */
  const handleOpenRule = useCallback(
    (rule: AgentRule) => {
      onOpenFile?.({ name: formatRuleDisplayName(rule), path: rule.path });
    },
    [onOpenFile],
  );

  /** Run compaction and update state + persisted chat. Returns the new summary on success, null on failure. */
  const runCompaction = useCallback(
    async (opts?: {
      retentionTurns?: number;
      measurementMessages?: UIMessage[];
    }): Promise<CompactionSummary | null> => {
      if (compactionInFlightRef.current || !effectiveChatId) return null;
      if (!modelInfo?.provider) return null;
      compactionInFlightRef.current = true;
      setIsCompacting(true);
      const compactionToastId = toast.loading("Compacting conversation…");

      try {
        const measurementMessages =
          opts?.measurementMessages ?? messagesRef.current;
        const beforePreflight = await requestContextPreflight(
          measurementMessages,
        ).catch(() => null);
        const result = await compactConversation(messagesRef.current, {
          chatId: effectiveChatId,
          previousSummary: currentChat?.compactionSummary,
          model: apiModelId,
          provider: modelInfo.provider,
          retentionTurns:
            opts?.retentionTurns ??
            contextSettingsRef.current.compactionRetentionTurns,
          contextSettings: contextSettingsRef.current,
        });

        // Install the summary before measuring so preflight builds the compacted replay.
        compactionSummaryRef.current = result.summary;
        const afterPreflight = await requestContextPreflight(
          measurementMessages,
        ).catch(() => null);
        const measuredSummary: CompactionSummary = {
          ...result.summary,
          tokensSaved:
            beforePreflight && afterPreflight
              ? Math.max(
                  0,
                  beforePreflight.inputTokens - afterPreflight.inputTokens,
                )
              : 0,
        };
        // Invalidate the pre-compaction anchor before installing the new one, so a
        // measurement of the old transcript can never be shown against the new one.
        setCompactionEpoch((epoch) => epoch + 1);
        if (afterPreflight) setContextAnchor(afterPreflight);
        await chatStorage.updateCompactionSummary(
          effectiveChatId,
          measuredSummary,
        );
        compactionSummaryRef.current = measuredSummary;

        setChats((prev) =>
          prev.map((c) =>
            c.id === effectiveChatId
              ? { ...c, compactionSummary: measuredSummary }
              : c,
          ),
        );

        const savedK = Math.round(measuredSummary.tokensSaved / 1000);
        toast.success(
          beforePreflight && afterPreflight
            ? `Compacted — freed ${savedK > 0 ? `${savedK}k` : "some"} tokens`
            : "Compacted — token savings will be measured on the next preflight",
          { id: compactionToastId },
        );

        return measuredSummary;
      } catch (err) {
        console.error("Compaction failed:", err);
        toast.error("Failed to compact conversation. Please try again.", {
          id: compactionToastId,
        });
        return null;
      } finally {
        compactionInFlightRef.current = false;
        setIsCompacting(false);
      }
    },
    [
      apiModelId,
      currentChat?.compactionSummary,
      effectiveChatId,
      modelInfo?.provider,
      requestContextPreflight,
      setContextAnchor,
      setChats,
    ],
  );

  /** Fetches recorded usage for this chat and renders it as a temporary assistant row. */
  const showCostSummary = useCallback(
    async (options?: { refresh?: boolean }): Promise<void> => {
      if (!effectiveChatId) return;

      setIsRefreshingCostSummary(true);
      try {
        const summary = await chatStorage.getChatCostSummary(effectiveChatId, {
          refresh: options?.refresh ?? true,
        });
        const modelLabels = Object.fromEntries(
          modelsWithAccess.map((model) => [model.value, model.label]),
        );
        setEphemeralCostMessage((current) => {
          const preserveMessageId =
            options?.refresh === true && current?.chatId === effectiveChatId;
          return {
            chatId: effectiveChatId,
            summary,
            modelLabels,
            message: {
              id: preserveMessageId
                ? current.message.id
                : createCostSummaryMessageId(),
              role: "assistant",
              parts: [],
            },
          };
        });
      } catch (error) {
        console.error("Failed to load cost summary:", error);
        toast.error("Failed to load session cost summary.");
      } finally {
        setIsRefreshingCostSummary(false);
      }
    },
    [effectiveChatId, modelsWithAccess],
  );

  const visibleCostSummary =
    ephemeralCostMessage?.chatId === effectiveChatId
      ? ephemeralCostMessage
      : null;
  const autoRefreshCostSummary = useCallback((): void => {
    void showCostSummary({ refresh: true });
  }, [showCostSummary]);
  const resetPendingCostAutoRefresh = usePendingCostAutoRefresh({
    refreshKey: visibleCostSummary
      ? `${visibleCostSummary.chatId}:${visibleCostSummary.message.id}`
      : null,
    pendingRequestCount: visibleCostSummary?.summary.pendingRequestCount ?? 0,
    summarySnapshot: visibleCostSummary?.summary ?? null,
    onRefresh: autoRefreshCostSummary,
  });

  const dismissCostSummary = useCallback((): void => {
    resetPendingCostAutoRefresh();
    setEphemeralCostMessage(null);
  }, [resetPendingCostAutoRefresh]);

  const refreshCostSummary = useCallback((): void => {
    resetPendingCostAutoRefresh();
    void showCostSummary({ refresh: true });
  }, [resetPendingCostAutoRefresh, showCostSummary]);

  /** Runs slash commands that submit immediately without a trailing message. */
  const handleImmediateSlashCommand = useCallback(
    async (command: SlashCommand) => {
      if (command.name === "cost") {
        await showCostSummary();
        return;
      }

      if (command.name === "report-bug") {
        setEphemeralCostMessage(null);
        window.open(ORION_GITHUB_ISSUES_URL, "_blank", "noopener,noreferrer");
      }
    },
    [showCostSummary],
  );

  // Keep messagesRef up to date
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const goalContractDraftState = React.useMemo(
    () => deriveGoalContractDraftState(messages, goalSession),
    [goalSession, messages],
  );

  /** Restore contract-authoring state from persisted proposal tool parts. */
  useEffect(() => {
    goalContractDraftActiveRef.current = goalContractDraftState.active;
    setIsGoalContractDraftActive(goalContractDraftState.active);
    bodyRef.current = {
      ...bodyRef.current,
      goalContractDraft: goalContractDraftState.active || undefined,
    };
  }, [goalContractDraftState.active]);

  /** Surface a recoverable stop when the model repeatedly omits the required proposal. */
  useEffect(() => {
    if (
      !goalContractDraftState.active ||
      goalContractDraftState.phase !== "authoring" ||
      status !== "ready"
    )
      return;
    const lastMessage = messages.at(-1);
    if (
      lastMessage?.role !== "assistant" ||
      lastMessage.parts.some((part) => part.type.startsWith("tool-"))
    )
      return;
    const key = getGoalContractProposalRetryKey(messages);
    if (!key) return;
    if (
      (automaticContinuationAttemptsRef.current.get(key) ?? 0) <
      MAX_GOAL_CONTRACT_PROPOSAL_RETRIES
    ) {
      return;
    }
    if (goalContractFailureToastIdsRef.current.has(lastMessage.id)) return;
    goalContractFailureToastIdsRef.current.add(lastMessage.id);
    toast.error(
      "The contract author did not return a proposal. Add instructions in the composer to try again.",
    );
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [
    goalContractDraftState.active,
    goalContractDraftState.phase,
    messages,
    status,
  ]);

  const visibleMessages = React.useMemo(
    () =>
      ephemeralCostMessage?.chatId === effectiveChatId
        ? [...messages, ephemeralCostMessage.message]
        : messages,
    [effectiveChatId, ephemeralCostMessage, messages],
  );

  const costSummaryByMessageId = React.useMemo(
    () =>
      ephemeralCostMessage?.chatId === effectiveChatId
        ? {
            [ephemeralCostMessage.message.id]: {
              summary: ephemeralCostMessage.summary,
              modelLabels: ephemeralCostMessage.modelLabels,
            },
          }
        : undefined,
    [effectiveChatId, ephemeralCostMessage],
  );

  // Keep addToolOutputRef in sync so async callbacks always use the latest closure
  useEffect(() => {
    addToolOutputRef.current = addToolOutput;
  }, [addToolOutput]);

  type ToolOutputPayload = Parameters<typeof addToolOutput>[0];

  /** Submit a tool result to useChat and stamp its terminal time for compact activity rows. */
  const addTimedToolOutput = useCallback(
    (payload: ToolOutputPayload) => {
      markToolEnded(payload.toolCallId);
      addToolOutputRef.current(payload);
    },
    [markToolEnded],
  );

  /** Persist the final state of the edit checkpoint for the active user turn. */
  const markCurrentEditCheckpointStatus = useCallback(
    async (statusValue: "completed" | "interrupted"): Promise<void> => {
      const requestId = modelRequestIdRef.current;
      if (!requestId) return;

      try {
        await fetch(`/api/checkpoints/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusValue }),
        });
        await refreshCheckpointStatuses();
      } catch (error) {
        console.warn("Failed to update edit checkpoint status:", error);
      }
    },
    [refreshCheckpointStatuses],
  );

  /** Restore or redo all clean targets recorded for a user-turn checkpoint. */
  const handleRestoreCheckpoint = useCallback(
    async (checkpointId: string, action: "restore" | "redo"): Promise<void> => {
      if (!kernelService) {
        toast.error(
          `Connect to a Jupyter server before ${action === "redo" ? "redoing" : "restoring"} a checkpoint.`,
        );
        return;
      }

      try {
        const result = await restoreEditCheckpoint({
          kernelService,
          requestId: checkpointId,
          direction: action === "redo" ? "redo" : "undo",
          saveOpenDocumentIfDirty: assistant?.saveOpenDocumentIfDirty,
        });

        await refreshCheckpointStatuses();

        if (result.conflicts.length > 0) {
          toast.warning(
            `${action === "redo" ? "Redid" : "Restored"} ${result.restoredCount} item${result.restoredCount === 1 ? "" : "s"}; ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} skipped.`,
          );
          return;
        }

        toast.success(
          `${action === "redo" ? "Redid" : "Restored"} ${result.restoredCount} checkpoint item${result.restoredCount === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        console.error(`Failed to ${action} checkpoint:`, error);
        toast.error(
          error instanceof Error
            ? error.message
            : `Failed to ${action === "redo" ? "redo" : "restore"} checkpoint.`,
        );
      }
    },
    [
      assistant?.saveOpenDocumentIfDirty,
      kernelService,
      refreshCheckpointStatuses,
    ],
  );

  /** Returns message state safe for useChat by removing persistence-only fields. */
  const toChatStateMessages = useCallback(
    (chatMessages: ChatMessage[]): UIMessage[] =>
      chatMessages.map((message) => {
        const { checkpointId: _checkpointId, ...messageWithoutCheckpoint } =
          message;
        return {
          ...messageWithoutCheckpoint,
          metadata: normalizeChatMessageMetadata(message.metadata),
        };
      }),
    [],
  );

  /** Finds checkpoint ids that should be undone before resending an edited user turn. */
  const getInPlaceEditRestoreCheckpointIds = useCallback(
    (action: PendingInPlaceEditAction): string[] =>
      getRestorableInPlaceEditCheckpointIds({
        sourceChat: action.sourceChat,
        sourceMessageIndex: action.sourceMessageIndex,
        checkpointRequestByMessageId,
        checkpointStatuses,
      }),
    [checkpointRequestByMessageId, checkpointStatuses],
  );

  /** Restores checkpointed workspace edits newest-to-oldest before an in-place resend. */
  const restoreWorkspaceForInPlaceEdit = useCallback(
    async (action: PendingInPlaceEditAction): Promise<void> => {
      if (!kernelService) {
        throw new Error(
          "Connect to a Jupyter server before restoring files to this point.",
        );
      }

      const checkpointIds = getInPlaceEditRestoreCheckpointIds(action);
      let restoredCount = 0;
      let conflictCount = 0;
      for (const checkpointId of checkpointIds) {
        const result = await restoreEditCheckpoint({
          kernelService,
          requestId: checkpointId,
          direction: "undo",
          saveOpenDocumentIfDirty: assistant?.saveOpenDocumentIfDirty,
        });
        restoredCount += result.restoredCount;
        conflictCount += result.conflicts.length;
      }

      await refreshCheckpointStatuses();

      if (conflictCount > 0) {
        toast.warning(
          `Restored ${restoredCount} item${restoredCount === 1 ? "" : "s"}; ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} skipped.`,
        );
        return;
      }

      toast.success(
        `Restored ${restoredCount} checkpoint item${restoredCount === 1 ? "" : "s"}.`,
      );
    },
    [
      assistant?.saveOpenDocumentIfDirty,
      getInPlaceEditRestoreCheckpointIds,
      kernelService,
      refreshCheckpointStatuses,
    ],
  );

  /** Applies model-specific raster preview handling to every tool result shape. */
  const prepareAgentToolResult = useCallback(
    async (result: unknown): Promise<unknown> =>
      prepareToolResultForModel({
        result,
        supportsImageInput: modelInfo?.supportsImageInput === true,
        imageMaxBase64Chars:
          effectiveSettings.agent.toolOutput.imageBase64CharBudget,
      }),
    [
      effectiveSettings.agent.toolOutput.imageBase64CharBudget,
      modelInfo?.supportsImageInput,
    ],
  );

  const enqueueToolExecution = useCallback(
    (
      toolCallId: string,
      toolName: OrionToolName,
      args: Record<string, unknown>,
      approvalPromise?: Promise<"approve" | "reject">,
    ) => {
      if (!assistant) return;

      let abortController = toolExecutionAbortControllerRef.current;
      let scheduler = toolExecutionSchedulerRef.current;
      if (!abortController || !scheduler) {
        abortController = new AbortController();
        toolExecutionAbortControllerRef.current = abortController;
        toolExecutionTurnIdRef.current += 1;
        scheduler = new OrderedToolExecutionScheduler(
          effectiveSettings.agent.execution.maxParallelReadOnlyCalls,
          abortController.signal,
          toolExecutionHandoffRef.current,
        );
        toolExecutionSchedulerRef.current = scheduler;
      }

      const scheduledTurnId = toolExecutionTurnIdRef.current;
      const signal = abortController.signal;
      const modelRequestId = modelRequestIdRef.current;
      const scheduledChatId = effectiveChatIdRef.current;
      const isCurrentExecution = () =>
        !signal.aborted && toolExecutionTurnIdRef.current === scheduledTurnId;

      void scheduler
        .schedule(toolName, async () => {
          if (approvalPromise) {
            const action = await approvalPromise;
            if (action === "reject" || !isCurrentExecution()) {
              if (!isCurrentExecution()) return;
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: REJECTED_TOOL_RESULT,
              });
              addTimedToolOutput({
                state: "output-error",
                tool: toolName,
                toolCallId,
                errorText: "rejected_by_user",
              });
              return;
            }
          }

          throwIfToolExecutionAborted(signal);
          if (!isCurrentExecution()) {
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result: CANCELLED_TOOL_RESULT,
            });
            markToolEnded(toolCallId);
            return;
          }
          trackedToolCallsRef.current.set(toolCallId, { status: "running" });
          markToolStarted(toolCallId);

          // ---- ask_question: the user answers it in the chat body -------
          // Parked on the scheduler rather than executed, so the model's turn
          // stays blocked on the questionnaire exactly as it would on any
          // other tool call.
          if (toolName === "ask_question") {
            const answers = await new Promise<AskQuestionResult>((resolve) => {
              pendingAskQuestionsRef.current.set(toolCallId, {
                toolCallId,
                resolve,
              });
            });
            setAnsweredAskQuestionIds((prev) => {
              if (!prev.has(toolCallId)) return prev;
              const next = new Set(prev);
              next.delete(toolCallId);
              return next;
            });
            if (!isCurrentExecution()) return;
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result: answers,
            });
            addTimedToolOutput({
              tool: toolName,
              toolCallId,
              output: answers,
            });
            return;
          }

          // ---- delegate tool: run client-side subagent runner ----------
          if (toolName === "delegate") {
            const delegateArgs = args as {
              description?: string;
              subagent?: string;
              reconnectTmpNotebookPath?: string;
            };
            const description =
              typeof delegateArgs.description === "string"
                ? delegateArgs.description
                : "";
            const subagentType =
              typeof delegateArgs.subagent === "string"
                ? delegateArgs.subagent
                : "";
            const reconnectTmpNotebookPath =
              typeof delegateArgs.reconnectTmpNotebookPath === "string"
                ? delegateArgs.reconnectTmpNotebookPath.trim()
                : "";
            const subagentDefinition = assistant.availableSubagents.find(
              (candidate) => candidate.name === subagentType,
            );
            const runChatId = effectiveChatId;
            let latestSubagentMessages: UIMessage[] = [];

            const writeSubagentSession = (
              patch: Partial<SubagentSession> & {
                status?: SubagentSessionStatus;
              },
            ) => {
              if (!runChatId || !isCurrentExecution()) return;
              const timestamp = new Date();
              setChats((prev) =>
                prev.map((chat) => {
                  if (chat.id !== runChatId) return chat;
                  const existing = chat.subagentSessions?.[toolCallId];
                  const base: SubagentSession = existing ?? {
                    subagentType,
                    label:
                      subagentDefinition?.label ??
                      (subagentType || "Sub-agent"),
                    description,
                    status: "running",
                    messages: [],
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  };
                  return {
                    ...chat,
                    subagentSessions: {
                      ...(chat.subagentSessions ?? {}),
                      [toolCallId]: {
                        ...base,
                        ...patch,
                        updatedAt: timestamp,
                      },
                    },
                    updatedAt: timestamp,
                  };
                }),
              );
            };

            const failDelegate = (
              errorText: string,
              patch?: Partial<SubagentSession>,
            ) => {
              if (!isCurrentExecution()) return;
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: { error: errorText },
              });
              writeSubagentSession({
                ...patch,
                status: "error",
                errorText,
              });
              addTimedToolOutput({
                state: "output-error",
                tool: toolName,
                toolCallId,
                errorText,
              });
            };

            if (!subagentDefinition) {
              failDelegate(
                `Sub-agent "${subagentType || "(missing)"}" is not available in this session.`,
              );
              return;
            }

            if (
              subagentDefinition.options?.disableModelInvocation === true &&
              forcedSubagentForCurrentTurnRef.current !==
                subagentDefinition.name
            ) {
              failDelegate(
                `Sub-agent "${subagentDefinition.name}" is disabled for model invocation. Invoke it with /${subagentDefinition.name}.`,
              );
              return;
            }

            const modelResolution = resolveSubagentExecutionModel({
              subagentName: subagentDefinition.name,
              configuredModelId: subagentDefinition.options?.model,
              selectedModelId: selectedModel,
              parentModel: modelInfo,
              modelsWithAccess,
              modelSettingsMap,
            });
            if (!modelResolution.ok) {
              failDelegate(modelResolution.errorText);
              return;
            }
            const existingSubagentSessions =
              currentChat?.subagentSessions ?? {};
            const existingMaxInstance = Object.values(existingSubagentSessions)
              .filter((session) => session.subagentType === subagentType)
              .reduce(
                (max, session) =>
                  Math.max(max, session.subagentDevLogInstance ?? 0),
                0,
              );
            const reconnectEntry = reconnectTmpNotebookPath
              ? Object.entries(existingSubagentSessions).find(
                  ([, session]) =>
                    session.subagentType === subagentType &&
                    session.tmpNotebookPath === reconnectTmpNotebookPath,
                )
              : undefined;

            if (reconnectTmpNotebookPath && !reconnectEntry) {
              const errorText =
                "Cannot reconnect to that sub-agent run from this chat. Use the exact tmpNotebookPath returned by a prior delegate call in the current chat.";
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: { error: errorText },
              });
              writeSubagentSession({
                status: "error",
                tmpNotebookPath: reconnectTmpNotebookPath,
                errorText,
              });
              addTimedToolOutput({
                state: "output-error",
                tool: toolName,
                toolCallId,
                errorText,
              });
              return;
            }

            const subagentAbortController = new AbortController();
            const abortSubagent = () => subagentAbortController.abort();
            signal.addEventListener("abort", abortSubagent, { once: true });
            activeSubagentRunToolCallsRef.current.add(toolCallId);

            try {
              const { notebookPath, activeFilePath } =
                agentEditorContext(activeNotebookPath);
              const subagentKey = `${runChatId ?? "no-chat"}:${subagentType}`;
              const reconnectSourceToolCallId = reconnectEntry?.[0];
              const reconnectSourceSession = reconnectEntry?.[1];
              const nextSubagentInstance = reconnectSourceSession
                ? reconnectSourceSession.subagentDevLogInstance ||
                  existingMaxInstance ||
                  1
                : Math.max(
                    subagentRunIndexRef.current.get(subagentKey) ?? 0,
                    existingMaxInstance,
                  ) + 1;
              if (!reconnectSourceSession) {
                subagentRunIndexRef.current.set(
                  subagentKey,
                  nextSubagentInstance,
                );
              }
              latestSubagentMessages = reconnectSourceSession?.messages ?? [];
              writeSubagentSession({
                status: "running",
                tmpNotebookPath: reconnectTmpNotebookPath || undefined,
                subagentDevLogInstance: nextSubagentInstance,
                reconnectedFromToolCallId: reconnectSourceToolCallId,
                messages: latestSubagentMessages,
              });

              const subagentResult = await runSubagent({
                subagentType,
                contextSettings: contextSettingsRef.current,
                availableSubagents: assistant.availableSubagents,
                agentRules: assistant.availableRules,
                description,
                modelId: modelResolution.modelId,
                providerId: modelResolution.providerId,
                modelSettings: modelResolution.modelSettings,
                workspaceDirectory: workspaceDirectory ?? undefined,
                notebookPath,
                activeFilePath,
                getCurrentConnectedNotebookPath:
                  assistant.getCurrentConnectedNotebookPath,
                serverInfo: assistant.serverInfo ?? undefined,
                jupyterServerIsLocal:
                  assistant.jupyterServerIsLocal ?? undefined,
                rootDirectory: assistant.rootDirectory ?? undefined,
                clientPlatformOs,
                chatId: runChatId ?? undefined,
                subagentDevLogInstance: nextSubagentInstance,
                reconnectTmpNotebookPath: reconnectTmpNotebookPath || undefined,
                reconnectMessages: reconnectSourceSession?.messages,
                executeToolCall: (name, input, abortSignal) =>
                  assistant.executeToolCall(name, input, {
                    modelRequestId,
                    chatId: scheduledChatId,
                    toolCallId,
                    abortSignal: abortSignal ?? subagentAbortController.signal,
                  }),
                maxParallelReadOnlyCalls:
                  effectiveSettings.agent.execution.maxParallelReadOnlyCalls,
                onToolStart: markToolStarted,
                onToolEnd: markToolEnded,
                createTmpNotebookCopy: assistant.createTmpSubagentNotebookCopy,
                abortSignal: subagentAbortController.signal,
                onTmpNotebookPath: (tmpNotebookPath) => {
                  writeSubagentSession({
                    status: "running",
                    tmpNotebookPath,
                  });
                },
                onMessagesChange: (nextMessages) => {
                  latestSubagentMessages = nextMessages;
                  writeSubagentSession({
                    status: "running",
                    messages: nextMessages,
                  });
                },
                onStepProgress: (step, tools) => {
                  const desc = getSubagentStepDescription(step, tools);
                  setSubagentProgress((prev) =>
                    new Map(prev).set(toolCallId, desc),
                  );
                },
              });

              if (!isCurrentExecution()) return;
              // Clear live progress — the card will show the final result instead
              setSubagentProgress((prev) => {
                const next = new Map(prev);
                next.delete(toolCallId);
                return next;
              });
              writeSubagentSession({
                status: "completed",
                messages: latestSubagentMessages,
                summary: subagentResult.summary,
                tmpNotebookPath: subagentResult.tmpNotebookPath,
                subagentDevLogInstance: nextSubagentInstance,
                reconnectedFromToolCallId: reconnectSourceToolCallId,
                stepsUsed: subagentResult.stepsUsed,
                stoppedByLimit: subagentResult.stoppedByLimit,
              });
              const delegateOutput: DelegateToolOutput = {
                summary: subagentResult.summary,
                tmpNotebookPath: subagentResult.tmpNotebookPath,
                subagent: subagentType,
                reconnected: subagentResult.reconnected,
              };
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: delegateOutput,
              });

              addTimedToolOutput({
                tool: toolName,
                toolCallId,
                output: delegateOutput,
              });
            } catch (err) {
              if (!isCurrentExecution()) return;
              // Clear live progress on error too
              setSubagentProgress((prev) => {
                const next = new Map(prev);
                next.delete(toolCallId);
                return next;
              });
              const isCancelled =
                err instanceof DOMException && err.name === "AbortError";
              const errorText = isCancelled
                ? "cancelled_by_user"
                : err instanceof Error
                  ? err.message
                  : String(err);
              writeSubagentSession({
                status: isCancelled ? "cancelled" : "error",
                messages: latestSubagentMessages,
                errorText,
              });
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: isCancelled
                  ? CANCELLED_TOOL_RESULT
                  : { error: errorText },
              });
              addTimedToolOutput({
                state: "output-error",
                tool: toolName,
                toolCallId,
                errorText,
              });
            } finally {
              signal.removeEventListener("abort", abortSubagent);
              activeSubagentRunToolCallsRef.current.delete(toolCallId);
              setSubagentProgress((prev) => {
                if (!prev.has(toolCallId)) return prev;
                const next = new Map(prev);
                next.delete(toolCallId);
                return next;
              });
            }
            return;
          }

          // ---- all other tools: delegate to AssistantProvider -------------
          try {
            const rawResult = await assistant.executeToolCall(toolName, args, {
              modelRequestId,
              chatId: scheduledChatId,
              toolCallId,
              abortSignal: signal,
              executionAllowed: chainedCellExecutionAllowed,
            });
            const result = await prepareAgentToolResult(rawResult);
            if (!isCurrentExecution()) return;
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result,
            });
            addTimedToolOutput({ tool: toolName, toolCallId, output: result });
          } catch (err) {
            if (!isCurrentExecution()) return;
            const errorText = err instanceof Error ? err.message : String(err);
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result: { error: errorText },
            });
            addTimedToolOutput({
              state: "output-error",
              tool: toolName,
              toolCallId,
              errorText,
            });
          }
        })
        .catch((err) => {
          if (!isCurrentExecution()) return;
          const errorText = err instanceof Error ? err.message : String(err);
          trackedToolCallsRef.current.set(toolCallId, {
            status: "completed",
            result: { error: errorText },
          });
          addTimedToolOutput({
            state: "output-error",
            tool: toolName,
            toolCallId,
            errorText,
          });
        });
    },
    [
      assistant,
      modelInfo,
      selectedModel,
      modelSettingsMap,
      workspaceDirectory,
      activeNotebookPath,
      effectiveChatId,
      currentChat?.subagentSessions,
      clientPlatformOs,
      modelsWithAccess,
      addTimedToolOutput,
      markToolStarted,
      markToolEnded,
      setChats,
      prepareAgentToolResult,
      effectiveSettings.agent.execution.maxParallelReadOnlyCalls,
    ],
  );

  // Tool execution loop — fires whenever messages update with pending tool calls
  useEffect(() => {
    const modeUsesTools =
      isGoalContractDraftActive ||
      resolvedInteractionModeConfig.toolNames.length > 0 ||
      resolvedInteractionModeConfig.baseMode === "Explore" ||
      resolvedInteractionModeConfig.baseMode === "Agent";
    if (!modeUsesTools || !assistant) return;

    for (const msg of messages) {
      for (const part of msg.parts) {
        // Only handle tool parts (type is "tool-<toolName>")
        if (
          !part.type.startsWith("tool-") ||
          !("toolCallId" in part) ||
          !("state" in part)
        )
          continue;
        const inv = part as {
          toolCallId: string;
          state: string;
          input: Record<string, unknown>;
        };
        // Extract tool name from part type ("tool-execute_code" → "execute_code")
        const toolName = part.type.slice(5);

        if (inv.state !== "input-available") continue;

        // This phase-specific tool pauses for the proposal card; it is never executable.
        if (toolName === GOAL_CONTRACT_PROPOSAL_TOOL_NAME) continue;

        const toolNameTyped = toolName as OrionToolName;

        if (stopRequestedRef.current) {
          continue;
        }

        const trackedCall = trackedToolCallsRef.current.get(inv.toolCallId);
        if (trackedCall?.status === "completed") {
          if (!isLoading) {
            const now = Date.now();
            const shouldResubmit =
              !trackedCall.lastResubmittedAt ||
              now - trackedCall.lastResubmittedAt > 300;
            if (shouldResubmit) {
              addTimedToolOutput({
                tool: toolName,
                toolCallId: inv.toolCallId,
                output: trackedCall.result,
              });
              trackedToolCallsRef.current.set(inv.toolCallId, {
                ...trackedCall,
                lastResubmittedAt: now,
              });
            }
          }
          continue;
        }
        if (
          trackedCall?.status === "queued" ||
          trackedCall?.status === "running"
        ) {
          continue;
        }

        // Stop at the first unavailable dependency so later calls cannot
        // overtake it. A constructed tool set is not enough: server-only
        // tools must also wait for a verified Jupyter server connection.
        const missingDependency = getMissingToolRuntimeDependency(
          toolNameTyped,
          {
            serverReady: isToolServerReady,
            kernelStatus,
          },
        );
        if (missingDependency) {
          trackedToolCallsRef.current.set(inv.toolCallId, { status: "queued" });
          const pendingToolCall = {
            toolCallId: inv.toolCallId,
            toolName: toolNameTyped,
            args: inv.input,
          };
          const pendingCalls =
            missingDependency === "server"
              ? pendingServerToolCallsRef.current
              : pendingKernelToolCallsRef.current;
          if (
            !pendingCalls.some((call) => call.toolCallId === inv.toolCallId)
          ) {
            pendingCalls.push(pendingToolCall);
          }
          setShowKernelPrompt(true);
          return;
        }

        // Mark immediately to prevent duplicate scheduling across rerenders.
        // Timing begins only after the scheduler grants an execution slot.
        trackedToolCallsRef.current.set(inv.toolCallId, { status: "queued" });

        // Read-only modes block destructive bash commands before they execute.
        if (
          (isGoalContractDraftActive ||
            resolvedInteractionModeConfig.bashPolicy === "read_only") &&
          toolNameTyped === "bash"
        ) {
          const blockReason = isReadOnlyBashBlocked(
            (inv.input as { command?: string }).command ?? "",
          );
          if (blockReason) {
            trackedToolCallsRef.current.set(inv.toolCallId, {
              status: "completed",
              result: { error: blockReason },
            });
            addTimedToolOutput({
              state: "output-error",
              tool: toolNameTyped,
              toolCallId: inv.toolCallId,
              errorText: blockReason,
            });
            continue;
          }
        }

        // Gate on user approval for dangerous tools in "always_ask" mode
        if (needsApproval(toolNameTyped, toolApprovalMode)) {
          const approvalPromise = new Promise<"approve" | "reject">(
            (resolve) => {
              pendingApprovalToolCallsRef.current.set(inv.toolCallId, {
                toolCallId: inv.toolCallId,
                toolName: toolNameTyped,
                args: inv.input,
                resolve,
              });
              setPendingApprovalIds((prev) =>
                new Set(prev).add(inv.toolCallId),
              );
            },
          );

          enqueueToolExecution(
            inv.toolCallId,
            toolNameTyped,
            inv.input,
            approvalPromise,
          );

          continue;
        }

        enqueueToolExecution(inv.toolCallId, toolNameTyped, inv.input);
      }
    }
    // Reaching the end means no unresolved call is blocked on server or kernel readiness.
    setShowKernelPrompt(false);
  }, [
    messages,
    isGoalContractDraftActive,
    resolvedInteractionModeConfig.bashPolicy,
    resolvedInteractionModeConfig.baseMode,
    resolvedInteractionModeConfig.toolNames.length,
    chainedCellExecutionAllowed,
    assistant,
    kernelStatus,
    isToolServerReady,
    enqueueToolExecution,
    isLoading,
    toolApprovalMode,
    addTimedToolOutput,
  ]);

  // When the Jupyter server is verified, flush server-only tool calls that were
  // blocked due to no server connection. useChat resumes once all pending results are submitted.
  useEffect(() => {
    if (!isToolServerReady) return;
    if (pendingServerToolCallsRef.current.length === 0) return;

    const pending = pendingServerToolCallsRef.current.splice(0);
    if (stopRequestedRef.current) {
      if (pendingKernelToolCallsRef.current.length === 0)
        setShowKernelPrompt(false);
      return;
    }
    if (pendingKernelToolCallsRef.current.length === 0)
      setShowKernelPrompt(false);

    for (const { toolCallId, toolName, args } of pending) {
      enqueueToolExecution(toolCallId, toolName, args);
    }
  }, [isToolServerReady, enqueueToolExecution]);

  // When a kernel becomes available, flush any tool calls that were blocked
  // due to a missing kernel, then hide the prompt. useChat resumes automatically
  // once all pending tool results are submitted.
  useEffect(() => {
    if (kernelStatus !== "connected" || !isToolServerReady) return;
    if (pendingKernelToolCallsRef.current.length === 0) return;

    const pending = pendingKernelToolCallsRef.current.splice(0);
    if (stopRequestedRef.current) {
      if (pendingServerToolCallsRef.current.length === 0)
        setShowKernelPrompt(false);
      return;
    }
    if (pendingServerToolCallsRef.current.length === 0)
      setShowKernelPrompt(false);

    for (const { toolCallId, toolName, args } of pending) {
      enqueueToolExecution(toolCallId, toolName, args);
    }
  }, [kernelStatus, isToolServerReady, enqueueToolExecution]);

  // Load chats from local storage on mount
  useEffect(() => {
    const loadChats = async () => {
      try {
        await chatStorage.migrateFromSessionStorage();
        const storedChats = await chatStorage.getChats();
        let repairedAnyChat = false;
        const repairedChats = storedChats.map((chat) => {
          const deduplicated = deduplicateMessagesInChat(chat);
          const cancelled = cancelStalePendingToolsInChat(deduplicated.chat);
          repairedAnyChat ||= deduplicated.changed || cancelled.changed;
          return cancelled.chat;
        });
        if (repairedAnyChat) {
          await chatStorage.saveChats(repairedChats);
        }
        setChats(repairedChats);
        setIsChatsLoaded(true);
      } catch (error) {
        console.error("Failed to load chats:", error);
        setIsChatsLoaded(true);
      }
    };

    loadChats();
  }, []);

  /**
   * Periodically removes expired managed attachments from the active Jupyter
   * server and updates persisted references only after deletion succeeds.
   */
  useEffect(() => {
    if (!isChatsLoaded || !kernelService || !assistant?.toolsReady) return;

    const runCleanup = async (): Promise<void> => {
      if (attachmentCleanupInFlightRef.current) return;
      attachmentCleanupInFlightRef.current = true;
      try {
        const cleanup = await cleanupExpiredChatAttachments(
          kernelService.getContentsManager(),
          chatsRef.current,
        );
        if (cleanup.failedPaths.length > 0) {
          console.warn(
            "Failed to delete some expired managed chat attachments:",
            cleanup.failedPaths,
          );
        }
        if (cleanup.deletedPaths.length === 0) return;

        setChats((current) => {
          const marked = markManagedAttachmentReferencesUnavailable(
            current,
            cleanup.deletedPaths,
          );
          if (marked.changed) {
            chatsRef.current = marked.chats;
            return marked.chats;
          }
          return current;
        });
        setMessages((current) => {
          const marked = markManagedAttachmentMessageReferencesUnavailable(
            current,
            cleanup.deletedPaths,
          );
          return marked.changed ? marked.messages : current;
        });
      } catch (error) {
        console.warn("Managed chat attachment cleanup failed:", error);
      } finally {
        attachmentCleanupInFlightRef.current = false;
      }
    };

    return scheduleChatAttachmentCleanup(runCleanup);
  }, [assistant?.toolsReady, isChatsLoaded, kernelService, setMessages]);

  // Persist chats when they change
  useEffect(() => {
    if (!isChatsLoaded) return;

    const saveChats = async () => {
      try {
        await chatStorage.saveChats(chats);
      } catch (error) {
        console.error("Failed to save chats:", error);
      }
    };

    saveChats();
  }, [chats, isChatsLoaded]);

  // Track whether the active chat session changed (as opposed to a
  // content-only update from onFinish/setChats). Resets that would
  // disrupt an in-progress agentic flow — like clearing pending tool
  // calls or the kernel prompt — must only happen on real chat switches.
  const prevChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    const isRealChatSwitch = currentChatId !== prevChatIdRef.current;
    prevChatIdRef.current = currentChatId;

    const nextCheckpointRequestByMessageId = new Map<string, string>();
    for (const message of currentChat?.messages ?? []) {
      if (message.checkpointId) {
        nextCheckpointRequestByMessageId.set(message.id, message.checkpointId);
      }
    }
    setCheckpointRequestByMessageId(nextCheckpointRequestByMessageId);

    const messagesToLoad = (currentChat?.messages ?? []).map((message) => {
      const { checkpointId: _checkpointId, ...messageWithoutCheckpoint } =
        message;
      return {
        ...messageWithoutCheckpoint,
        metadata: normalizeChatMessageMetadata(message.metadata),
      };
    });

    if (!isRealChatSwitch) {
      return;
    }

    const existingTrackedToolCalls = new Map<string, ToolCallTracker>();
    for (const msg of messagesToLoad) {
      for (const part of msg.parts) {
        if (
          part.type.startsWith("tool-") &&
          "toolCallId" in part &&
          "state" in part
        ) {
          const inv = part as {
            toolCallId: string;
            state: string;
            output?: unknown;
          };
          const isTerminalState = TERMINAL_TOOL_STATES.has(inv.state);
          existingTrackedToolCalls.set(inv.toolCallId, {
            status: isTerminalState ? "completed" : "running",
            result: isTerminalState ? inv.output : undefined,
          });
        }
      }
    }
    trackedToolCallsRef.current = existingTrackedToolCalls;
    pendingKernelToolCallsRef.current = [];
    pendingServerToolCallsRef.current = [];
    setShowKernelPrompt(false);
    setActiveSubagentToolCallId(null);

    // Clear pending approvals on chat switch
    for (const [, pending] of pendingApprovalToolCallsRef.current) {
      pending.resolve("reject");
    }
    pendingApprovalToolCallsRef.current.clear();
    setPendingApprovalIds(new Set());
    cancelPendingAskQuestions();

    setMessages(messagesToLoad);
  }, [cancelPendingAskQuestions, currentChat, currentChatId, setMessages]);

  // Initialize with first chat or create one if none exist (layout effect so
  // `currentChatId` is set before paint — avoids sends without `chatId`).
  useLayoutEffect(() => {
    if (!isChatsLoaded) return;

    if (chats.length === 0) {
      createNewChat();
    } else if (!currentChatId) {
      const sessionChatId = loadCurrentChatIdFromSession();
      const sessionChatExists = chats.some((chat) => chat.id === sessionChatId);
      setCurrentChatId(sessionChatExists ? sessionChatId : chats[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatsLoaded, chats.length]);

  useEffect(() => {
    if (!isChatsLoaded) return;
    const currentChatExists = chats.some((chat) => chat.id === currentChatId);
    saveCurrentChatIdToSession(currentChatExists ? currentChatId : null);
  }, [chats, currentChatId, isChatsLoaded]);

  // ============================================================================
  // Chat management handlers
  // ============================================================================

  const createNewChat = () => {
    if (isAttachmentUploadActive) {
      toast.info("Wait for file uploads to finish before changing chats.");
      return;
    }

    // If currently processing, show confirmation dialog instead
    if (isInputLocked && !stopRequestedRef.current) {
      setStopConfirmAction({ type: "new-chat" });
      return;
    }

    setEmptyPromptLibraryResetCount((count) => count + 1);

    const isEmpty = !currentChat?.messages?.length;

    if (isEmpty && currentChatId) {
      // Current chat is empty: reset it instead of creating a duplicate
      setMessages([]);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId
            ? { ...chat, messages: [], updatedAt: new Date() }
            : chat,
        ),
      );
      setEditingState(null);
      setInput("");
      setDraftReferences([]);
      setDraftAttachments([]);
      setMessageQueue([]);
      textareaRef.current?.focus();
      return;
    }

    const newChat: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setDraftAttachments([]);
    setMessageQueue([]);
  };

  createNewChatRef.current = createNewChat;

  const setHistoryPopoverOpenRef = useRef(setIsHistoryPopoverOpen);
  setHistoryPopoverOpenRef.current = setIsHistoryPopoverOpen;

  /**
   * Desktop: Cmd/Ctrl+N creates a new chat; Cmd/Ctrl+Alt+H opens history globally.
   * Web: Cmd/Ctrl+Shift+O creates a new chat; Cmd/Ctrl+H opens history when the right
   * sidebar is focused (bare Cmd/Ctrl+N is reserved by Chrome).
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (isSubagentChatView || isGoalSupervisorView) return;

      const hasModKey =
        (event.metaKey && !event.ctrlKey) || (!event.metaKey && event.ctrlKey);
      if (!hasModKey) return;

      const isNewChatShortcut = isDesktopApp
        ? !event.shiftKey && !event.altKey && event.code === "KeyN"
        : event.shiftKey && !event.altKey && event.code === "KeyO";
      const isHistoryShortcut = isDesktopApp
        ? event.altKey && !event.shiftKey && event.code === "KeyH"
        : !event.shiftKey && !event.altKey && event.code === "KeyH";
      if (!isNewChatShortcut && !isHistoryShortcut) return;
      if (
        !shouldHandleChatShortcut(event, sidebarRootRef.current, isDesktopApp)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isNewChatShortcut) {
        createNewChatRef.current();
      } else {
        setHistoryPopoverOpenRef.current(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isDesktopApp, isGoalSupervisorView, isSubagentChatView]);

  const saveTitle = () => {
    if (!currentChatId || !editedTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId
          ? { ...chat, title: editedTitle.trim() }
          : chat,
      ),
    );
    setIsEditingTitle(false);
  };

  /** Generate a title suggestion that the user can review before saving. */
  const handleGenerateTitle = async () => {
    if (!currentChat) return;

    const requestId = titleGenerationRequestIdRef.current + 1;
    titleGenerationRequestIdRef.current = requestId;
    const sourceChatId = currentChat.id;
    const startingDraft = editedTitleRef.current;
    setIsGeneratingTitle(true);
    try {
      const newTitle = await generateChatTitle(
        currentChat.messages,
        currentChat.id,
      );
      if (!newTitle) {
        toast.error(
          "Add a user message and assistant response before generating a title.",
        );
        return;
      }
      if (
        titleGenerationRequestIdRef.current !== requestId ||
        effectiveChatIdRef.current !== sourceChatId ||
        editedTitleRef.current !== startingDraft
      ) {
        return;
      }
      setEditedTitle(newTitle);
    } finally {
      if (titleGenerationRequestIdRef.current === requestId) {
        setIsGeneratingTitle(false);
      }
    }
  };

  const handleRenameChat = (chatId: string) => {
    if (isAttachmentUploadActive && chatId !== currentChatId) {
      toast.info("Wait for file uploads to finish before changing chats.");
      return;
    }

    const chatToRename = chats.find((c) => c.id === chatId);
    if (chatToRename) {
      setCurrentChatId(chatId);
      setEditedTitle(chatToRename.title);
      setIsEditingTitle(true);
    }
  };

  /** Optimistically removes a chat from the UI while SQLite deletion completes. */
  const handleDeleteChat = async (chatId: string) => {
    if (isAttachmentUploadActive) {
      toast.info("Wait for file uploads to finish before deleting a chat.");
      return;
    }

    const chatToDelete = chats.find((chat) => chat.id === chatId);
    if (!chatToDelete) return;

    const previousCurrentChatId = currentChatId;
    const remainingChats = chats.filter((chat) => chat.id !== chatId);

    if (previousCurrentChatId === chatId) {
      setCurrentChatId(remainingChats[0]?.id ?? null);
    }
    setChats(remainingChats);

    try {
      await chatStorage.deleteChat(chatId);
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast.error("Failed to delete chat.");
      setChats((prev) => {
        if (prev.some((chat) => chat.id === chatId)) return prev;
        return [chatToDelete, ...prev].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        );
      });
      setCurrentChatId((prev) => prev ?? previousCurrentChatId);
    }
  };

  const handleHistorySelect = (chatId: string) => {
    if (isAttachmentUploadActive) {
      toast.info("Wait for file uploads to finish before changing chats.");
      return;
    }

    // If currently processing, show confirmation dialog instead
    if (isInputLocked && !stopRequestedRef.current) {
      setStopConfirmAction({ type: "switch-chat", targetChatId: chatId });
      return;
    }
    setCurrentChatId(chatId);
    setDraftReferences([]);
    setDraftAttachments([]);
  };

  /** Download the current chat transcript as a markdown file. */
  const handleExportTranscript = useCallback(() => {
    if (!currentChatId) return;

    const title = currentChat?.title?.trim() || "New Chat";
    try {
      downloadChatTranscriptMarkdown(title, visibleMessages);
      toast.success("Chat transcript exported.");
    } catch (error) {
      console.error("Failed to export chat transcript:", error);
      toast.error("Failed to export chat transcript.");
    }
  }, [currentChat?.title, currentChatId, visibleMessages]);

  /** Focus chatbox when requested after a menu action closes. */
  useEffect(() => {
    const handler = () => {
      setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener("focusChatbox", handler);
    return () => window.removeEventListener("focusChatbox", handler);
  }, []);

  // ============================================================================
  // Message editing handlers
  // ============================================================================

  const handleUserMessageClick = (message: UIMessage, index: number) => {
    if (isInputLocked) return;

    const textContent = getTextContent(message);
    setEditingState({
      messageId: message.id,
      originalContent: textContent,
      messageIndex: index,
    });
    setInput(textContent);
    setDraftReferences(parseChatMessageReferences(message.metadata));
    setDraftAttachments([]);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleCancelEdit = () => {
    if (editingState) {
      setInput("");
      setEditingState(null);
      setDraftReferences([]);
      setDraftAttachments([]);
    }
  };

  /** Clears the composer only after an in-place edit has been accepted. */
  const clearInPlaceEditComposerState = useCallback(() => {
    setInput("");
    setEditingState(null);
    setDraftReferences([]);
    setDraftAttachments([]);
    setEphemeralCostMessage(null);
  }, []);

  /** Creates a new chat branch through a completed assistant response without altering files. */
  const handleForkFromAssistantMessage = useCallback(
    (message: UIMessage, index: number): void => {
      if (
        message.role !== "assistant" ||
        isInputLocked ||
        isLoading ||
        isAttachmentUploadActive ||
        !currentChat
      )
        return;

      const sourceMessage = currentChat.messages[index];
      if (
        sourceMessage?.id !== message.id ||
        sourceMessage.role !== "assistant"
      )
        return;

      const now = new Date();
      const fork = createChatFork({
        sourceChat: currentChat,
        sourceMessageIndex: index,
        forkId: crypto.randomUUID(),
        now,
      });
      const forkMessages = toChatStateMessages(fork.messages);

      flushSync(() => {
        setChats((prev) => {
          const next = [fork, ...prev];
          chatsRef.current = next;
          return next;
        });
        setCurrentChatId(fork.id);
        setMessages(forkMessages);
        setActiveSubagentToolCallId(null);
        setDraftReferences([]);
        setDraftAttachments([]);
        setEphemeralCostMessage(null);
      });
      effectiveChatIdRef.current = fork.id;
      compactionSummaryRef.current = fork.compactionSummary;
      messagesRef.current = forkMessages;
      trackedToolCallsRef.current = new Map();
      pendingKernelToolCallsRef.current = [];
      pendingServerToolCallsRef.current = [];
      setShowKernelPrompt(false);
      toast.success("Chat fork created.");
    },
    [
      currentChat,
      isAttachmentUploadActive,
      isInputLocked,
      isLoading,
      setMessages,
      toChatStateMessages,
    ],
  );

  /** Replaces a user message in the current chat and drops every later turn before resend. */
  const executeInPlaceEdit = useCallback(
    async (
      action: PendingInPlaceEditAction,
      options: { restoreWorkspace: boolean },
    ): Promise<void> => {
      if (effectiveChatIdRef.current !== action.sourceChat.id) {
        toast.error("Return to the edited chat before resending this message.");
        return;
      }

      if (options.restoreWorkspace) {
        setIsRestoringEditWorkspace(true);
        try {
          await restoreWorkspaceForInPlaceEdit(action);
        } catch (error) {
          console.error("Failed to restore workspace before editing:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to restore files to this point.",
          );
          return;
        } finally {
          setIsRestoringEditWorkspace(false);
        }
      }

      const attachments = action.attachments;
      const references = [
        ...action.references,
        ...attachments.map((attachment) => attachment.reference),
      ].slice(-20);
      const imageFileParts = attachments
        .map((attachment) => attachment.imageFilePart)
        .filter((part): part is FileUIPart => part !== undefined);
      const messageText =
        action.editedText.trim().length > 0
          ? action.editedText
          : references.length > 0 || imageFileParts.length > 0
            ? "Attached external file(s)."
            : "";
      if (!messageText.trim() && imageFileParts.length === 0) return;

      let truncatedChat: Chat;
      try {
        truncatedChat = truncateChatForInPlaceEdit({
          sourceChat: action.sourceChat,
          sourceMessageIndex: action.sourceMessageIndex,
          now: new Date(),
        });
      } catch (error) {
        console.error("Failed to prepare edited chat history:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to prepare the edited chat history.",
        );
        return;
      }
      const retainedTarget = truncatedChat.messages.at(-1);
      if (!retainedTarget || retainedTarget.id !== action.messageId) {
        toast.error("The message you were editing is no longer available.");
        return;
      }

      const updatedChat: Chat = {
        ...truncatedChat,
        messages: [
          ...truncatedChat.messages.slice(0, -1),
          {
            ...retainedTarget,
            parts: [{ type: "text", text: messageText }],
            metadata: normalizeChatMessageMetadata(
              references.length > 0 ? { references } : undefined,
            ),
          },
        ],
      };
      const updatedMessages = toChatStateMessages(updatedChat.messages);
      const retainedMessageIds = new Set(
        updatedChat.messages.map((message) => message.id),
      );

      flushSync(() => {
        setChats((prev) => {
          const next = prev.map((chat) =>
            chat.id === action.sourceChat.id ? updatedChat : chat,
          );
          chatsRef.current = next;
          return next;
        });
        setMessages(updatedMessages);
        setActiveSubagentToolCallId(null);
        setPendingInPlaceEditAction(null);
        clearInPlaceEditComposerState();
        setCheckpointRequestByMessageId(
          (current) =>
            new Map(
              [...current].filter(
                ([messageId]) =>
                  messageId !== action.messageId &&
                  retainedMessageIds.has(messageId),
              ),
            ),
        );
        setSubagentProgress(new Map());
        toolTimingsRef.current = new Map();
        setToolTimings(new Map());
      });
      messagesRef.current = updatedMessages;
      compactionSummaryRef.current = updatedChat.compactionSummary;
      trackedToolCallsRef.current = new Map();
      pendingKernelToolCallsRef.current = [];
      pendingServerToolCallsRef.current = [];
      activeSubagentRunToolCallsRef.current.clear();
      setShowKernelPrompt(false);
      setMessageQueue([]);
      setEphemeralCostMessage(null);

      for (const [, pending] of pendingApprovalToolCallsRef.current) {
        pending.resolve("reject");
      }
      pendingApprovalToolCallsRef.current.clear();
      setPendingApprovalIds(new Set());
      cancelPendingAskQuestions();

      beginAgentTurn();
      const modelRequestId = crypto.randomUUID();
      modelRequestIdRef.current = modelRequestId;
      reactiveContextRetryRef.current = false;
      ensureResearchSessionActive(messageText);
      forcedSubagentForCurrentTurnRef.current = null;
      bodyRef.current = {
        ...bodyRef.current,
        chatId: action.sourceChat.id,
        modelRequestId,
      };

      await sendMessage(
        {
          text: messageText,
          messageId: action.messageId,
          ...(imageFileParts.length > 0 ? { files: imageFileParts } : {}),
          ...(references.length > 0 ? { metadata: { references } } : {}),
        },
        {
          body: buildChatRequestBody({
            chatId: action.sourceChat.id,
            modelRequestId,
          }),
        },
      );
    },
    [
      beginAgentTurn,
      buildChatRequestBody,
      cancelPendingAskQuestions,
      clearInPlaceEditComposerState,
      ensureResearchSessionActive,
      restoreWorkspaceForInPlaceEdit,
      sendMessage,
      setMessages,
      toChatStateMessages,
    ],
  );

  /** Opens the workspace choice only when the edited turn has active checkpoints to undo. */
  const requestOrExecuteInPlaceEdit = useCallback(
    (action: PendingInPlaceEditAction): void => {
      if (getInPlaceEditRestoreCheckpointIds(action).length > 0) {
        setPendingInPlaceEditAction(action);
        return;
      }

      void executeInPlaceEdit(action, { restoreWorkspace: false });
    },
    [executeInPlaceEdit, getInPlaceEditRestoreCheckpointIds],
  );

  // ============================================================================
  // Submission
  // ============================================================================

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const pendingSubmit = pendingSubmitRef.current;
      const userInput = pendingSubmit?.text ?? input;
      const attachmentsForSubmit =
        pendingSubmit?.attachments ?? draftAttachments;
      const referencesForSubmit = [
        ...(pendingSubmit?.references ?? draftReferences),
        ...attachmentsForSubmit.map((attachment) => attachment.reference),
      ].slice(-20);
      const imageFileParts = attachmentsForSubmit
        .map((attachment) => attachment.imageFilePart)
        .filter((part): part is FileUIPart => part !== undefined);
      const messageText =
        userInput.trim().length > 0
          ? userInput
          : referencesForSubmit.length > 0 || imageFileParts.length > 0
            ? "Attached external file(s)."
            : "";

      if (isInputLocked && !pendingSubmit) {
        return;
      }

      if (!messageText.trim() && imageFileParts.length === 0) return;
      unlockAgentCompleteAudio();
      if (effectiveSettings.chat.notifyOnAgentFinish) {
        void requestAgentCompleteNotificationPermission();
      }
      const modelRequestId = crypto.randomUUID();
      modelRequestIdRef.current = modelRequestId;
      beginAgentTurn();
      const activeGoal = goalSessionRef.current;
      if (activeGoal?.status === "active") {
        goalEvaluationAbortRef.current?.abort();
        goalEvaluationRunningRef.current = false;
        const workingGoal: GoalSession = {
          ...activeGoal,
          phase: "working",
          updatedAt: new Date().toISOString(),
        };
        goalSessionRef.current = workingGoal;
        setGoalSession(workingGoal);
        void persistGoalSession(workingGoal).catch((error) => {
          console.warn("Failed to persist steered goal session:", error);
        });
        goalContinuationRef.current = {
          contract: workingGoal.contract,
          contractVersion: workingGoal.contractVersion,
        };
        goalWorkerStartProgressRef.current = getTranscriptProgressCount(
          messagesRef.current,
        );
      }
      ensureResearchSessionActive(messageText);
      forcedSubagentForCurrentTurnRef.current = null;
      if (!pendingSubmit) {
        setInput("");
        setDraftReferences([]);
        setDraftAttachments([]);
      }
      setEphemeralCostMessage(null);

      // Measure the real server-prepared prompt, compact once when needed, then
      // remeasure. Per product policy, failures warn but do not block sending.
      const candidateMessages = appendDraftForPreflight(
        messagesRef.current,
        messageText,
        imageFileParts,
        referencesForSubmit,
      );
      try {
        let preflight = await requestContextPreflight(candidateMessages);
        setContextAnchor(preflight);
        if (
          shouldCompactBeforeSend(preflight) &&
          !compactionInFlightRef.current
        ) {
          const compacted = await runCompaction({
            measurementMessages: candidateMessages,
          });
          if (compacted) {
            preflight = await requestContextPreflight(candidateMessages);
            setContextAnchor(preflight);
            // Only warn about a real overflow. Still being above the compaction
            // threshold means the request fits — warning there is a false alarm.
            if (exceedsContextBudget(preflight)) {
              toast.warning(
                "The prepared prompt is still above the context budget; sending anyway.",
              );
            }
          } else {
            toast.warning(
              "Context compaction failed; sending the request anyway.",
            );
          }
        }
      } catch (error) {
        console.warn("Context preflight failed:", error);
        toast.warning(
          "Context measurement is unavailable; sending the request anyway.",
        );
      }

      // Update bodyRef with the request id before sending.
      bodyRef.current = {
        ...bodyRef.current,
        modelRequestId,
      };

      await sendMessage(
        {
          text: messageText,
          ...(imageFileParts.length > 0 ? { files: imageFileParts } : {}),
          ...(referencesForSubmit.length > 0
            ? { metadata: { references: referencesForSubmit } }
            : {}),
        },
        {
          body: buildChatRequestBody({ modelRequestId }),
        },
      );
    },
    [
      input,
      draftReferences,
      draftAttachments,
      sendMessage,
      isInputLocked,
      buildChatRequestBody,
      runCompaction,
      requestContextPreflight,
      beginAgentTurn,
      effectiveSettings.chat.notifyOnAgentFinish,
      ensureResearchSessionActive,
      setContextAnchor,
    ],
  );

  /** Custom submit that handles message editing (replaces messages after the edited one) */
  const customHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isAttachmentUploadActive) {
      toast.info("Wait for file uploads to finish before sending.");
      return;
    }

    const pendingSubmit = pendingSubmitRef.current;
    const effectiveInput = pendingSubmit?.text ?? input;
    const effectiveReferences = pendingSubmit?.references ?? draftReferences;
    const effectiveAttachments = pendingSubmit?.attachments ?? draftAttachments;
    const hasEffectiveDraftContent =
      effectiveInput.trim().length > 0 ||
      effectiveReferences.length > 0 ||
      effectiveAttachments.length > 0;
    const submitSlashCommand = detectActiveSlashCommand(effectiveInput, [
      ...subagentSlashCommands,
      ...skillSlashCommands,
    ]);
    const fromQueue = pendingSubmit !== null;

    const clearComposer = () => {
      if (!fromQueue) {
        setInput("");
        setDraftReferences([]);
        setDraftAttachments([]);
      }
    };

    // Editing always replaces the selected user turn before any slash-command
    // behavior is considered, so edited `/cost` or skill text remains chat content.
    if (editingState) {
      if (isInputLocked || !currentChat || !hasEffectiveDraftContent) return;

      const sourceMessage = currentChat.messages[editingState.messageIndex];
      if (
        sourceMessage?.id !== editingState.messageId ||
        sourceMessage.role !== "user"
      ) {
        toast.error("The message you were editing is no longer available.");
        return;
      }

      requestOrExecuteInPlaceEdit({
        sourceChat: currentChat,
        sourceMessageIndex: editingState.messageIndex,
        messageId: editingState.messageId,
        editedText: effectiveInput,
        references: effectiveReferences,
        attachments: effectiveAttachments,
      });
      return;
    }

    // During contract authoring every subsequent non-goal command message is
    // revision context for that same agent.
    if (goalContractDraftActiveRef.current) {
      if (submitSlashCommand === "goal") {
        toast.info(
          "Approve or revise the current goal contract before starting another goal.",
        );
        return;
      }
      await handleSubmit(e);
      return;
    }

    const goalSubmission = resolveGoalModeSubmission({
      input: effectiveInput,
      slashCommand: submitSlashCommand,
      interactionMode: resolvedInteractionModeConfig,
    });
    if (goalSubmission) {
      const { activation, objective } = goalSubmission;
      if (!objective) {
        toast.info(
          activation === "slash"
            ? "Add an objective after /goal."
            : "Describe the objective you want Agent to achieve.",
        );
        return;
      }
      const currentGoal = goalSessionRef.current;
      if (currentGoal?.status === "active") {
        if (activation === "slash") {
          toast.info("Stop the current goal before starting another one.");
          return;
        }
        await handleSubmit(e);
        return;
      }
      if (currentGoal?.status === "paused") {
        toast.info("Stop the current goal before starting another one.");
        return;
      }
      if (isInputLocked && !fromQueue) {
        setMessageQueue((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            text: effectiveInput,
            references: effectiveReferences,
            attachments: effectiveAttachments,
          },
        ]);
        clearComposer();
        return;
      }
      if (activation === "slash") {
        handleInteractionModeChange("Goal");
      }
      clearComposer();
      void startGoalContractDraft(
        objective,
        effectiveReferences,
        effectiveAttachments,
        activation,
      );
      return;
    }

    if (submitSlashCommand === "compact") {
      clearComposer();
      setEphemeralCostMessage(null);
      await runCompaction();
      return;
    }

    if (submitSlashCommand === "cost") {
      clearComposer();
      await showCostSummary();
      return;
    }

    if (submitSlashCommand === "report-bug") {
      clearComposer();
      setEphemeralCostMessage(null);
      window.open(ORION_GITHUB_ISSUES_URL, "_blank", "noopener,noreferrer");
      return;
    }

    // Handle subagent slash commands: /<name> <message>
    // Strip the command prefix and enforce delegation server-side via hidden metadata.
    if (submitSlashCommand?.startsWith("subagent:")) {
      const subagentName = submitSlashCommand.slice("subagent:".length);
      const commandLabel = `/${subagentName}`;
      const userMessage = effectiveInput
        .trimStart()
        .slice(commandLabel.length)
        .trimStart();

      const subagent = assistant?.availableSubagents.find(
        (s) => s.name === subagentName,
      );
      if (subagent && !isInputLocked) {
        beginAgentTurn();
        const modelRequestId = crypto.randomUUID();
        modelRequestIdRef.current = modelRequestId;
        const plainUserText =
          userMessage || `Run the ${subagent.name} sub-agent.`;

        clearComposer();
        setEphemeralCostMessage(null);
        forcedSubagentForCurrentTurnRef.current = subagent.name;
        bodyRef.current = { ...bodyRef.current, modelRequestId };

        await sendMessage(
          {
            text: plainUserText,
            metadata: {
              slashCommands: [
                {
                  label: commandLabel,
                  name: submitSlashCommand,
                  category: "subagent",
                },
              ],
            },
          },
          {
            body: buildChatRequestBody({
              modelRequestId,
              forcedSubagentName: subagent.name,
            }),
          },
        );
        return;
      }
    }

    // Handle skill slash commands anywhere in the message as skill mentions.
    const selectedSkills = extractSkillSlashCommands(
      effectiveInput,
      skillSlashCommands,
    );
    if (selectedSkills.skillNames.length > 0) {
      const allSelectedSkillsAvailable = selectedSkills.skillNames.every(
        (skillName) =>
          assistant?.availableSkills.some((skill) => skill.name === skillName),
      );
      if (allSelectedSkillsAvailable && !isInputLocked) {
        const activatesEdaProfile =
          selectedSkills.skillNames.includes("explore");
        const exploreModeConfig = interactionModeConfigs.find(
          (mode) => mode.id === "Explore",
        );
        beginAgentTurn();
        const modelRequestId = crypto.randomUUID();
        modelRequestIdRef.current = modelRequestId;
        const plainUserText =
          selectedSkills.message ||
          formatApplySkillsRequest(selectedSkills.skillNames);
        if (activatesEdaProfile) {
          activateResearchSession("slash", plainUserText, "eda", "deep");
          if (exploreModeConfig) {
            handleInteractionModeChange("Explore");
          }
        } else {
          ensureResearchSessionActive(plainUserText);
        }

        clearComposer();
        setEphemeralCostMessage(null);
        forcedSubagentForCurrentTurnRef.current = null;
        bodyRef.current = { ...bodyRef.current, modelRequestId };

        await sendMessage(
          {
            text: plainUserText,
            metadata: {
              slashCommands: selectedSkills.skillNames.map((skillName) => ({
                label: `/${skillName}`,
                name: `skill:${skillName}`,
                category: "skill" as const,
              })),
            },
          },
          {
            body: buildChatRequestBody({
              modelRequestId,
              forcedSkillNames: selectedSkills.skillNames,
              ...(activatesEdaProfile && exploreModeConfig
                ? {
                    interactionMode: exploreModeConfig.id,
                    interactionModeConfig: exploreModeConfig,
                    agentMode: true,
                    researchSession: researchSessionRef.current,
                  }
                : activatesEdaProfile
                  ? { researchSession: researchSessionRef.current }
                  : {}),
            }),
          },
        );
        return;
      }
    }

    if (isInputLocked && !fromQueue) {
      if (editingState || !hasEffectiveDraftContent) return;
      setMessageQueue((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          text: effectiveInput,
          references: effectiveReferences,
          attachments: effectiveAttachments,
        },
      ]);
      setInput("");
      setDraftReferences([]);
      setDraftAttachments([]);
      return;
    }

    handleSubmit(e);
  };

  customHandleSubmitRef.current = customHandleSubmit;

  /** Runs one fresh artifact-only review and applies its deterministic controller action. */
  const runCurrentGoalReview = useCallback(async (): Promise<void> => {
    const storedSession = goalSessionRef.current;
    const session =
      storedSession &&
      storedSession.maxReviews !== effectiveSettings.agent.goals.maxReviews
        ? {
            ...storedSession,
            maxReviews: effectiveSettings.agent.goals.maxReviews,
            updatedAt: new Date().toISOString(),
          }
        : storedSession;
    if (
      !session ||
      session.status !== "active" ||
      goalEvaluationRunningRef.current ||
      !effectiveChatId ||
      !kernelService ||
      !assistant
    ) {
      return;
    }

    goalEvaluationRunningRef.current = true;
    liveEvaluatorTranscriptRef.current = null;
    setLiveEvaluatorTranscript(null);
    const abortController = new AbortController();
    goalEvaluationAbortRef.current = abortController;
    let evaluationId: string | null = null;
    try {
      const scan = await scanGoalWorkspace({
        contents: kernelService.getContentsManager(),
        rootPath: workspaceDirectory ?? "",
        ignoreDirectoryNames: effectiveSettings.agent.filesystem.ignoreDirs,
      });
      const manifest = buildGoalArtifactManifest({
        baselineEntries: session.baselineEntries,
        currentEntries: scan.entries,
        deliverables: session.contract.deliverables,
        rootPath: workspaceDirectory ?? "",
        truncated: scan.truncated,
      });
      evaluationId = crypto.randomUUID();
      const started = startGoalEvaluation(session, {
        evaluationId,
        modelRequestId: crypto.randomUUID(),
        manifest,
      });
      goalSessionRef.current = started.session;
      setGoalSession(started.session);
      await persistGoalSession(started.session);
      if (!started.evaluation) {
        goalContinuationRef.current = undefined;
        toast.info(
          "Goal supervision stopped because its review budget was exhausted.",
        );
        return;
      }

      const { notebookPath, activeFilePath } =
        agentEditorContext(activeNotebookPath);
      const verdict = await runGoalEvaluation({
        contract: session.contract,
        manifest,
        modelId: session.evaluatorModelId,
        providerId: session.evaluatorProvider as ProviderId,
        modelSettings: session.evaluatorModelSettings,
        chatId: effectiveChatId,
        modelRequestId: started.evaluation.modelRequestId,
        workspaceDirectory: workspaceDirectory ?? undefined,
        rootDirectory: assistant.rootDirectory ?? undefined,
        notebookPath,
        activeFilePath,
        connectedNotebookPath: assistant.getCurrentConnectedNotebookPath(),
        agentRules: assistant.availableRules,
        serverInfo: assistant.serverInfo,
        jupyterServerIsLocal: assistant.jupyterServerIsLocal,
        clientPlatformOs,
        contextSettings: effectiveSettings.agent.context,
        abortSignal: abortController.signal,
        onMessagesChange: (nextMessages) => {
          liveEvaluatorTranscriptRef.current = nextMessages;
          setLiveEvaluatorTranscript(nextMessages);
        },
        executeToolCall: (toolName, input, signal) =>
          assistant.executeToolCall(toolName, input, {
            chatId: effectiveChatId,
            modelRequestId: started.evaluation?.modelRequestId,
            abortSignal: signal,
          }),
      });

      const latest = goalSessionRef.current;
      if (!latest || latest.id !== session.id) return;
      const finished = finishGoalEvaluation(latest, {
        evaluationId,
        contractVersion: started.evaluation.contractVersion,
        verdict,
        transcript: trimGoalEvaluatorTranscript(
          liveEvaluatorTranscriptRef.current ?? [],
        ),
      });
      goalSessionRef.current = finished.session;
      setGoalSession(finished.session);
      await persistGoalSession(finished.session);

      if (finished.action.type === "complete") {
        goalContinuationRef.current = undefined;
        toast.success("Goal reached.");
        return;
      }
      if (finished.action.type === "stop") {
        goalContinuationRef.current = undefined;
        toast.info(
          finished.action.reason === "blocked"
            ? "Goal supervision is blocked."
            : "Goal supervision stopped after repeated unchanged revisions.",
        );
        return;
      }
      if (finished.action.type === "discard_stale_verdict") {
        goalWorkerStartProgressRef.current = Math.max(
          0,
          getTranscriptProgressCount(messagesRef.current) - 1,
        );
        return;
      }

      goalContinuationRef.current = {
        contract: finished.session.contract,
        contractVersion: finished.session.contractVersion,
        instruction: finished.action.instruction,
      };
      bodyRef.current = {
        ...bodyRef.current,
        modelRequestId: finished.session.workerRequestId,
        goalContinuation: goalContinuationRef.current,
      };
      goalWorkerStartProgressRef.current = getTranscriptProgressCount(
        messagesRef.current,
      );
      beginAgentTurn();
      void sendMessage();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const current = goalSessionRef.current;
      if (!current || current.id !== session.id || !evaluationId) return;
      const recoverable = isRecoverableGoalEvaluationError(error);
      const failed = failGoalEvaluation(
        current,
        evaluationId,
        error instanceof Error ? error.message : String(error),
        {
          recoverable,
          transcript: trimGoalEvaluatorTranscript(
            liveEvaluatorTranscriptRef.current ?? [],
          ),
        },
      );
      goalContinuationRef.current = undefined;
      goalSessionRef.current = failed;
      setGoalSession(failed);
      await persistGoalSession(failed).catch(() => undefined);
      if (recoverable) {
        toast.warning(
          "The goal review could not finish; supervision is paused and can be resumed.",
        );
      } else {
        toast.error("Goal evaluation failed; supervision has stopped.");
      }
    } finally {
      goalEvaluationRunningRef.current = false;
      liveEvaluatorTranscriptRef.current = null;
      setLiveEvaluatorTranscript(null);
      if (goalEvaluationAbortRef.current === abortController) {
        goalEvaluationAbortRef.current = null;
      }
    }
  }, [
    activeNotebookPath,
    assistant,
    beginAgentTurn,
    clientPlatformOs,
    effectiveChatId,
    effectiveSettings.agent.context,
    effectiveSettings.agent.filesystem.ignoreDirs,
    effectiveSettings.agent.goals.maxReviews,
    kernelService,
    sendMessage,
    workspaceDirectory,
  ]);

  /** Starts the visible contract-author agent without creating a GoalSession yet. */
  async function startGoalContractDraft(
    objective: string,
    references: ResolvedChatReference[],
    attachments: ChatDraftAttachment[],
    activation: GoalModeActivation,
  ): Promise<void> {
    const restoreComposer = () => {
      setInput(activation === "slash" ? `/goal ${objective}` : objective);
      setDraftReferences(references);
      setDraftAttachments(attachments);
    };
    if (!effectiveChatId) {
      restoreComposer();
      toast.error("Create or select a chat before starting a goal.");
      return;
    }
    const contractModel = getModel(selectedModel);
    if (!contractModel?.provider || contractModel.isAccessible === false) {
      restoreComposer();
      toast.error(
        "Select a model with an available credential before starting a goal.",
      );
      return;
    }
    if (contractModel.supportsToolCalling === false) {
      restoreComposer();
      toast.error(
        "Select a model that supports tools before starting a supervised goal.",
      );
      return;
    }

    goalContractDraftActiveRef.current = true;
    setIsGoalContractDraftActive(true);
    setGoalContractErrors(new Map());
    deactivateResearchSession();
    const modelRequestId = crypto.randomUUID();
    modelRequestIdRef.current = modelRequestId;
    bodyRef.current = {
      ...bodyRef.current,
      modelRequestId,
      goalContractDraft: true,
      goalContinuation: undefined,
    };

    const effectiveReferences = [
      ...references,
      ...attachments.map((attachment) => attachment.reference),
    ].slice(-20);
    const imageFileParts = attachments
      .map((attachment) => attachment.imageFilePart)
      .filter((part): part is FileUIPart => part !== undefined);

    try {
      beginAgentTurn();
      await sendMessage(
        {
          text: objective,
          ...(imageFileParts.length > 0 ? { files: imageFileParts } : {}),
          metadata: {
            goalContractDraft: true,
            ...(activation === "slash"
              ? {
                  slashCommands: [
                    {
                      label: "/goal",
                      name: "goal",
                      category: "builtin" as const,
                    },
                  ],
                }
              : {}),
            ...(effectiveReferences.length > 0
              ? { references: effectiveReferences }
              : {}),
          },
        },
        {
          body: buildChatRequestBody({
            modelRequestId,
            goalContractDraft: true,
            goalContinuation: undefined,
          }),
        },
      );
    } catch (error) {
      restoreComposer();
      goalContractDraftActiveRef.current = false;
      setIsGoalContractDraftActive(false);
      bodyRef.current = { ...bodyRef.current, goalContractDraft: undefined };
      console.error("Failed to start goal contract authoring:", error);
      toast.error(
        "The goal contract author could not start. Your prompt was restored so you can retry.",
      );
    }
  }

  /** Saves proposal decisions immediately because they do not receive a normal onFinish callback. */
  const persistGoalProposalMessages = useCallback(
    async (nextMessages: UIMessage[]): Promise<void> => {
      const chatId = effectiveChatIdRef.current;
      if (!chatId) throw new Error("The active chat is unavailable.");
      const existingChat = chatsRef.current.find((chat) => chat.id === chatId);
      if (!existingChat) throw new Error("The active chat could not be found.");

      const persistedMessages = attachPersistedToolTimings(
        stripAllRasterData(nextMessages),
        toolTimingsRef.current,
      );
      const chatMessages: ChatMessage[] = persistedMessages.map((message) => {
        const existing = existingChat.messages.find(
          (candidate) => candidate.id === message.id,
        );
        return {
          ...stripSessionOnlyFileParts(message),
          metadata: normalizeChatMessageMetadata(message.metadata),
          timestamp: existing?.timestamp ?? new Date(),
          modelUsed: existing?.modelUsed ?? selectedModel,
          checkpointId: existing?.checkpointId,
        };
      });
      const nextChat: Chat = {
        ...existingChat,
        messages: chatMessages,
        updatedAt: new Date(),
      };

      await chatStorage.saveChat(nextChat);
      const nextChats = chatsRef.current.map((chat) =>
        chat.id === chatId ? nextChat : chat,
      );
      flushSync(() => {
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        chatsRef.current = nextChats;
        setChats(nextChats);
      });
    },
    [selectedModel, setMessages],
  );

  /** Completes a proposal tool with a durable user decision. */
  const commitGoalProposalDecision = useCallback(
    async (
      toolCallId: string,
      result:
        | { status: "revision_requested" }
        | { status: "approved"; goalSessionId: string },
    ): Promise<UIMessage[]> => {
      const currentMessages = messagesRef.current;
      const nextMessages = applyGoalContractProposalResult(
        currentMessages,
        toolCallId,
        result,
      );
      if (nextMessages === currentMessages) {
        throw new Error("This goal contract proposal is no longer available.");
      }
      await persistGoalProposalMessages(nextMessages);
      trackedToolCallsRef.current.set(toolCallId, {
        status: "completed",
        result,
      });
      markToolEnded(toolCallId);
      return nextMessages;
    },
    [markToolEnded, persistGoalProposalMessages],
  );

  /** Records a proposal-specific error without dismissing the actionable card. */
  const setGoalProposalError = useCallback(
    (toolCallId: string, message?: string) => {
      setGoalContractErrors((current) => {
        const next = new Map(current);
        if (message) next.set(toolCallId, message);
        else next.delete(toolCallId);
        return next;
      });
    },
    [],
  );

  /** Leaves contract-author mode active and focuses the composer for revision instructions. */
  const handleRequestGoalContractRevision = useCallback(
    async (toolCallId: string): Promise<void> => {
      if (goalContractActionIds.has(toolCallId)) return;
      const proposalPart = findGoalContractProposalPart(
        messagesRef.current,
        toolCallId,
      );
      if (!proposalPart || proposalPart.state !== "input-available") {
        setGoalProposalError(
          toolCallId,
          "This proposal is no longer awaiting a decision.",
        );
        return;
      }

      setGoalContractActionIds((current) => new Set(current).add(toolCallId));
      setGoalProposalError(toolCallId);
      try {
        await commitGoalProposalDecision(toolCallId, {
          status: "revision_requested",
        });
        goalContractDraftActiveRef.current = true;
        setIsGoalContractDraftActive(true);
        bodyRef.current = {
          ...bodyRef.current,
          goalContractDraft: true,
          goalContinuation: undefined,
        };
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      } catch (error) {
        console.error("Failed to save goal contract revision request:", error);
        setGoalProposalError(
          toolCallId,
          "The revision request could not be saved. Please try again.",
        );
      } finally {
        setGoalContractActionIds((current) => {
          const next = new Set(current);
          next.delete(toolCallId);
          return next;
        });
      }
    },
    [commitGoalProposalDecision, goalContractActionIds, setGoalProposalError],
  );

  /** Approves the exact proposed contract, captures a baseline, and starts the worker. */
  const handleApproveGoalContract = useCallback(
    async (toolCallId: string): Promise<void> => {
      if (goalContractActionIds.has(toolCallId)) return;
      const proposal = findGoalContractProposal(
        messagesRef.current,
        toolCallId,
      );
      if (
        !proposal ||
        !("state" in proposal.part) ||
        proposal.part.state !== "input-available"
      ) {
        setGoalProposalError(
          toolCallId,
          "This proposal is no longer awaiting a decision.",
        );
        return;
      }
      const parsedContract = GoalContractSchema.safeParse(proposal.contract);
      if (!parsedContract.success) {
        setGoalProposalError(
          toolCallId,
          "The proposed contract is invalid and cannot be approved.",
        );
        return;
      }
      if (!effectiveChatId || !kernelService) {
        setGoalProposalError(
          toolCallId,
          "Connect to Jupyter before approving and starting this supervised goal.",
        );
        return;
      }
      const evaluator = getModel(goalEvaluatorModel);
      if (!evaluator?.provider || evaluator.isAccessible === false) {
        setGoalProposalError(
          toolCallId,
          "Choose an evaluator model with an available credential before approving this goal.",
        );
        return;
      }
      if (evaluator.supportsToolCalling === false) {
        setGoalProposalError(
          toolCallId,
          "Choose an evaluator model that supports tools before approving this goal.",
        );
        return;
      }
      const currentGoal = goalSessionRef.current;
      if (
        currentGoal?.status === "active" ||
        currentGoal?.status === "paused"
      ) {
        setGoalProposalError(
          toolCallId,
          "Another supervised goal is already active in this chat.",
        );
        return;
      }

      setGoalContractActionIds((current) => new Set(current).add(toolCallId));
      setGoalProposalError(toolCallId);
      setIsGoalStarting(true);
      const abortController = new AbortController();
      goalStartAbortRef.current = abortController;
      let created: GoalSession | null = null;
      let stage: "baseline" | "session" | "decision" | "worker" = "baseline";

      try {
        const baseline = await scanGoalWorkspace({
          contents: kernelService.getContentsManager(),
          rootPath: workspaceDirectory ?? "",
          ignoreDirectoryNames: effectiveSettings.agent.filesystem.ignoreDirs,
        });
        if (abortController.signal.aborted) {
          throw new DOMException("Goal approval was cancelled.", "AbortError");
        }

        stage = "session";
        const workerRequestId = crypto.randomUUID();
        const evaluatorSelection = formatModelSelectionKey(
          evaluator.provider,
          evaluator.value,
        );
        created = createGoalSession({
          id: crypto.randomUUID(),
          chatId: effectiveChatId,
          contract: parsedContract.data,
          evaluatorModel: evaluatorSelection,
          evaluatorProvider: evaluator.provider,
          evaluatorModelId: resolveCatalogModelIdForApi(
            evaluatorSelection,
            evaluator,
          ),
          evaluatorModelSettings:
            modelSettingsMap[evaluatorSelection] ??
            modelSettingsMap[selectedModel] ??
            modelSettingsMap[evaluator.value],
          maxReviews: effectiveSettings.agent.goals.maxReviews,
          baselineEntries: baseline.entries,
          workerRequestId,
        });
        await persistGoalSession(created);

        stage = "decision";
        const approvedMessages = await commitGoalProposalDecision(toolCallId, {
          status: "approved",
          goalSessionId: created.id,
        });

        goalSessionRef.current = created;
        setGoalSession(created);
        goalContractDraftActiveRef.current = false;
        setIsGoalContractDraftActive(false);
        deactivateResearchSession();
        goalContinuationRef.current = {
          contract: created.contract,
          contractVersion: created.contractVersion,
        };
        modelRequestIdRef.current = workerRequestId;
        bodyRef.current = {
          ...bodyRef.current,
          modelRequestId: workerRequestId,
          goalContractDraft: undefined,
          goalContinuation: goalContinuationRef.current,
        };
        goalWorkerStartProgressRef.current =
          getTranscriptProgressCount(approvedMessages);

        stage = "worker";
        beginAgentTurn();
        await sendMessage();
        toast.success("Goal approved and started.");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (created && stage === "decision") {
          await removeGoalSession(created.chatId).catch((rollbackError) => {
            console.error(
              "Failed to roll back an uncommitted goal session:",
              rollbackError,
            );
          });
        }
        console.error(`Failed during goal approval stage ${stage}:`, error);
        const message =
          stage === "baseline"
            ? "The workspace baseline could not be captured. Check the Jupyter connection and retry."
            : stage === "session"
              ? "The goal session could not be saved. Please retry approval."
              : stage === "decision"
                ? "Approval could not be saved. The proposal remains available to retry."
                : "The contract was approved, but the worker could not start. Send a message to continue the goal.";
        setGoalProposalError(toolCallId, message);
      } finally {
        if (goalStartAbortRef.current === abortController) {
          goalStartAbortRef.current = null;
        }
        setIsGoalStarting(false);
        setGoalContractActionIds((current) => {
          const next = new Set(current);
          next.delete(toolCallId);
          return next;
        });
      }
    },
    [
      beginAgentTurn,
      commitGoalProposalDecision,
      deactivateResearchSession,
      effectiveChatId,
      effectiveSettings.agent.filesystem.ignoreDirs,
      effectiveSettings.agent.goals.maxReviews,
      getModel,
      goalContractActionIds,
      goalEvaluatorModel,
      kernelService,
      modelSettingsMap,
      selectedModel,
      sendMessage,
      setGoalProposalError,
      workspaceDirectory,
    ],
  );

  /** Pauses the loop while preserving its contract, review history, and current worker turn. */
  const handlePauseGoalSupervision = useCallback(() => {
    const current = goalSessionRef.current;
    if (!current || current.status !== "active") return;
    goalEvaluationAbortRef.current?.abort();
    goalContinuationRef.current = undefined;
    const paused = pauseGoalSupervision(current);
    goalSessionRef.current = paused;
    setGoalSession(paused);
    void persistGoalSession(paused);
    toast.info("Goal paused. The current worker was not interrupted.");
  }, []);

  /** Permanently ends the loop after confirmation while preserving its history. */
  const handleEndGoalSupervision = useCallback(() => {
    const current = goalSessionRef.current;
    if (!current || (current.status !== "active" && current.status !== "paused")) return;
    goalEvaluationAbortRef.current?.abort();
    goalContinuationRef.current = undefined;
    const ended = endGoalSupervision(current);
    goalSessionRef.current = ended;
    setGoalSession(ended);
    void persistGoalSession(ended);
    toast.info("Goal ended. Its contract and review history remain available.");
  }, []);

  /** Resumes a paused goal by reviewing the current saved artifacts. */
  const handleResumeGoalSupervision = useCallback(() => {
    const current = goalSessionRef.current;
    if (!current || current.status !== "paused") return;
    const resumed: GoalSession = {
      ...current,
      status: "active",
      phase: "working",
      updatedAt: new Date().toISOString(),
    };
    goalSessionRef.current = resumed;
    setGoalSession(resumed);
    void persistGoalSession(resumed);
    goalWorkerStartProgressRef.current = Math.max(
      0,
      getTranscriptProgressCount(messagesRef.current) - 1,
    );
  }, []);

  /** Starts evaluation after the current worker and any queued steering fully finish. */
  useEffect(() => {
    const session = goalSessionRef.current;
    const startProgress = goalWorkerStartProgressRef.current;
    if (
      !session ||
      session.status !== "active" ||
      session.phase !== "working" ||
      startProgress == null ||
      isAgentTurnActive ||
      status !== "ready" ||
      messageQueue.length > 0 ||
      queueProcessingRef.current ||
      getTranscriptProgressCount(messages) <= startProgress
    ) {
      return;
    }
    const latest = messages.at(-1);
    if (!latest || latest.role !== "assistant") return;
    if (latest.parts.some(isPendingToolPart)) return;
    goalWorkerStartProgressRef.current = null;
    const timer = window.setTimeout(() => void runCurrentGoalReview(), 0);
    return () => window.clearTimeout(timer);
  }, [
    isAgentTurnActive,
    messageQueue.length,
    messages,
    runCurrentGoalReview,
    status,
  ]);

  /** Sends the next queued message once the agent finishes its full turn. */
  useEffect(() => {
    const wasActive = prevAgentTurnActiveRef.current;
    prevAgentTurnActiveRef.current = isAgentTurnActive;

    if (
      !wasActive ||
      isAgentTurnActive ||
      messageQueue.length === 0 ||
      queueProcessingRef.current
    ) {
      if (wasActive && !isAgentTurnActive) {
        void markCurrentEditCheckpointStatus(
          stopRequestedRef.current ? "interrupted" : "completed",
        );
        notifyAgentTurnComplete({
          wasActive,
          isActive: isAgentTurnActive,
          userStopped: stopRequestedRef.current,
          queuedMessageCount: messageQueue.length,
          chatTitle: currentChat?.title,
          settings: {
            notifyOnAgentFinish: effectiveSettings.chat.notifyOnAgentFinish,
            playSoundOnAgentFinish:
              effectiveSettings.chat.playSoundOnAgentFinish,
          },
        });
      }
      return;
    }

    // Let useChat's automatic-continuation effect run before releasing the queue.
    // It marks automaticContinuationPendingRef during the brief ready-state gap.
    const releaseTimer = window.setTimeout(() => {
      if (
        automaticContinuationPendingRef.current ||
        prevAgentTurnActiveRef.current ||
        queueProcessingRef.current
      ) {
        return;
      }

      void markCurrentEditCheckpointStatus(
        stopRequestedRef.current ? "interrupted" : "completed",
      );

      const [next, ...rest] = messageQueue;
      if (!next) return;
      queueProcessingRef.current = true;
      setMessageQueue(rest);
      pendingSubmitRef.current = {
        text: next.text,
        references: next.references,
        attachments: next.attachments,
      };

      void Promise.resolve(
        customHandleSubmitRef.current({
          preventDefault: () => {},
        } as React.FormEvent<HTMLFormElement>),
      ).finally(() => {
        pendingSubmitRef.current = null;
        queueProcessingRef.current = false;
      });
    }, 0);

    return () => window.clearTimeout(releaseTimer);
  }, [
    currentChat?.title,
    effectiveSettings.chat.notifyOnAgentFinish,
    effectiveSettings.chat.playSoundOnAgentFinish,
    isAgentTurnActive,
    markCurrentEditCheckpointStatus,
    messageQueue,
    notifyAgentTurnComplete,
  ]);

  const handleStopGeneration = useCallback(() => {
    if (isGoalStarting) {
      goalStartAbortRef.current?.abort();
      goalStartAbortRef.current = null;
      setIsGoalStarting(false);
      return;
    }
    const cancelledAt = Date.now();
    const getCancelledOutput = (toolCallId: string): CancelledToolOutput => {
      const startedAt = toolTimingsRef.current.get(toolCallId)?.startedAt;
      return {
        error: "cancelled_by_user",
        ...(startedAt !== undefined
          ? { durationMs: Math.max(0, cancelledAt - startedAt) }
          : {}),
      };
    };
    const onCancelledToolCall = (
      toolCallId: string,
      result: CancelledToolOutput,
    ) => {
      trackedToolCallsRef.current.set(toolCallId, {
        status: "completed",
        result,
      });
      markToolEnded(toolCallId);
    };
    const buildCancelledChatForStorage = (chat: Chat): Chat | null => {
      let sessionChanged = false;
      let nextSubagentSessions = chat.subagentSessions;
      if (cancellingSubagentToolCallIds.size > 0 && chat.subagentSessions) {
        const timestamp = new Date(cancelledAt);
        const sessionsCopy = { ...chat.subagentSessions };
        for (const toolCallId of cancellingSubagentToolCallIds) {
          const session = sessionsCopy[toolCallId];
          if (!session || session.status !== "running") continue;
          sessionChanged = true;
          sessionsCopy[toolCallId] = {
            ...session,
            status: "cancelled",
            errorText: "cancelled_by_user",
            updatedAt: timestamp,
          };
        }
        if (sessionChanged) nextSubagentSessions = sessionsCopy;
      }

      const sourceMessages =
        messagesRef.current.length > 0 ? messagesRef.current : chat.messages;
      let result = cancelPendingToolParts(sourceMessages, {
        getCancelledOutput,
        onCancelledToolCall,
      });
      if (!result.changed && sourceMessages !== chat.messages) {
        result = cancelPendingToolParts(chat.messages, {
          getCancelledOutput,
          onCancelledToolCall,
        });
      }

      if (!result.changed && !sessionChanged) return null;

      const messagesForStorage: ChatMessage[] = result.changed
        ? result.messages.map((message) => {
            const messageForStorage = stripSessionOnlyFileParts(message);
            const existing = chat.messages.find(
              (candidate) => candidate.id === message.id,
            );
            return {
              ...messageForStorage,
              metadata: normalizeChatMessageMetadata(message.metadata),
              timestamp: existing?.timestamp ?? new Date(cancelledAt),
              modelUsed: existing?.modelUsed ?? selectedModel,
              checkpointId: existing?.checkpointId,
            };
          })
        : chat.messages;

      return {
        ...chat,
        messages: messagesForStorage,
        subagentSessions: nextSubagentSessions,
        updatedAt: new Date(cancelledAt),
      };
    };

    stopRequestedRef.current = true;
    automaticContinuationPendingRef.current = false;
    const outgoingScheduler = toolExecutionSchedulerRef.current;
    toolExecutionAbortControllerRef.current?.abort();
    if (outgoingScheduler) {
      toolExecutionHandoffRef.current = outgoingScheduler.drain();
    }
    toolExecutionAbortControllerRef.current = null;
    toolExecutionSchedulerRef.current = null;
    toolExecutionTurnIdRef.current += 1;
    setStopRequestActive(true);
    lastStopRequestedAtRef.current = cancelledAt;
    setMessageQueue([]);
    pendingSubmitRef.current = null;
    queueProcessingRef.current = false;
    const cancellingSubagentToolCallIds = new Set(
      activeSubagentRunToolCallsRef.current,
    );
    const cancellingChatId = effectiveChatIdRef.current;

    setMessages((prev) => {
      const result = cancelPendingToolParts(prev, {
        getCancelledOutput,
        onCancelledToolCall,
      });
      return result.changed ? result.messages : prev;
    });

    if (cancellingChatId) {
      const cancelledChatForStorage = chats.find(
        (chat) => chat.id === cancellingChatId,
      );
      const nextCancelledChat = cancelledChatForStorage
        ? buildCancelledChatForStorage(cancelledChatForStorage)
        : null;

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== cancellingChatId) return chat;
          return (
            nextCancelledChat ?? buildCancelledChatForStorage(chat) ?? chat
          );
        }),
      );
      if (nextCancelledChat) {
        void chatStorage.saveChat(nextCancelledChat).catch((error) => {
          console.error("Failed to persist stopped chat:", error);
        });
      }
    }

    pendingKernelToolCallsRef.current = [];
    pendingServerToolCallsRef.current = [];
    setShowKernelPrompt(false);

    // Reject all pending approval tool calls
    for (const [, pending] of pendingApprovalToolCallsRef.current) {
      pending.resolve("reject");
    }
    pendingApprovalToolCallsRef.current.clear();
    setPendingApprovalIds(new Set());
    cancelPendingAskQuestions();

    deactivateResearchSession();

    stop();
  }, [
    cancelPendingAskQuestions,
    chats,
    deactivateResearchSession,
    isGoalStarting,
    markToolEnded,
    selectedModel,
    setChats,
    setMessages,
    stop,
  ]);

  /** Handles confirmation from the stop-and-switch dialog */
  const handleStopConfirm = useCallback(() => {
    if (isAttachmentUploadActive) {
      toast.info("Wait for file uploads to finish before changing chats.");
      return;
    }

    const action = stopConfirmAction;
    if (!action) return;

    handleStopGeneration();
    setStopConfirmAction(null);

    // Use microtask to let stop propagate before switching
    queueMicrotask(() => {
      if (action.type === "new-chat") {
        setEmptyPromptLibraryResetCount((count) => count + 1);

        // Inline createNewChat logic (without the isInputLocked guard)
        const isEmpty = !currentChat?.messages?.length;
        if (isEmpty && currentChatId) {
          setMessages([]);
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === currentChatId
                ? { ...chat, messages: [], updatedAt: new Date() }
                : chat,
            ),
          );
          setEditingState(null);
          setInput("");
          setDraftReferences([]);
          setDraftAttachments([]);
          textareaRef.current?.focus();
        } else {
          const newChat: Chat = {
            id: Date.now().toString(),
            title: "New Chat",
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          setChats((prev) => [newChat, ...prev]);
          setCurrentChatId(newChat.id);
          setDraftAttachments([]);
        }
      } else if (action.type === "switch-chat") {
        setCurrentChatId(action.targetChatId);
        setDraftReferences([]);
        setDraftAttachments([]);
      }
    });
  }, [
    stopConfirmAction,
    handleStopGeneration,
    currentChat,
    currentChatId,
    isAttachmentUploadActive,
    setMessages,
    setChats,
    setInput,
  ]);

  // ============================================================================
  // Render
  // ============================================================================

  const businessChatPanelClassName = isBusinessExperience
    ? "flex min-h-0 flex-1 flex-col border-l border-border/60"
    : "flex min-h-0 flex-1 flex-col";

  if (!isChatsLoaded) {
    return (
      <ChatSurface ref={sidebarRootRef} className={className} {...props}>
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
            Loading chat history...
          </div>
        </div>
      </ChatSurface>
    );
  }

  return (
    <ChatSurface ref={sidebarRootRef} className={className} {...props}>
      {isGoalSupervisorView && goalSession ? (
        <>
          <div
            className={
              isBusinessExperience
                ? "sticky top-0 z-10 min-h-14 bg-sidebar pb-3 pl-3 pr-2 pt-2"
                : "sticky top-0 z-10 h-14 bg-sidebar"
            }
          >
            <div className="flex h-full min-w-0 items-center gap-2 px-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setGoalSupervisorOpen(false)}
                aria-label="Back to main chat"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                <button
                  type="button"
                  className="corner-squircle rounded-md px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setGoalSupervisorOpen(false)}
                >
                  Main chat
                </button>
                <span className="text-muted-foreground/50">/</span>
                <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-semibold">
                  <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">Goal supervisor</span>
                </div>
              </div>
            </div>
          </div>

          <div className={businessChatPanelClassName}>
            <ChatBody
              key={`goal-supervisor-${goalSession.id}`}
              viewKey={`goal:${goalSession.id}`}
              messages={goalSupervisorMessages}
              error={undefined}
              isLoading={
                goalSession.status === "active" &&
                goalSession.phase === "evaluating"
              }
              isAgentTurnActive={
                goalSession.status === "active" &&
                goalSession.phase === "evaluating"
              }
              groupConsecutiveAssistantActivity
              toolTimings={toolTimings}
              onUserMessageClick={() => {}}
              canEditUserMessages={false}
              editingState={null}
            />

            <ChatTextbox
              input=""
              handleInputChange={() => {}}
              handleSubmit={(event) => event.preventDefault()}
              onStop={() => {}}
              isLoading={false}
              interactionMode={interactionMode}
              interactionModes={interactionModeConfigs}
              selectedModel={selectedModel}
              editingState={null}
              textareaRef={textareaRef}
              onInteractionModeChange={handleInteractionModeChange}
              onModelChange={handleModelChange}
              onCancelEdit={() => {}}
              models={modelsWithAccess}
              pinnedModelIds={pinnedModelIds}
              onReorderPinned={handleReorderPinned}
              onOpenModelsSettings={() => openWithTab("models")}
              onOpenInteractionModesSettings={() =>
                openWithTab("agent", "modes")
              }
              onOpenProvidersSettings={handleOpenProvidersSettings}
              onConfigureProvider={handleConfigureProvider}
              selectedModelProvider={modelInfo?.provider}
              modelSettings={modelSettingsMap[selectedModel] ?? {}}
              onModelSettingsChange={(settings) =>
                handleModelSettingsChange(selectedModel, settings)
              }
              hasMessages={goalSupervisorMessages.length > 0}
              readOnly
              readOnlyPlaceholder="Goal supervisor is read-only"
              onOpenSlashDefinition={handleOpenSlashDefinition}
              activeRules={assistant?.availableRules ?? []}
              onOpenRule={handleOpenRule}
            />
          </div>
        </>
      ) : isSubagentChatView ? (
        <>
          <div
            className={
              isBusinessExperience
                ? "sticky top-0 z-10 min-h-14 bg-sidebar pb-3 pl-3 pr-2 pt-2"
                : "sticky top-0 z-10 h-14 bg-sidebar"
            }
          >
            <div className="flex h-full min-w-0 items-center gap-2 px-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setActiveSubagentToolCallId(null)}
                aria-label="Back to main chat"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                <button
                  type="button"
                  className="corner-squircle rounded-md px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setActiveSubagentToolCallId(null)}
                >
                  Main chat
                </button>
                <span className="text-muted-foreground/50">/</span>
                <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-semibold">
                  <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {activeSubagentSession.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={businessChatPanelClassName}>
            <ChatBody
              key={`subagent-chat-body-${activeSubagentToolCallId}`}
              viewKey={`subagent:${activeSubagentToolCallId}`}
              messages={activeSubagentSession.messages}
              error={undefined}
              isLoading={activeSubagentSession.status === "running"}
              isAgentTurnActive={activeSubagentSession.status === "running"}
              groupConsecutiveAssistantActivity
              toolTimings={toolTimings}
              onUserMessageClick={() => {}}
              canEditUserMessages={false}
              editingState={null}
            />

            <ChatTextbox
              input=""
              handleInputChange={() => {}}
              handleSubmit={(event) => event.preventDefault()}
              onStop={() => {}}
              isLoading={false}
              interactionMode={interactionMode}
              interactionModes={interactionModeConfigs}
              selectedModel={selectedModel}
              editingState={null}
              textareaRef={textareaRef}
              onInteractionModeChange={handleInteractionModeChange}
              onModelChange={handleModelChange}
              onCancelEdit={() => {}}
              models={modelsWithAccess}
              pinnedModelIds={pinnedModelIds}
              onReorderPinned={handleReorderPinned}
              onOpenModelsSettings={() => openWithTab("models")}
              onOpenInteractionModesSettings={() =>
                openWithTab("agent", "modes")
              }
              onOpenProvidersSettings={handleOpenProvidersSettings}
              onConfigureProvider={handleConfigureProvider}
              selectedModelProvider={modelInfo?.provider}
              modelSettings={modelSettingsMap[selectedModel] ?? {}}
              onModelSettingsChange={(settings) =>
                handleModelSettingsChange(selectedModel, settings)
              }
              hasMessages={activeSubagentSession.messages.length > 0}
              readOnly
              readOnlyPlaceholder="Sub-agent chat is read-only"
              onOpenSlashDefinition={handleOpenSlashDefinition}
              activeRules={assistant?.availableRules ?? []}
              onOpenRule={handleOpenRule}
            />
          </div>
        </>
      ) : (
        <>
          <ChatToolbar
            currentChat={currentChat}
            isEditingTitle={isEditingTitle}
            editedTitle={editedTitle}
            chats={chats}
            currentChatId={currentChatId}
            showWindowDragHandle={isBusinessExperience && isDesktopApp}
            relaxedSpacing={isBusinessExperience}
            isHistoryPopoverOpen={isHistoryPopoverOpen}
            onHistoryPopoverOpenChange={setIsHistoryPopoverOpen}
            onTitleChange={setEditedTitle}
            onTitleSave={saveTitle}
            onTitleCancel={() => setIsEditingTitle(false)}
            onTitleGenerate={handleGenerateTitle}
            isGeneratingTitle={isGeneratingTitle}
            onNewChat={createNewChat}
            onHistorySelect={handleHistorySelect}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onExportTranscript={handleExportTranscript}
          />

          <div className={businessChatPanelClassName}>
            <ChatBody
              key="main-chat-body"
              viewKey={`main:${effectiveChatId ?? "no-chat"}`}
              messages={visibleMessages}
              compactionSummary={currentChat?.compactionSummary}
              error={error}
              isLoading={isLoading}
              isAgentTurnActive={isAgentTurnActive}
              onUserMessageClick={handleUserMessageClick}
              editingState={editingState}
              showKernelPrompt={showKernelPrompt}
              onOpenKernelDropdown={onOpenKernelDropdown}
              onDismissKernelPrompt={() => setShowKernelPrompt(false)}
              pendingApprovalIds={pendingApprovalIds}
              onApprove={handleApprove}
              onReject={handleReject}
              askQuestion={askQuestionHandlers}
              onApproveGoalContract={handleApproveGoalContract}
              onRequestGoalContractRevision={handleRequestGoalContractRevision}
              goalContractActionIds={goalContractActionIds}
              goalContractErrors={goalContractErrors}
              goalEvaluatorPicker={goalEvaluatorPicker}
              toolApprovalMode={toolApprovalMode}
              onToolApprovalModeChange={handleToolApprovalModeChange}
              subagentProgress={subagentProgress}
              subagentReportPaths={subagentReportPaths}
              toolTimings={toolTimings}
              groupConsecutiveAssistantActivity
              onOpenSubagentChat={setActiveSubagentToolCallId}
              onOpenSubagentReport={handleOpenSubagentReport}
              costSummaryByMessageId={costSummaryByMessageId}
              onDismissCostSummary={dismissCostSummary}
              onRefreshCostSummary={refreshCostSummary}
              isRefreshingCostSummary={isRefreshingCostSummary}
              checkpointStatuses={checkpointStatuses}
              checkpointRequestByMessageId={checkpointRequestByMessageId}
              onRestoreCheckpoint={handleRestoreCheckpoint}
              onForkFromAssistantMessage={handleForkFromAssistantMessage}
              emptyPromptCategories={
                isBusinessExperience ? BUSINESS_PROMPT_CATEGORIES : undefined
              }
              emptyPromptLibraryKey={`${effectiveChatId ?? "no-chat"}:${emptyPromptLibraryResetCount}`}
            />

            {goalSession && !isGoalContractDraftActive && (
              <GoalStatusBar
                session={goalSession}
                onOpen={() => setGoalSupervisorOpen(true)}
                onResume={handleResumeGoalSupervision}
                onPause={handlePauseGoalSupervision}
                onEnd={handleEndGoalSupervision}
              />
            )}

            <ChatTextbox
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={customHandleSubmit}
              onStop={handleStopGeneration}
              isLoading={isInputLocked}
              interactionMode={interactionMode}
              interactionModes={interactionModeConfigs}
              selectedModel={selectedModel}
              editingState={editingState}
              textareaRef={textareaRef}
              onInteractionModeChange={handleInteractionModeChange}
              onModelChange={handleModelChange}
              onCancelEdit={handleCancelEdit}
              models={modelsWithAccess}
              pinnedModelIds={pinnedModelIds}
              onReorderPinned={handleReorderPinned}
              onOpenModelsSettings={() => openWithTab("models")}
              onOpenInteractionModesSettings={() =>
                openWithTab("agent", "modes")
              }
              onOpenProvidersSettings={handleOpenProvidersSettings}
              onConfigureProvider={handleConfigureProvider}
              selectedModelProvider={modelInfo?.provider}
              modelSettings={modelSettingsMap[selectedModel] ?? {}}
              onModelSettingsChange={(settings) =>
                handleModelSettingsChange(selectedModel, settings)
              }
              activeSlashCommand={activeSlashCommand}
              extraSlashCommands={[
                ...subagentSlashCommands,
                ...skillSlashCommands,
              ]}
              onOpenSlashDefinition={handleOpenSlashDefinition}
              onImmediateSlashCommand={handleImmediateSlashCommand}
              onRefreshSlashCommands={
                assistant ? handleRefreshSlashCommands : undefined
              }
              hasMessages={visibleMessages.length > 0}
              contextUsage={contextUsage}
              contextUsagePhase={contextUsagePhase}
              simpleContextUsage={isBusinessExperience}
              onCompact={runCompaction}
              isOverContextBudget={isCompacting}
              referenceOptions={referenceOptions}
              references={draftReferences}
              onReferencesChange={setDraftReferences}
              attachments={draftAttachments}
              onAttachmentsChange={setDraftAttachments}
              onAttachFiles={handleAttachFiles}
              isAttachmentUploadActive={isAttachmentUploadActive}
              onReferenceSearch={refreshReferenceSearch}
              disabledReferenceTabs={disabledReferenceTabs}
              queuedMessages={messageQueue}
              onRemoveQueuedMessage={handleRemoveQueuedMessage}
              activeRules={assistant?.availableRules ?? []}
              onOpenRule={handleOpenRule}
            />
          </div>
        </>
      )}

      <AutoRunConfirmDialog
        open={autoRunConfirmOpen}
        onOpenChange={setAutoRunConfirmOpen}
        onConfirm={handleAutoRunConfirm}
      />

      <AlertDialog
        open={stopConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setStopConfirmAction(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop current generation?</AlertDialogTitle>
            <AlertDialogDescription>
              A response is still being generated. Switching will stop it. Are
              you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setStopConfirmAction(null)}
              shortcut="Escape"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleStopConfirm} shortcut="Enter">
              Stop and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingInPlaceEditAction !== null}
        onOpenChange={(open) => {
          if (!open && !isRestoringEditWorkspace) {
            setPendingInPlaceEditAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update chat from here?</AlertDialogTitle>
            <AlertDialogDescription>
              Orion can keep your current files as they are while replacing this
              message and clearing later chat context, or restore recorded agent
              file changes to this point first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AlertDialogCancel
              onClick={() => setPendingInPlaceEditAction(null)}
              disabled={isRestoringEditWorkspace}
              shortcut="Escape"
              className="mt-0 w-full"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingInPlaceEditAction;
                if (!action) return;
                void executeInPlaceEdit(action, { restoreWorkspace: false });
              }}
              disabled={isRestoringEditWorkspace}
              shortcut="Enter"
              className="w-full"
            >
              Keep current workspace
            </AlertDialogAction>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const action = pendingInPlaceEditAction;
                if (!action) return;
                void executeInPlaceEdit(action, { restoreWorkspace: true });
              }}
              disabled={!kernelService || isRestoringEditWorkspace}
              title={
                kernelService
                  ? undefined
                  : "Connect to a Jupyter server before restoring files."
              }
              className="w-full sm:col-span-2"
            >
              Restore files to this point
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </ChatSurface>
  );
}
