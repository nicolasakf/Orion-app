"use client";

import * as React from "react";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  type UIMessage,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { OpenAI, Claude, Gemini, Grok, Ollama, LmStudio } from "@lobehub/icons";
import { Bot, ChevronLeft, FileText } from "lucide-react";

import { toast } from "sonner";
import {
  chatStorage,
  getTextContent,
  type Chat,
  type ChatMessage,
  type CompactionSummary,
  type SubagentSession,
  type SubagentSessionStatus,
} from "@/lib/chat/chat-storage";
import {
  formatCellReferenceLabel,
  parseChatMessageReferences,
  type ChatReferenceOption,
  type ChatReferenceType,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import { compactConversation } from "@/lib/agent/context-manager";
import { buildWirePayload } from "@/lib/agent/context-optimizer";
import {
  estimateMessageTokens,
  HARD_CAP_TOKENS,
  COMPACTION_AUTO_THRESHOLD,
} from "@/lib/agent/token-budget";
import { useAssistantChatOptional } from "@/lib/agent";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { NO_DEPENDENCY_TOOLS, SERVER_ONLY_TOOLS } from "@/lib/agent/tool-schemas";
import { isReadOnlyBashBlocked } from "@/lib/agent/read-only-bash-guard";
import { needsApproval } from "@/lib/agent/tool-approval";
import type { ProviderCredential, ToolApprovalMode } from "@/lib/settings/schema";
import type { KernelStatus, NotebookType } from "@/lib/types";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useKernelVariables } from "@/hooks/use-kernel-variables";
import { usePlatformOs } from "@/hooks/use-platform";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { AutoRunConfirmDialog } from "@/components/common/auto-run-confirm-dialog";
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

import { runSubagent } from "@/lib/agent/subagents/client-runner";
import { getSubagentStepDescription } from "./tool-invocation-helpers";
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";
import type { ModelCatalogEntry } from "@/lib/agent/model-catalog";
import { ChatToolbar } from "./chat-toolbar";
import { ChatBody } from "./chat-body";
import { ChatTextbox, type ReferenceTab } from "./chat-textbox";
import { useContextEstimate } from "./context-usage-pill";
import {
  ORION_GITHUB_ISSUES_URL,
  SLASH_COMMANDS,
  buildSkillSlashCommands,
  buildSubagentSlashCommands,
} from "./slash-commands";
import { resolveSubagentExecutionModel } from "./subagent-model-resolution";
import type { EditingState, InteractionMode, LLM, ModelSettings, ModelSettingsMap } from "./types";
import type { SettingsTab } from "@/components/settings-dialog/types";

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
        else if (data.type === "text-delta" && data.textDelta) out += data.textDelta;
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

function notebookCellSourcePreview(cell: NotebookType["cells"][number], maxLength = 900): string {
  const source = cell.source.join("");
  return truncatePreview(source || "(empty cell)", maxLength);
}

function notebookCellDescription(cell: NotebookType["cells"][number], index: number): string {
  const firstLine = cell.source.join("").trim().split(/\r?\n/).find(Boolean);
  const sourceSummary = firstLine ? truncatePreview(firstLine, 160) : "empty cell";
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
  lineEnd: number
): string {
  return `${fileNameFromPath(path)}:${formatLineRange(lineStart, lineEnd)}`;
}

/** Formats the chip label for selected source lines inside a notebook cell. */
function formatCellSelectionReferenceLabel(
  cellIndex: number,
  lineStart: number,
  lineEnd: number
): string {
  return `${formatCellReferenceLabel([cellIndex])}:${formatLineRange(lineStart, lineEnd)}`;
}

function makeReference(
  type: ChatReferenceType,
  label: string,
  locator: ResolvedChatReference["locator"],
  preview: string,
  toolHint?: string
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

type NotebookCellMentionEventDetail = {
  notebookPath?: unknown;
  cellIndex?: unknown;
  preview?: unknown;
};

type EditorSelectionAttachEventDetail = {
  path?: unknown;
  lineStart?: unknown;
  lineEnd?: unknown;
  selectedText?: unknown;
  notebookCellIndex?: unknown;
};

/** Preserve skill invocation metadata in the request body while omitting client-only fields. */
function serializeAvailableSkills(
  skills: Array<{ name: string; description: string; disableModelInvocation?: boolean }>
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
  }>
): SerializedSubagent[] {
  return subagents.map((subagent) => ({
    name: subagent.name,
    label: subagent.label,
    description: subagent.description,
    ...(subagent.options ? { options: subagent.options } : {}),
  }));
}

interface DelegateToolOutput {
  summary: string;
  tmpNotebookPath: string;
  subagent: string;
  reconnected: boolean;
}

/** Catalog id used when `orion:selectedModel` is unset and as fallback if the chosen id is not in `/api/models`. */
const DEFAULT_SELECTED_CHAT_MODEL_ID = "gemini-3-flash-preview";

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
  const { effectiveSettings, isHydrated, setUserSettings } = useOrionSettings();
  const { openWithTab } = useOpenSettings();

  // State management
  const [chats, setChats] = useState<Chat[]>([]);
  const [isChatsLoaded, setIsChatsLoaded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const SESSION_MODE_KEY = "orion:interactionMode";
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(SESSION_MODE_KEY);
      if (stored === "Agent" || stored === "Ask" || stored === "Edit") return stored;
    }
    return "Agent";
  });
  const SESSION_MODEL_KEY = "orion:selectedModel";
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(SESSION_MODEL_KEY);
      if (stored) return stored;
    }
    return DEFAULT_SELECTED_CHAT_MODEL_ID;
  });
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [models, setModels] = useState<LLM[]>([]);
  const [modelRows, setModelRows] = useState<ModelCatalogEntry[]>([]);
  const [modelsCatalogLoaded, setModelsCatalogLoaded] = useState(false);
  const settingsUrlHandledRef = useRef(false);
  const [autoRunConfirmOpen, setAutoRunConfirmOpen] = useState(false);
  const [showKernelPrompt, setShowKernelPrompt] = useState(false);
  const [activeSubagentToolCallId, setActiveSubagentToolCallId] = useState<string | null>(null);
  const [toolApprovalMode, setToolApprovalMode] = useState<ToolApprovalMode>(
    effectiveSettings.chat.toolApprovalMode
  );
  const [modelSettingsMap, setModelSettingsMap] = useState<ModelSettingsMap>({});
  const [isCompacting, setIsCompacting] = useState(false);

  /** Ref holding the latest compaction summary for the transport interceptor. */
  const compactionSummaryRef = useRef<CompactionSummary | undefined>(undefined);
  /** Prevents concurrent compaction runs. */
  const compactionInFlightRef = useRef(false);

  /** Map provider ID to its icon component */
  const getProviderIcon = (provider: SupportedProvider) => {
    switch (provider) {
      case "openai": return OpenAI;
      case "anthropic": return Claude;
      case "google": return Gemini;
      case "xai": return Grok;
      case "ollama": return Ollama;
      case "lmstudio": return LmStudio;
      default: return undefined;
    }
  };

  // Fetch available models from the static OSS catalog.
  useEffect(() => {
    setModelsCatalogLoaded(false);

    const fetchModels = async () => {
      try {
        const response = await fetch("/api/models");

        if (!response.ok) {
          throw new Error("Failed to fetch models");
        }

        const json = await response.json() as { models: ModelCatalogEntry[] };
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
            icon: getProviderIcon(provider),
            contextWindow: m.context_window ?? undefined,
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
    if (typeof window === "undefined" || !modelsCatalogLoaded || settingsUrlHandledRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("settings");
    const validTabs: SettingsTab[] = ["appearance", "models", "providers", "storage"];
    if (tab && validTabs.includes(tab as SettingsTab)) {
      settingsUrlHandledRef.current = true;
      openWithTab(tab as SettingsTab);
    }
  }, [modelsCatalogLoaded, openWithTab]);

  const getModel = (modelName: string) => {
    return models.find((model) => model.value === modelName);
  };

  /** When user has no pinned models, use models with pinned_by_default from DB. */
  const pinnedModelIds = React.useMemo(() => {
    const userPinned = effectiveSettings.chat.pinnedModelIds ?? [];
    if (userPinned.length > 0) return userPinned;
    return modelRows
      .filter((m) => m.pinned_by_default)
      .map((m) => m.model_id);
  }, [effectiveSettings.chat.pinnedModelIds, modelRows]);

  /**
   * Models enriched with reactive `isAccessible` based on local credentials.
   * Recomputes whenever credentials change (e.g. user adds/removes a provider key).
   */
  const modelsWithAccess = React.useMemo<LLM[]>(() => {
    const credentials = effectiveSettings.providers?.credentials ?? {};
    const hasByokForProvider = (providerId: string) => !!credentials[providerId];

    return models.map((m) => {
      return { ...m, isAccessible: hasByokForProvider(m.provider) };
    });
  }, [models, effectiveSettings.providers?.credentials]);

  useEffect(() => {
    if (!isHydrated) return;
    setToolApprovalMode(effectiveSettings.chat.toolApprovalMode);
  }, [effectiveSettings.chat.toolApprovalMode, isHydrated]);

  useEffect(() => {
    if (models.length === 0) return;
    if (getModel(selectedModel)) return;

    const preferred = models.find((m) => m.value === DEFAULT_SELECTED_CHAT_MODEL_ID);
    const fallbackModel = preferred?.value ?? models[0]?.value;
    if (!fallbackModel) return;

    setSelectedModel(fallbackModel);
    sessionStorage.setItem(SESSION_MODEL_KEY, fallbackModel);
  }, [models, selectedModel]);

  const handleInteractionModeChange = useCallback(
    (nextMode: InteractionMode) => {
      setInteractionMode(nextMode);
      sessionStorage.setItem(SESSION_MODE_KEY, nextMode);
    },
    []
  );

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
    [setUserSettings]
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setSelectedModel(nextModel);
      sessionStorage.setItem(SESSION_MODEL_KEY, nextModel);
    },
    []
  );

  /** Opens settings directly on Providers for BYOK setup. */
  const handleOpenProvidersSettings = useCallback(() => {
    openWithTab("providers");
  }, [openWithTab]);

  /** Opens Settings on Providers so the user can add local credentials. */
  const handleConfigureProvider = useCallback(() => {
    openWithTab("providers");
  }, [openWithTab]);

  /** Update settings for a specific model */
  const handleModelSettingsChange = useCallback(
    (modelId: string, settings: ModelSettings) => {
      setModelSettingsMap((prev) => ({ ...prev, [modelId]: settings }));
    },
    []
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

  /** Change tool approval mode and persist to settings */
  const handleToolApprovalModeChange = useCallback(
    (mode: ToolApprovalMode) => {
      if (mode === "auto_run") {
        setAutoRunConfirmOpen(true);
        return;
      }
      setToolApprovalMode(mode);
      void setUserSettings((current) => ({
        ...current,
        chat: {
          ...current.chat,
          toolApprovalMode: mode,
        },
      }));
    },
    [setUserSettings]
  );

  /** Apply auto_run mode after user confirms the warning dialog */
  const handleAutoRunConfirm = useCallback(() => {
    setToolApprovalMode("auto_run");
    void setUserSettings((current) => ({
      ...current,
      chat: {
        ...current.chat,
        toolApprovalMode: "auto_run",
      },
    }));
  }, [setUserSettings]);

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

  /** Generate and persist a short title for a newly created chat */
  const generateAndSetTitle = async (
    chatMessages: ChatMessage[],
    chatId: string
  ) => {
    const userMessage = chatMessages.find((m) => m.role === "user");
    const assistantMessage = chatMessages.find((m) => m.role === "assistant");

    if (!userMessage || !assistantMessage) return;

    const userText = getTextContent(userMessage);
    const assistantText = getTextContent(assistantMessage);

    const fallbackTitle =
      (userText.slice(0, 45) || "New Chat") +
      (userText.length > 45 ? "..." : "");

    const titlePrompt = `Based on the following conversation, create a short, descriptive title for the chat session. The title must be in the same language as the user's message. Return only the title, no other text. The title must be 45 characters or less.\n\nUser: ${userText}\nAssistant: ${assistantText}\n\nTitle:`;

    const titleGenerationModel = getModel("gemma-4-31b-it");
    if (!titleGenerationModel) {
      console.error("Title generation model not found");
      return;
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

      const rawResponse = await response.text();
      let newTitle = parseTitleFromChatStreamResponse(rawResponse);

      newTitle = newTitle.replace(/^"|"$/g, "").trim();

      if (newTitle) {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? { ...chat, title: newTitle.slice(0, 45) }
              : chat
          )
        );
      } else {
        throw new Error("Parsed title is empty");
      }
    } catch (error) {
      console.error("Error generating chat title:", error);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: fallbackTitle } : chat
        )
      );
    }
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
  const isSubagentChatView = !!activeSubagentToolCallId && !!activeSubagentSession;
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

  const handleOpenSubagentReport = useCallback(
    (path: string) => {
      if (!path) return;
      onOpenFile?.({ name: fileNameFromPath(path), path });
    },
    [onOpenFile]
  );

  /** Opens a skill/subagent Jupyter definition path selected from the slash command palette. */
  const handleOpenSlashDefinition = useCallback(
    (path: string) => {
      if (!path) return;
      onOpenFile?.({ name: fileNameFromPath(path), path });
    },
    [onOpenFile]
  );

  /** Latest id for persisting chat in `useChat` `onFinish` (avoids stale/null `currentChatId`). */
  const effectiveChatIdRef = useRef<string | null>(null);
  effectiveChatIdRef.current = effectiveChatId;

  // AI Assistant context (optional — may not be in provider)
  const assistant = useAssistantChatOptional();
  const clientPlatformOs = usePlatformOs();
  const { variables: kernelVariables, refresh: refreshKernelVariables } =
    useKernelVariables(kernelService ?? null);
  const [selectedNotebookCellIndex, setSelectedNotebookCellIndex] = useState<number | null>(null);
  const [workspaceReferenceEntries, setWorkspaceReferenceEntries] = useState<ReferenceWorkspaceEntry[]>([]);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState("");
  const [referenceSearchTab, setReferenceSearchTab] = useState<ReferenceTab>("all");
  const referenceSearchSeqRef = useRef(0);

  useEffect(() => {
    const handleNotebookSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ selectedCellIndex?: unknown }>).detail;
      const nextIndex = detail?.selectedCellIndex;
      setSelectedNotebookCellIndex(
        typeof nextIndex === "number" && Number.isInteger(nextIndex) ? nextIndex : null
      );
    };

    window.addEventListener("notebookMinimapSelectionUpdate", handleNotebookSelection);
    return () => {
      window.removeEventListener("notebookMinimapSelectionUpdate", handleNotebookSelection);
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

            while (queuedFolders.length > 0 && visitedFolders.size < 20 && matches.length < 80) {
              const folderPath = queuedFolders.shift() ?? "";
              if (visitedFolders.has(folderPath)) continue;
              visitedFolders.add(folderPath);

              const entries = await assistant.listDirectoryEntries(folderPath);
              for (const entry of entries) {
                const haystack = `${entry.name} ${entry.path} ${entry.type}`.toLowerCase();
                if (!normalizedQuery || haystack.includes(normalizedQuery)) {
                  matches.push(entry);
                }

                if (normalizedQuery && entry.type === "folder" && queuedFolders.length < 40) {
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
    [assistant, refreshKernelVariables, workspaceDirectory]
  );

  const referenceOptions = React.useMemo<ChatReferenceOption[]>(() => {
    const options: ChatReferenceOption[] = [];
    const addOption = (reference: ResolvedChatReference, description: string) => {
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
      addOption(
        makeReference(
          "file",
          fileNameFromPath(activeNotebookPath),
          { type: "file", path: activeNotebookPath },
          `Active file: ${activeNotebookPath}`,
          isNotebook
            ? `Use use_notebook with notebookPath="${activeNotebookPath}", then read_notebook or read_cell for exact cells.`
            : `Use read_file with path="${activeNotebookPath}" for exact contents.`
        ),
        "Active file"
      );
    }

    if (notebookPath && selectedNotebookCellIndex !== null) {
      addOption(
        makeReference(
          "cell",
          formatCellReferenceLabel([selectedNotebookCellIndex]),
          { type: "cell", notebookPath, cellIndices: [selectedNotebookCellIndex] },
          `Selected notebook cell ${selectedNotebookCellIndex} in ${notebookPath}.`,
          `Use use_notebook with notebookPath="${notebookPath}", then read_cell for cell index ${selectedNotebookCellIndex}.`
        ),
        "Selected cell"
      );
    }

    const shouldIncludeNotebookCells =
      notebookPath !== undefined &&
      activeNotebook !== null &&
      activeNotebook !== undefined &&
      (referenceSearchTab === "cells" || referenceSearchQuery.length > 0);
    if (shouldIncludeNotebookCells) {
      activeNotebook.cells.forEach((cell, index) => {
        addOption(
          makeReference(
            "cell",
            formatCellReferenceLabel([index]),
            { type: "cell", notebookPath, cellIndices: [index] },
            notebookCellSourcePreview(cell),
            `Use use_notebook with notebookPath="${notebookPath}", then read_cell for cell index ${index}.`
          ),
          notebookCellDescription(cell, index)
        );
      });
    }

    const recentFileOptions = recentFiles
      .filter((file) => file.path && file.path !== activeNotebookPath)
      .slice(0, 2);
    for (const file of recentFileOptions) {
      addOption(
        makeReference(
          "file",
          file.name || fileNameFromPath(file.path),
          { type: "file", path: file.path },
          `Recent file: ${file.path}`,
          file.path.endsWith(".ipynb")
            ? `Use use_notebook with notebookPath="${file.path}", then read_notebook or read_cell for exact cells.`
            : `Use read_file with path="${file.path}" for exact contents.`
        ),
        "Recent file"
      );
    }

    if (workspaceDirectory !== null && workspaceDirectory !== undefined) {
      const label = workspaceDirectory || "/";
      addOption(
        makeReference(
          "folder",
          label,
          { type: "folder", path: workspaceDirectory },
          `Current workspace folder: ${label}`,
          "Use file and shell tools relative to this workspace when exact contents are needed."
        ),
        "Current workspace"
      );
    }

    for (const entry of workspaceReferenceEntries) {
      addOption(
        makeReference(
          entry.type,
          entry.name,
          { type: entry.type, path: entry.path },
          `${entry.type === "folder" ? "Folder" : "File"}: ${entry.path}`,
          entry.type === "folder"
            ? `Use bash with safe read-only commands scoped to "${entry.path}" when exact folder contents are needed.`
            : `Use read_file with path="${entry.path}" for exact contents.`
        ),
        entry.path
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
      const shape = variable.shape?.length ? `shape=${variable.shape.join("x")}` : null;
      const length = typeof variable.length === "number" ? `length=${variable.length}` : null;
      const previewLines = [
        `Variable ${variable.name}: ${variable.type}`,
        shape,
        length,
        variable.repr ? truncatePreview(variable.repr, 700) : null,
      ].filter((line): line is string => typeof line === "string" && line.length > 0);

      addOption(
        makeReference(
          "variable",
          variable.name,
          { type: "variable", name: variable.name, notebookPath: notebookPath ?? undefined },
          previewLines.join("\n"),
          `Use notebook execution or variable inspection plumbing with name="${variable.name}" for fresh detail.`
        ),
        [variable.type, shape, length].filter(Boolean).join(" · ")
      );
    }

    const terminals = assistant?.terminalPool?.getState().terminals ?? [];
    for (const terminal of terminals) {
      if (terminal.type === "system") continue;
      if (terminal.type === "agent" && effectiveChatId && terminal.chatId !== effectiveChatId) continue;
      addOption(
        makeReference(
          "terminal",
          terminal.name,
          { type: "terminal", terminalName: terminal.name, chatId: terminal.chatId ?? undefined },
          terminal.pendingCommand?.buffer
            ? truncatePreview(terminal.pendingCommand.buffer, 900)
            : `Terminal ${terminal.name} (${terminal.type})`,
          `Use await_command with terminalName="${terminal.name}" if a command is still running.`
        ),
        terminal.type === "agent" ? "Chat terminal" : "User terminal"
      );
    }

    return options;
  }, [
    activeNotebookPath,
    activeNotebook,
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
    status: "running" | "completed";
    result?: unknown;
    lastResubmittedAt?: number;
  };

  const CANCELLED_TOOL_RESULT = { error: "cancelled_by_user" } as const;
  const REJECTED_TOOL_RESULT = { error: "rejected_by_user" } as const;

  // Track tool calls across rerenders:
  // - running: dispatched/queued, avoid duplicate execution
  // - completed: result available; can be re-submitted if provider keeps call state unresolved
  const trackedToolCallsRef = useRef<Map<string, ToolCallTracker>>(new Map());

  // Tool calls blocked because no kernel was connected at execution time.
  // Stored here so they can be retried once the kernel connects, without
  // re-running the full LLM turn. useChat will resume naturally once all
  // pending tool results are submitted.
  const pendingKernelToolCallsRef = useRef<
    Array<{ toolCallId: string; toolName: OrionToolName; args: Record<string, unknown> }>
  >([]);
  // Tool calls that only need a Jupyter server connection (no kernel required).
  // Flushed as soon as assistant.toolsReady becomes true.
  const pendingServerToolCallsRef = useRef<
    Array<{ toolCallId: string; toolName: OrionToolName; args: Record<string, unknown> }>
  >([]);
  const toolExecutionChainRef = useRef<Promise<void>>(Promise.resolve());
  const stopRequestedRef = useRef(false);
  const lastStopRequestedAtRef = useRef<number>(0);

  /** Pending confirmation action when user tries to switch/create chat while processing */
  const [stopConfirmAction, setStopConfirmAction] = useState<
    { type: "new-chat" } | { type: "switch-chat"; targetChatId: string } | null
  >(null);

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
  const pendingApprovalToolCallsRef = useRef<Map<string, PendingApproval>>(new Map());
  const [pendingApprovalIds, setPendingApprovalIds] = useState<Set<string>>(new Set());

  /** Live progress descriptions for running sub-agent tool calls, keyed by toolCallId. */
  const [subagentProgress, setSubagentProgress] = useState<Map<string, string>>(new Map());

  /**
   * Per parent-chat + subagent type, how many delegate runs have started (for dev log
   * filenames: {chatId}-{agentName}#n.log).
   */
  const subagentRunIndexRef = useRef<Map<string, number>>(new Map());
  const activeSubagentRunToolCallsRef = useRef<Set<string>>(new Set());
  const forcedSubagentForCurrentTurnRef = useRef<string | null>(null);

  // Manual input state — v6 useChat no longer manages input
  const [input, setInput] = useState("");
  const [draftReferences, setDraftReferences] = useState<ResolvedChatReference[]>([]);
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setInput(e.target.value),
    []
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
  }, []);

  useEffect(() => {
    const handleMentionNotebookCell = (event: Event) => {
      const detail = (event as CustomEvent<NotebookCellMentionEventDetail>).detail;
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
          `Use use_notebook with notebookPath="${detail.notebookPath}", then read_cell for cell index ${detail.cellIndex}.`
        )
      );
    };

    window.addEventListener("orion:mention-notebook-cell", handleMentionNotebookCell);
    return () => {
      window.removeEventListener("orion:mention-notebook-cell", handleMentionNotebookCell);
    };
  }, [addDraftReference]);

  useEffect(() => {
    const handleAttachEditorSelection = (event: Event) => {
      const detail = (event as CustomEvent<EditorSelectionAttachEventDetail>).detail;
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
            detail.lineEnd
          )
          : formatFileSelectionReferenceLabel(
            detail.path,
            detail.lineStart,
            detail.lineEnd
          );
      const range = formatLineRange(detail.lineStart, detail.lineEnd);
      const toolHint =
        typeof notebookCellIndex === "number"
          ? `Use use_notebook with notebookPath="${detail.path}", then read_cell for cell index ${notebookCellIndex}; the selected source lines ${range} are included inline.`
          : `Use read_file with path="${detail.path}", startLine=${detail.lineStart - 1}, endLine=${detail.lineEnd - 1} for exact contents.`;

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
          toolHint
        )
      );
    };

    window.addEventListener("orion:attach-editor-selection", handleAttachEditorSelection);
    return () => {
      window.removeEventListener("orion:attach-editor-selection", handleAttachEditorSelection);
    };
  }, [addDraftReference]);

  // User credential for the currently selected provider (BYOK or ChatGPT OAuth).
  // Sent with every chat request so the server can use the user's own key.
  const userCredential = modelInfo?.provider
    ? (effectiveSettings.providers?.credentials?.[modelInfo.provider] ?? undefined)
    : undefined;

  /**
   * Refresh a provider's ChatGPT OAuth access token if needed. BYOK credentials
   * and providers without credentials are returned as-is.
   */
  const refreshCredentialForProviderIfNeeded = useCallback(async (
    provider: LLM["provider"] | undefined
  ): Promise<ProviderCredential | undefined> => {
    if (!provider) return undefined;
    const credential = provider
      ? (effectiveSettings.providers?.credentials?.[provider] ?? undefined)
      : undefined;
    if (credential?.type !== "chatgpt_oauth") return credential;

    // Refresh 60 seconds before expiry to avoid races.
    const shouldRefresh = credential.expiresAt < Date.now() + 60_000;
    if (!shouldRefresh) return credential;

    try {
      const res = await fetch("/api/credentials/oauth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: credential.refreshToken }),
      });
      if (!res.ok) throw new Error("Refresh request failed");

      const data = await res.json() as {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        accountId?: string;
      };

      const refreshed = {
        type: "chatgpt_oauth" as const,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        ...(data.accountId && { accountId: data.accountId }),
      };

      // Persist refreshed tokens in settings so subsequent requests use them.
      setUserSettings((current) => ({
        ...current,
        providers: {
          ...current.providers,
          credentials: {
            ...current.providers?.credentials,
            [provider]: refreshed,
          },
        },
      }));

      return refreshed;
    } catch {
      // If refresh fails, try with the existing (possibly expired) token.
      // The server will return a 401 which will be shown to the user.
      return credential;
    }
  }, [effectiveSettings.providers?.credentials, setUserSettings]);

  // Ref for dynamic body values — read by the transport function at send time
  const bodyRef = useRef<Record<string, unknown>>(
    (() => {
      const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
      return {
        provider: modelInfo?.provider,
        model: selectedModel,
        interactionMode,
        agentMode: interactionMode === "Agent",
        chatId: effectiveChatId ?? undefined,
        modelSettings: modelSettingsMap[selectedModel],
        notebookPath,
        activeFilePath,
        workspaceDirectory: workspaceDirectory ?? undefined,
        availableSkills: serializeAvailableSkills(assistant?.availableSkills ?? []),
        availableSubagents: serializeAvailableSubagents(assistant?.availableSubagents ?? []),
        serverInfo: assistant?.serverInfo ?? undefined,
        jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
        clientPlatformOs,
        userCredential,
      };
    })()
  );

  // Keep bodyRef in sync with latest values
  useEffect(() => {
    const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
    bodyRef.current = {
      provider: modelInfo?.provider,
      model: selectedModel,
      interactionMode,
      agentMode: interactionMode === "Agent",
      chatId: effectiveChatId ?? undefined,
      modelSettings: modelSettingsMap[selectedModel],
      notebookPath,
      activeFilePath,
      workspaceDirectory: workspaceDirectory ?? undefined,
      availableSkills: serializeAvailableSkills(assistant?.availableSkills ?? []),
      availableSubagents: serializeAvailableSubagents(assistant?.availableSubagents ?? []),
      serverInfo: assistant?.serverInfo ?? undefined,
      jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
      clientPlatformOs,
      userCredential,
    };
  }, [
    modelInfo?.provider,
    selectedModel,
    interactionMode,
    effectiveChatId,
    modelSettingsMap,
    activeNotebookPath,
    workspaceDirectory,
    assistant?.availableSkills,
    assistant?.availableSubagents,
    assistant?.serverInfo,
    assistant?.jupyterServerIsLocal,
    clientPlatformOs,
    userCredential,
  ]);

  // Stable transport instance — uses bodyRef for dynamic body values.
  // prepareSendMessagesRequest intercepts every outbound send to apply the
  // wire optimizer (stub old tool results, drop old images) and replay any
  // active compaction summary as a synthetic summary pair.
  const transportRef = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      body: () => bodyRef.current,
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          ...body,
          messages: buildWirePayload(messages, compactionSummaryRef.current),
        },
      }),
    })
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
    addToolOutput,
    regenerate,
  } = useChat({
    transport: transportRef.current,
    // Streaming can arrive at 50+ chunks/sec; throttle UI state commits so
    // markdown/tool rendering does not monopolize the main thread.
    experimental_throttle: 50,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: () => {
      const finalMessages = messagesRef.current;
      const persistId = effectiveChatIdRef.current;
      if (!persistId) return;

      const chatForPersist = chats.find((c) => c.id === persistId);
      const newChatMessages: ChatMessage[] = finalMessages.map((m) => {
        const existing = chatForPersist?.messages.find((msg) => msg.id === m.id);
        const references = parseChatMessageReferences(m.metadata);
        return {
          ...m,
          metadata: references.length > 0 ? { references } : undefined,
          timestamp: existing?.timestamp || new Date(),
          modelUsed: selectedModel,
          checkpointId: existing?.checkpointId,
        };
      });

      const chatBeforeUpdate = chats.find((c) => c.id === persistId);
      const isFirstUserMessage =
        chatBeforeUpdate?.messages.length === 0 &&
        newChatMessages.some((m) => m.role === "user");

      if (isFirstUserMessage && !titleGeneratedForChatsRef.current.has(persistId)) {
        titleGeneratedForChatsRef.current.add(persistId);
        generateAndSetTitle(newChatMessages, persistId);
      }

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === persistId) {
            return { ...chat, messages: newChatMessages, updatedAt: new Date() };
          }
          return chat;
        })
      );

      setEditingState(null);
    },
    onError: (error) => {
      console.log(error);
      const msg = (error?.message ?? "").toLowerCase();
      const isContextError =
        msg.includes("prompt is too long") ||
        msg.includes("context_length") ||
        msg.includes("context window") ||
        msg.includes("maximum context") ||
        msg.includes("too many tokens");
      if (isContextError && !compactionInFlightRef.current && effectiveChatIdRef.current) {
        if (!modelInfo?.provider) return;
        compactionInFlightRef.current = true;
        setIsCompacting(true);
        const chatId = effectiveChatIdRef.current;
        const currentMessages = messagesRef.current;
        const prevSummary = compactionSummaryRef.current;
        compactConversation(currentMessages, {
          chatId,
          previousSummary: prevSummary,
          userCredential,
          model: selectedModel,
          provider: modelInfo.provider,
          retentionTurns: 2,
        })
          .then(async (result) => {
            await chatStorage.updateCompactionSummary(chatId, result.summary);
            compactionSummaryRef.current = result.summary;
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId ? { ...c, compactionSummary: result.summary } : c
              )
            );
            regenerate();
          })
          .catch((err) => {
            console.error("Reactive compaction failed:", err);
            toast.error("Failed to compact conversation after context error.");
          })
          .finally(() => {
            compactionInFlightRef.current = false;
            setIsCompacting(false);
          });
      }
    },
  });

  // Derived isLoading for backward compat with child components
  const isLoading = status === "streaming" || status === "submitted";
  const selectedContextWindow = getModel(selectedModel)?.contextWindow ?? HARD_CAP_TOKENS;
  const deferredMessagesForContext = React.useDeferredValue(messages);
  const contextEstimate = useContextEstimate(
    deferredMessagesForContext,
    selectedContextWindow,
    currentChat?.compactionSummary
  );

  // Ref to always hold the latest addToolOutput so async tool callbacks
  // never invoke a stale closure (which would see an outdated `status`
  // and skip the follow-up LLM request).
  const addToolOutputRef = useRef(addToolOutput);

  const hasPendingToolCalls = React.useMemo(() => {
    const modeUsesTools =
      interactionMode === "Agent" || interactionMode === "Ask" || interactionMode === "Edit";
    if (!modeUsesTools) return false;

    return messages.some((msg) =>
      msg.parts.some(
        (part) =>
          part.type.startsWith("tool-") &&
          "state" in part &&
          part.state === "input-available"
      )
    );
  }, [interactionMode, messages]);

  const isInputLocked = isLoading || hasPendingToolCalls;

  /** Skill slash commands built from the currently available skills. */
  const skillSlashCommands = React.useMemo(
    () => buildSkillSlashCommands(assistant?.availableSkills ?? []),
    [assistant?.availableSkills]
  );
  const subagentSlashCommands = React.useMemo(
    () => buildSubagentSlashCommands(assistant?.availableSubagents ?? []),
    [assistant?.availableSubagents]
  );

  /**
   * Detect which slash command (if any) is active based on the current input.
   * Returns the command name (e.g. "compact", "skill:eda") or null.
   * Uses the longest matching label so `/foobar` does not resolve as `/foo`.
   */
  const activeSlashCommand = React.useMemo(() => {
    const trimmed = input.trimStart();
    const allCommands = [...SLASH_COMMANDS, ...subagentSlashCommands, ...skillSlashCommands];
    let best: { name: string; labelLen: number } | null = null;
    for (const cmd of allCommands) {
      if (!trimmed.startsWith(cmd.label)) continue;
      const nextChar = trimmed.charAt(cmd.label.length);
      const hasValidBoundary = !nextChar || /\s/.test(nextChar);
      if (!hasValidBoundary) continue;
      if (!best || cmd.label.length > best.labelLen) {
        best = { name: cmd.name, labelLen: cmd.label.length };
      }
    }
    return best?.name ?? null;
  }, [input, subagentSlashCommands, skillSlashCommands]);

  /** Run compaction and update state + IndexedDB. Returns the new summary on success, null on failure. */
  const runCompaction = useCallback(async (opts?: { retentionTurns?: number }): Promise<CompactionSummary | null> => {
    if (compactionInFlightRef.current || !effectiveChatId) return null;
    if (!modelInfo?.provider) return null;
    compactionInFlightRef.current = true;
    setIsCompacting(true);

    try {
      const result = await compactConversation(messagesRef.current, {
        chatId: effectiveChatId,
        previousSummary: currentChat?.compactionSummary,
        userCredential,
        model: selectedModel,
        provider: modelInfo.provider,
        ...opts,
      });

      await chatStorage.updateCompactionSummary(effectiveChatId, result.summary);
      compactionSummaryRef.current = result.summary;

      setChats((prev) =>
        prev.map((c) =>
          c.id === effectiveChatId ? { ...c, compactionSummary: result.summary } : c
        )
      );

      const savedK = Math.round(result.summary.tokensSaved / 1000);
      toast.success(`Compacted — freed ${savedK > 0 ? `${savedK}k` : "some"} tokens`);

      return result.summary;
    } catch (err) {
      console.error("Compaction failed:", err);
      toast.error("Failed to compact conversation. Please try again.");
      return null;
    } finally {
      compactionInFlightRef.current = false;
      setIsCompacting(false);
    }
  }, [effectiveChatId, currentChat?.compactionSummary, userCredential, selectedModel, modelInfo?.provider, setChats]);

  // Keep messagesRef up to date
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep addToolOutputRef in sync so async callbacks always use the latest closure
  useEffect(() => {
    addToolOutputRef.current = addToolOutput;
  }, [addToolOutput]);

  const enqueueToolExecution = useCallback(
    (toolCallId: string, toolName: OrionToolName, args: Record<string, unknown>) => {
      if (!assistant) return;

      toolExecutionChainRef.current = toolExecutionChainRef.current
        .then(async () => {
          if (stopRequestedRef.current) {
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result: CANCELLED_TOOL_RESULT,
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
            const description = typeof delegateArgs.description === "string" ? delegateArgs.description : "";
            const subagentType = typeof delegateArgs.subagent === "string" ? delegateArgs.subagent : "";
            const reconnectTmpNotebookPath =
              typeof delegateArgs.reconnectTmpNotebookPath === "string"
                ? delegateArgs.reconnectTmpNotebookPath.trim()
                : "";
            const subagentDefinition = assistant.availableSubagents.find((candidate) => candidate.name === subagentType);
            const runChatId = effectiveChatId;
            let latestSubagentMessages: UIMessage[] = [];

            const writeSubagentSession = (
              patch: Partial<SubagentSession> & { status?: SubagentSessionStatus }
            ) => {
              if (!runChatId) return;
              const timestamp = new Date();
              setChats((prev) =>
                prev.map((chat) => {
                  if (chat.id !== runChatId) return chat;
                  const existing = chat.subagentSessions?.[toolCallId];
                  const base: SubagentSession = existing ?? {
                    subagentType,
                    label: subagentDefinition?.label ?? (subagentType || "Sub-agent"),
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
                })
              );
            };

            const failDelegate = (
              errorText: string,
              patch?: Partial<SubagentSession>
            ) => {
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: { error: errorText },
              });
              writeSubagentSession({
                ...patch,
                status: "error",
                errorText,
              });
              addToolOutputRef.current({ state: "output-error", tool: toolName, toolCallId, errorText });
            };

            if (!subagentDefinition) {
              failDelegate(
                `Sub-agent "${subagentType || "(missing)"}" is not available in this session.`
              );
              return;
            }

            if (
              subagentDefinition.options?.disableModelInvocation === true &&
              forcedSubagentForCurrentTurnRef.current !== subagentDefinition.name
            ) {
              failDelegate(
                `Sub-agent "${subagentDefinition.name}" is disabled for model invocation. Invoke it with /${subagentDefinition.name}.`
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
            const effectiveUserCredential = await refreshCredentialForProviderIfNeeded(
              modelResolution.providerId
            );

            const existingSubagentSessions = currentChat?.subagentSessions ?? {};
            const existingMaxInstance = Object.values(existingSubagentSessions)
              .filter((session) => session.subagentType === subagentType)
              .reduce(
                (max, session) => Math.max(max, session.subagentDevLogInstance ?? 0),
                0
              );
            const reconnectEntry = reconnectTmpNotebookPath
              ? Object.entries(existingSubagentSessions).find(
                ([, session]) =>
                  session.subagentType === subagentType &&
                  session.tmpNotebookPath === reconnectTmpNotebookPath
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
              addToolOutputRef.current({ state: "output-error", tool: toolName, toolCallId, errorText });
              return;
            }

            const abortController = new AbortController();
            // Link to parent stop signal so user cancellation propagates into the subagent loop
            const stopUnlinkId = setInterval(() => {
              if (stopRequestedRef.current) {
                abortController.abort();
                clearInterval(stopUnlinkId);
              }
            }, 100);
            activeSubagentRunToolCallsRef.current.add(toolCallId);

            try {
              const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
              const subagentKey = `${runChatId ?? "no-chat"}:${subagentType}`;
              const reconnectSourceToolCallId = reconnectEntry?.[0];
              const reconnectSourceSession = reconnectEntry?.[1];
              const nextSubagentInstance = reconnectSourceSession
                ? reconnectSourceSession.subagentDevLogInstance || existingMaxInstance || 1
                : Math.max(
                  subagentRunIndexRef.current.get(subagentKey) ?? 0,
                  existingMaxInstance
                ) + 1;
              if (!reconnectSourceSession) {
                subagentRunIndexRef.current.set(subagentKey, nextSubagentInstance);
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
                availableSubagents: assistant.availableSubagents,
                description,
                modelId: modelResolution.modelId,
                providerId: modelResolution.providerId as SupportedProvider,
                modelSettings: modelResolution.modelSettings,
                workspaceDirectory: workspaceDirectory ?? undefined,
                notebookPath,
                activeFilePath,
                serverInfo: assistant.serverInfo ?? undefined,
                jupyterServerIsLocal: assistant.jupyterServerIsLocal ?? undefined,
                clientPlatformOs,
                chatId: runChatId ?? undefined,
                subagentDevLogInstance: nextSubagentInstance,
                reconnectTmpNotebookPath: reconnectTmpNotebookPath || undefined,
                reconnectMessages: reconnectSourceSession?.messages,
                executeToolCall: assistant.executeToolCall,
                createTmpNotebookCopy: assistant.createTmpSubagentNotebookCopy,
                abortSignal: abortController.signal,
                userCredential: effectiveUserCredential,
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
                  setSubagentProgress((prev) => new Map(prev).set(toolCallId, desc));
                },
              });

              clearInterval(stopUnlinkId);
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

              if (stopRequestedRef.current) return;
              addToolOutputRef.current({ tool: toolName, toolCallId, output: delegateOutput });
            } catch (err) {
              clearInterval(stopUnlinkId);
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
                : err instanceof Error ? err.message : String(err);
              writeSubagentSession({
                status: isCancelled ? "cancelled" : "error",
                messages: latestSubagentMessages,
                errorText,
              });
              trackedToolCallsRef.current.set(toolCallId, {
                status: "completed",
                result: isCancelled ? CANCELLED_TOOL_RESULT : { error: errorText },
              });
              if (stopRequestedRef.current) return;
              addToolOutputRef.current({
                state: "output-error",
                tool: toolName,
                toolCallId,
                errorText,
              });
            } finally {
              clearInterval(stopUnlinkId);
              activeSubagentRunToolCallsRef.current.delete(toolCallId);
            }
            return;
          }

          // ---- all other tools: delegate to AssistantProvider -------------
          try {
            const result = await assistant.executeToolCall(toolName, args);
            trackedToolCallsRef.current.set(toolCallId, { status: "completed", result });
            if (stopRequestedRef.current) {
              return;
            }
            addToolOutputRef.current({ tool: toolName, toolCallId, output: result });
          } catch (err) {
            const errorText = err instanceof Error ? err.message : String(err);
            trackedToolCallsRef.current.set(toolCallId, {
              status: "completed",
              result: { error: errorText },
            });
            if (stopRequestedRef.current) {
              return;
            }
            addToolOutputRef.current({
              state: "output-error",
              tool: toolName,
              toolCallId,
              errorText,
            });
          }
        })
        .catch(() => {
          // Keep the chain alive even if an unexpected error escapes.
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
      refreshCredentialForProviderIfNeeded,
      setChats,
    ]
  );

  // Agent/Ask/Edit tool execution loop — fires whenever messages update with pending tool calls
  useEffect(() => {
    const modeUsesTools =
      interactionMode === "Agent" || interactionMode === "Ask" || interactionMode === "Edit";
    if (!modeUsesTools || !assistant?.toolsReady) return;

    for (const msg of messages) {
      for (const part of msg.parts) {
        // Only handle tool parts (type is "tool-<toolName>")
        if (!part.type.startsWith("tool-") || !("toolCallId" in part) || !("state" in part)) continue;
        const inv = part as { toolCallId: string; state: string; input: Record<string, unknown> };
        // Extract tool name from part type ("tool-execute_code" → "execute_code")
        const toolName = part.type.slice(5);

        if (inv.state !== "input-available") continue;

        if (stopRequestedRef.current) {
          continue;
        }

        const trackedCall = trackedToolCallsRef.current.get(inv.toolCallId);
        if (trackedCall?.status === "completed") {
          if (!isLoading) {
            const now = Date.now();
            const shouldResubmit =
              !trackedCall.lastResubmittedAt || now - trackedCall.lastResubmittedAt > 300;
            if (shouldResubmit) {
              addToolOutputRef.current({ tool: toolName, toolCallId: inv.toolCallId, output: trackedCall.result });
              trackedToolCallsRef.current.set(inv.toolCallId, {
                ...trackedCall,
                lastResubmittedAt: now,
              });
            }
          }
          continue;
        }
        if (trackedCall?.status === "running") {
          continue;
        }

        // Mark immediately to prevent duplicate execution while in-flight.
        trackedToolCallsRef.current.set(inv.toolCallId, { status: "running" });

        // Tool gating:
        // Tier 1 — NO_DEPENDENCY_TOOLS (load_skill, delegate): always pass through.
        // Tier 2 — SERVER_ONLY_TOOLS: need a Jupyter server (toolsReady), but no kernel.
        // Tier 3 — kernel tools (execute_cell, execute_code, restart_notebook): need kernelStatus === "connected".
        //
        // Do NOT call addToolOutput when blocking — leaving the tool call unresolved
        // naturally pauses useChat without triggering another LLM request.
        const toolNameTyped = toolName as OrionToolName;

        if (!NO_DEPENDENCY_TOOLS.has(toolNameTyped)) {
          if (SERVER_ONLY_TOOLS.has(toolNameTyped)) {
            // Tier 2: need server connection only
            if (!assistant?.toolsReady) {
              pendingServerToolCallsRef.current.push({
                toolCallId: inv.toolCallId,
                toolName: toolNameTyped,
                args: inv.input,
              });
              setShowKernelPrompt(true);
              continue;
            }
          } else {
            // Tier 3: need a running kernel
            if (kernelStatus !== "connected") {
              pendingKernelToolCallsRef.current.push({
                toolCallId: inv.toolCallId,
                toolName: toolNameTyped,
                args: inv.input,
              });
              setShowKernelPrompt(true);
              continue;
            }
          }
        }

        // In Ask mode, block destructive bash commands before they execute
        if (interactionMode === "Ask" && toolNameTyped === "bash") {
          const blockReason = isReadOnlyBashBlocked(
            (inv.input as { command?: string }).command ?? ""
          );
          if (blockReason) {
            trackedToolCallsRef.current.set(inv.toolCallId, {
              status: "completed",
              result: { error: blockReason },
            });
            addToolOutputRef.current({
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
          const approvalPromise = new Promise<"approve" | "reject">((resolve) => {
            pendingApprovalToolCallsRef.current.set(inv.toolCallId, {
              toolCallId: inv.toolCallId,
              toolName: toolNameTyped,
              args: inv.input,
              resolve,
            });
            setPendingApprovalIds((prev) => new Set(prev).add(inv.toolCallId));
          });

          toolExecutionChainRef.current = toolExecutionChainRef.current
            .then(async () => {
              const action = await approvalPromise;
              if (action === "reject" || stopRequestedRef.current) {
                const errorText = stopRequestedRef.current ? "cancelled_by_user" : "rejected_by_user";
                trackedToolCallsRef.current.set(inv.toolCallId, {
                  status: "completed",
                  result: { error: errorText },
                });
                addToolOutputRef.current({ state: "output-error", tool: toolNameTyped, toolCallId: inv.toolCallId, errorText });
                return;
              }
              if (!assistant) return;
              try {
                const toolResult = await assistant.executeToolCall(toolNameTyped, inv.input);
                trackedToolCallsRef.current.set(inv.toolCallId, { status: "completed", result: toolResult });
                if (!stopRequestedRef.current) {
                  addToolOutputRef.current({ tool: toolNameTyped, toolCallId: inv.toolCallId, output: toolResult });
                }
              } catch (err) {
                const errorText = err instanceof Error ? err.message : String(err);
                trackedToolCallsRef.current.set(inv.toolCallId, { status: "completed", result: { error: errorText } });
                if (!stopRequestedRef.current) {
                  addToolOutputRef.current({ state: "output-error", tool: toolNameTyped, toolCallId: inv.toolCallId, errorText });
                }
              }
            })
            .catch(() => {
              // Keep the chain alive
            });

          continue;
        }

        enqueueToolExecution(inv.toolCallId, toolNameTyped, inv.input);
      }
    }
  }, [
    messages,
    interactionMode,
    assistant,
    kernelStatus,
    enqueueToolExecution,
    isLoading,
    toolApprovalMode,
  ]);

  // When the Jupyter server connects (toolsReady), flush server-only tool calls that were
  // blocked due to no server connection. useChat resumes once all pending results are submitted.
  useEffect(() => {
    if (!assistant?.toolsReady) return;
    if (pendingServerToolCallsRef.current.length === 0) return;

    const pending = pendingServerToolCallsRef.current.splice(0);
    if (stopRequestedRef.current) {
      if (pendingKernelToolCallsRef.current.length === 0) setShowKernelPrompt(false);
      return;
    }
    if (pendingKernelToolCallsRef.current.length === 0) setShowKernelPrompt(false);

    for (const { toolCallId, toolName, args } of pending) {
      enqueueToolExecution(toolCallId, toolName, args);
    }
  }, [assistant?.toolsReady, enqueueToolExecution]);

  // When a kernel becomes available, flush any tool calls that were blocked
  // due to a missing kernel, then hide the prompt. useChat resumes automatically
  // once all pending tool results are submitted.
  useEffect(() => {
    if (kernelStatus !== "connected" || !assistant?.toolsReady) return;
    if (pendingKernelToolCallsRef.current.length === 0) return;

    const pending = pendingKernelToolCallsRef.current.splice(0);
    if (stopRequestedRef.current) {
      if (pendingServerToolCallsRef.current.length === 0) setShowKernelPrompt(false);
      return;
    }
    if (pendingServerToolCallsRef.current.length === 0) setShowKernelPrompt(false);

    for (const { toolCallId, toolName, args } of pending) {
      enqueueToolExecution(toolCallId, toolName, args);
    }
  }, [kernelStatus, assistant, enqueueToolExecution]);

  // Load chats from IndexedDB on mount
  useEffect(() => {
    const loadChats = async () => {
      try {
        await chatStorage.migrateFromSessionStorage();
        const storedChats = await chatStorage.getChats();
        setChats(storedChats);
        setIsChatsLoaded(true);
      } catch (error) {
        console.error("Failed to load chats from IndexedDB:", error);
        setIsChatsLoaded(true);
      }
    };

    loadChats();
  }, []);

  // Persist chats to IndexedDB when they change
  useEffect(() => {
    if (!isChatsLoaded) return;

    const saveChats = async () => {
      try {
        await chatStorage.saveChats(chats);
      } catch (error) {
        console.error("Failed to save chats to IndexedDB:", error);
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

    const messagesToLoad = (currentChat?.messages ?? []).map((message) => {
      const references = parseChatMessageReferences(message.metadata);
      return {
        ...message,
        metadata: references.length > 0 ? { references } : undefined,
      };
    });

    if (!isRealChatSwitch) {
      return;
    }

    const existingTrackedToolCalls = new Map<string, ToolCallTracker>();
    for (const msg of messagesToLoad) {
      for (const part of msg.parts) {
        if (part.type.startsWith("tool-") && "toolCallId" in part && "state" in part) {
          const inv = part as { toolCallId: string; state: string; output?: unknown };
          existingTrackedToolCalls.set(inv.toolCallId, {
            status: inv.state === "output-available" ? "completed" : "running",
            result: inv.state === "output-available" ? inv.output : undefined,
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

    setMessages(messagesToLoad);
  }, [currentChat, currentChatId, setMessages]);

  // Initialize with first chat or create one if none exist (layout effect so
  // `currentChatId` is set before paint — avoids sends without `chatId`).
  useLayoutEffect(() => {
    if (!isChatsLoaded) return;

    if (chats.length === 0) {
      createNewChat();
    } else if (!currentChatId) {
      setCurrentChatId(chats[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatsLoaded, chats.length]);

  // ============================================================================
  // Chat management handlers
  // ============================================================================

  const createNewChat = () => {
    // If currently processing, show confirmation dialog instead
    if (isInputLocked) {
      setStopConfirmAction({ type: "new-chat" });
      return;
    }

    const isEmpty = !currentChat?.messages?.length;

    if (isEmpty && currentChatId) {
      // Current chat is empty: reset it instead of creating a duplicate
      setMessages([]);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId
            ? { ...chat, messages: [], updatedAt: new Date() }
            : chat
        )
      );
      setEditingState(null);
      setInput("");
      setDraftReferences([]);
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
    setDraftReferences([]);
  };

  const saveTitle = () => {
    if (!currentChatId || !editedTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId
          ? { ...chat, title: editedTitle.trim() }
          : chat
      )
    );
    setIsEditingTitle(false);
  };

  const handleTitleDoubleClick = () => {
    if (currentChat) {
      setEditedTitle(currentChat.title);
      setIsEditingTitle(true);
    }
  };

  const handleRenameChat = (chatId: string) => {
    const chatToRename = chats.find((c) => c.id === chatId);
    if (chatToRename) {
      setCurrentChatId(chatId);
      setEditedTitle(chatToRename.title);
      setIsEditingTitle(true);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await chatStorage.deleteChat(chatId);
      setChats((prev) => {
        const newChats = prev.filter((chat) => chat.id !== chatId);
        if (currentChatId === chatId) {
          if (newChats.length > 0) {
            setCurrentChatId(newChats[0].id);
          } else {
            createNewChat();
          }
        }
        return newChats;
      });
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const handleHistorySelect = (chatId: string) => {
    // If currently processing, show confirmation dialog instead
    if (isInputLocked) {
      setStopConfirmAction({ type: "switch-chat", targetChatId: chatId });
      return;
    }
    setCurrentChatId(chatId);
    setDraftReferences([]);
  };

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

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleCancelEdit = () => {
    if (editingState) {
      setInput("");
      setEditingState(null);
      setDraftReferences([]);
    }
  };

  // ============================================================================
  // Submission
  // ============================================================================

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (isInputLocked) {
        return;
      }

      const msSinceStop = Date.now() - lastStopRequestedAtRef.current;
      if (lastStopRequestedAtRef.current > 0 && msSinceStop < 500) {
        return;
      }

      if (!input.trim()) return;
      const userInput = input;
      const referencesForSubmit = draftReferences;
      stopRequestedRef.current = false;
      forcedSubagentForCurrentTurnRef.current = null;
      setInput("");
      setDraftReferences([]);

      // Refresh OAuth token if needed before sending
      const freshCredential = await refreshCredentialForProviderIfNeeded(modelInfo?.provider);

      // Pre-send context budget check: auto-compact if the estimated wire payload
      // exceeds COMPACTION_AUTO_THRESHOLD × cap before sending.
      if (!compactionInFlightRef.current) {
        const ctxWindow = getModel(selectedModel)?.contextWindow ?? HARD_CAP_TOKENS;
        const wirePayload = buildWirePayload(messagesRef.current, compactionSummaryRef.current);
        const est = estimateMessageTokens(wirePayload, "", { contextWindow: ctxWindow });
        if (est.percentUsed >= COMPACTION_AUTO_THRESHOLD) {
          await runCompaction();
        }
      }

      // Update bodyRef with fresh credential before sending.
      bodyRef.current = { ...bodyRef.current, userCredential: freshCredential };

      const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
      await sendMessage(
        {
          text: userInput,
          ...(referencesForSubmit.length > 0
            ? { metadata: { references: referencesForSubmit } }
            : {}),
        },
        {
          body: {
            provider: modelInfo?.provider,
            model: selectedModel,
            interactionMode,
            agentMode: interactionMode === "Agent",
            chatId: effectiveChatId ?? undefined,
            modelSettings: modelSettingsMap[selectedModel],
            notebookPath,
            activeFilePath,
            workspaceDirectory: workspaceDirectory ?? undefined,
            availableSkills: serializeAvailableSkills(assistant?.availableSkills ?? []),
            availableSubagents: serializeAvailableSubagents(assistant?.availableSubagents ?? []),
            serverInfo: assistant?.serverInfo ?? undefined,
            jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
            clientPlatformOs,
            userCredential: freshCredential,
          },
        }
      );
    },
    [
      input,
      draftReferences,
      sendMessage,
      modelInfo,
      selectedModel,
      interactionMode,
      effectiveChatId,
      modelSettingsMap,
      isInputLocked,
      activeNotebookPath,
      workspaceDirectory,
      assistant?.availableSkills,
      assistant?.availableSubagents,
      assistant?.serverInfo,
      assistant?.jupyterServerIsLocal,
      clientPlatformOs,
      userCredential,
      refreshCredentialForProviderIfNeeded,
      runCompaction,
      getModel,
    ]
  );

  /** Custom submit that handles message editing (replaces messages after the edited one) */
  const customHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Intercept slash commands before normal chat submission.
    if (activeSlashCommand === "compact") {
      setInput("");
      await runCompaction();
      return;
    }

    if (activeSlashCommand === "report-bug") {
      setInput("");
      window.open(ORION_GITHUB_ISSUES_URL, "_blank", "noopener,noreferrer");
      return;
    }

    // Handle subagent slash commands: /<name> <message>
    // Strip the command prefix and enforce delegation server-side via hidden metadata.
    if (activeSlashCommand?.startsWith("subagent:")) {
      const subagentName = activeSlashCommand.slice("subagent:".length);
      const commandLabel = `/${subagentName}`;
      const userMessage = input.trimStart().slice(commandLabel.length).trimStart();

      const subagent = assistant?.availableSubagents.find((s) => s.name === subagentName);
      if (subagent && !isInputLocked) {
        stopRequestedRef.current = false;
        const plainUserText = userMessage || `Run the ${subagent.name} sub-agent.`;

        setInput("");
        forcedSubagentForCurrentTurnRef.current = subagent.name;

        const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
        await sendMessage(
          { text: plainUserText },
          {
            body: {
              provider: modelInfo?.provider,
              model: selectedModel,
              interactionMode,
              agentMode: interactionMode === "Agent",
              chatId: effectiveChatId ?? undefined,
              modelSettings: modelSettingsMap[selectedModel],
              notebookPath,
              activeFilePath,
              workspaceDirectory: workspaceDirectory ?? undefined,
              availableSkills: serializeAvailableSkills(assistant?.availableSkills ?? []),
              availableSubagents: serializeAvailableSubagents(assistant?.availableSubagents ?? []),
              forcedSubagentName: subagent.name,
              serverInfo: assistant?.serverInfo ?? undefined,
              jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
              clientPlatformOs,
              userCredential,
            },
          }
        );
        return;
      }
    }

    // Handle skill slash commands: /<name> <message>
    // Strip the command prefix and enforce skill loading server-side via hidden metadata.
    if (activeSlashCommand?.startsWith("skill:")) {
      const skillName = activeSlashCommand.slice("skill:".length);
      const commandLabel = `/${skillName}`;
      const userMessage = input.trimStart().slice(commandLabel.length).trimStart();

      const skill = assistant?.availableSkills.find((s) => s.name === skillName);
      if (skill && !isInputLocked) {
        stopRequestedRef.current = false;
        const plainUserText = userMessage || `Apply the ${skill.name} skill.`;

        setInput("");
        forcedSubagentForCurrentTurnRef.current = null;

        const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
        await sendMessage(
          { text: plainUserText },
          {
            body: {
              provider: modelInfo?.provider,
              model: selectedModel,
              interactionMode,
              agentMode: interactionMode === "Agent",
              chatId: effectiveChatId ?? undefined,
              modelSettings: modelSettingsMap[selectedModel],
              notebookPath,
              activeFilePath,
              workspaceDirectory: workspaceDirectory ?? undefined,
              availableSkills: serializeAvailableSkills(assistant?.availableSkills ?? []),
              availableSubagents: serializeAvailableSubagents(assistant?.availableSubagents ?? []),
              forcedSkillName: skill.name,
              serverInfo: assistant?.serverInfo ?? undefined,
              jupyterServerIsLocal: assistant?.jupyterServerIsLocal ?? undefined,
              clientPlatformOs,
              userCredential,
            },
          }
        );
        return;
      }
    }

    if (isInputLocked) {
      return;
    }

    const msSinceStop = Date.now() - lastStopRequestedAtRef.current;
    if (lastStopRequestedAtRef.current > 0 && msSinceStop < 500) {
      return;
    }

    if (editingState && currentChatId) {
      stopRequestedRef.current = false;
      const currentMessages = messages;
      const editIndex = editingState.messageIndex;

      const newMessages = [...currentMessages];
      // Update the user message parts with the new text content
      newMessages[editIndex] = {
        ...newMessages[editIndex],
        parts: [{ type: "text" as const, text: input }],
      };
      newMessages.splice(editIndex + 1);

      setMessages(newMessages);
      setInput("");
      setEditingState(null);

      try {
        const { notebookPath, activeFilePath } = agentEditorContext(activeNotebookPath);
        const bodyPayload = {
          messages: newMessages.map((m) => ({ role: m.role, content: getTextContent(m) })),
          provider: modelInfo?.provider,
          model: selectedModel,
          interactionMode,
          agentMode: interactionMode === "Agent",
          chatId: effectiveChatId ?? undefined,
          modelSettings: modelSettingsMap[selectedModel],
          notebookPath,
          activeFilePath,
          workspaceDirectory: workspaceDirectory ?? undefined,
          userCredential,
        };

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          throw new Error(`Failed to get response: ${response.statusText}`);
        }

        // Parse UIMessage stream format using readUIMessageStream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantResponse = "";
        const assistantMessageId = Date.now().toString();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              // UIMessage stream SSE format: "d:" prefix for data events
              if (line.startsWith("d:")) {
                try {
                  const data = JSON.parse(line.substring(2));
                  // Handle text delta chunks
                  if (data.type === "text" && data.text) {
                    assistantResponse += data.text;
                  } else if (data.type === "text-delta" && data.textDelta) {
                    assistantResponse += data.textDelta;
                  }

                  if (assistantResponse) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastMessage = updated[updated.length - 1];

                      if (
                        lastMessage &&
                        lastMessage.role === "assistant" &&
                        lastMessage.id === assistantMessageId
                      ) {
                        updated[updated.length - 1] = {
                          ...lastMessage,
                          parts: [{ type: "text" as const, text: assistantResponse }],
                        };
                      } else {
                        updated.push({
                          id: assistantMessageId,
                          role: "assistant" as const,
                          parts: [{ type: "text" as const, text: assistantResponse }],
                        });
                      }

                      return updated;
                    });
                  }
                } catch {
                  // Skip unparseable lines
                }
              }
              // Also try legacy "0:" format for backward compatibility
              if (line.startsWith("0:")) {
                try {
                  const content = JSON.parse(line.substring(2));
                  assistantResponse += content;

                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMessage = updated[updated.length - 1];

                    if (
                      lastMessage &&
                      lastMessage.role === "assistant" &&
                      lastMessage.id === assistantMessageId
                    ) {
                      updated[updated.length - 1] = {
                        ...lastMessage,
                        parts: [{ type: "text" as const, text: assistantResponse }],
                      };
                    } else {
                      updated.push({
                        id: assistantMessageId,
                        role: "assistant" as const,
                        parts: [{ type: "text" as const, text: assistantResponse }],
                      });
                    }

                    return updated;
                  });
                } catch (e) {
                  console.error("Failed to parse stream chunk:", line, e);
                }
              }
            }
          }
        }

        setMessages((finalMessages) => {
          const newChatMessages: ChatMessage[] = finalMessages.map((m) => {
            const existing = currentChat?.messages.find((msg) => msg.id === m.id);
            const references = parseChatMessageReferences(m.metadata);
            return {
              ...m,
              metadata: references.length > 0 ? { references } : undefined,
              timestamp: existing?.timestamp || new Date(),
              modelUsed: selectedModel,
              checkpointId: existing?.checkpointId,
            };
          });

          setChats((prev) =>
            prev.map((chat) => {
              if (chat.id === currentChatId) {
                return { ...chat, messages: newChatMessages, updatedAt: new Date() };
              }
              return chat;
            })
          );

          return finalMessages;
        });
      } catch (error) {
        console.error("Error getting AI response:", error);
      }
    } else {
      handleSubmit(e);
    }
  };

  const handleStopGeneration = useCallback(() => {
    stopRequestedRef.current = true;
    lastStopRequestedAtRef.current = Date.now();
    const cancellingSubagentToolCallIds = new Set(activeSubagentRunToolCallsRef.current);
    const cancellingChatId = effectiveChatIdRef.current;

    if (cancellingChatId && cancellingSubagentToolCallIds.size > 0) {
      const timestamp = new Date();
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== cancellingChatId || !chat.subagentSessions) return chat;
          const nextSessions = { ...chat.subagentSessions };
          for (const toolCallId of cancellingSubagentToolCallIds) {
            const session = nextSessions[toolCallId];
            if (!session || session.status !== "running") continue;
            nextSessions[toolCallId] = {
              ...session,
              status: "cancelled",
              errorText: "cancelled_by_user",
              updatedAt: timestamp,
            };
          }
          return { ...chat, subagentSessions: nextSessions, updatedAt: timestamp };
        })
      );
    }

    setMessages((prev) => {
      return prev.map((msg) => {
        let changed = false;
        const nextParts = msg.parts.map((part) => {
          if (
            part.type.startsWith("tool-") &&
            "toolCallId" in part &&
            "state" in part &&
            (part as { state: string }).state === "input-available"
          ) {
            changed = true;
            const inv = part as { toolCallId: string };
            trackedToolCallsRef.current.set(inv.toolCallId, {
              status: "completed",
              result: CANCELLED_TOOL_RESULT,
            });
            return {
              ...part,
              state: "output-error" as const,
              errorText: "cancelled_by_user",
            };
          }
          return part;
        });

        if (!changed) return msg;
        return { ...msg, parts: nextParts } as UIMessage;
      });
    });

    pendingKernelToolCallsRef.current = [];
    pendingServerToolCallsRef.current = [];
    setShowKernelPrompt(false);

    // Reject all pending approval tool calls
    for (const [, pending] of pendingApprovalToolCallsRef.current) {
      pending.resolve("reject");
    }
    pendingApprovalToolCallsRef.current.clear();
    setPendingApprovalIds(new Set());

    stop();
  }, [setChats, setMessages, stop]);

  /** Handles confirmation from the stop-and-switch dialog */
  const handleStopConfirm = useCallback(() => {
    const action = stopConfirmAction;
    if (!action) return;

    handleStopGeneration();
    setStopConfirmAction(null);

    // Use microtask to let stop propagate before switching
    queueMicrotask(() => {
      if (action.type === "new-chat") {
        // Inline createNewChat logic (without the isInputLocked guard)
        const isEmpty = !currentChat?.messages?.length;
        if (isEmpty && currentChatId) {
          setMessages([]);
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === currentChatId
                ? { ...chat, messages: [], updatedAt: new Date() }
                : chat
            )
          );
          setEditingState(null);
          setInput("");
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
        }
      } else if (action.type === "switch-chat") {
        setCurrentChatId(action.targetChatId);
      }
    });
  }, [
    stopConfirmAction,
    handleStopGeneration,
    currentChat,
    currentChatId,
    setMessages,
    setChats,
    setInput,
  ]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!isChatsLoaded) {
    return (
      <div
        className={`flex w-full min-w-0 flex-col h-full overflow-hidden bg-sidebar ${className || ""}`}
        {...props}
      >
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
            Loading chat history...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full min-w-0 flex-col h-full overflow-hidden bg-sidebar ${className || ""}`}
      {...props}
    >
      {isSubagentChatView ? (
        <>
          <div className="sticky top-0 z-10 h-14 bg-sidebar">
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
                  <span className="truncate">{activeSubagentSession.label}</span>
                </div>
              </div>
              {activeSubagentSession.tmpNotebookPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 shrink-0 gap-1.5 px-2"
                  onClick={() => handleOpenSubagentReport(activeSubagentSession.tmpNotebookPath!)}
                  aria-label="Open sub-agent tmp file"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Open tmp file</span>
                </Button>
              )}
            </div>
          </div>

          <ChatBody
            key={`subagent-chat-body-${activeSubagentToolCallId}`}
            viewKey={`subagent:${activeSubagentToolCallId}`}
            messages={activeSubagentSession.messages}
            error={undefined}
            isLoading={activeSubagentSession.status === "running"}
            onUserMessageClick={() => { }}
            editingState={null}
          />

          <ChatTextbox
            input=""
            handleInputChange={() => { }}
            handleSubmit={(event) => event.preventDefault()}
            onStop={() => { }}
            isLoading={false}
            interactionMode={interactionMode}
            selectedModel={selectedModel}
            editingState={null}
            textareaRef={textareaRef}
            onInteractionModeChange={handleInteractionModeChange}
            onModelChange={handleModelChange}
            onCancelEdit={() => { }}
            models={modelsWithAccess}
            pinnedModelIds={pinnedModelIds}
            onReorderPinned={handleReorderPinned}
            onOpenModelsSettings={() => openWithTab("models")}
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
          />
        </>
      ) : (
        <>
          <ChatToolbar
            currentChat={currentChat}
            isEditingTitle={isEditingTitle}
            editedTitle={editedTitle}
            chats={chats}
            currentChatId={currentChatId}
            onTitleDoubleClick={handleTitleDoubleClick}
            onTitleChange={setEditedTitle}
            onTitleSave={saveTitle}
            onTitleCancel={() => setIsEditingTitle(false)}
            onNewChat={createNewChat}
            onHistorySelect={handleHistorySelect}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
          />

          <ChatBody
            key="main-chat-body"
            viewKey={`main:${effectiveChatId ?? "no-chat"}`}
            messages={messages}
            error={error}
            isLoading={isLoading}
            onUserMessageClick={handleUserMessageClick}
            editingState={editingState}
            showKernelPrompt={showKernelPrompt}
            onOpenKernelDropdown={onOpenKernelDropdown}
            onDismissKernelPrompt={() => setShowKernelPrompt(false)}
            pendingApprovalIds={pendingApprovalIds}
            onApprove={handleApprove}
            onReject={handleReject}
            toolApprovalMode={toolApprovalMode}
            onToolApprovalModeChange={handleToolApprovalModeChange}
            subagentProgress={subagentProgress}
            subagentReportPaths={subagentReportPaths}
            onOpenSubagentChat={setActiveSubagentToolCallId}
            onOpenSubagentReport={handleOpenSubagentReport}
          />

          <ChatTextbox
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={customHandleSubmit}
            onStop={handleStopGeneration}
            isLoading={isInputLocked}
            interactionMode={interactionMode}
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
            onOpenProvidersSettings={handleOpenProvidersSettings}
            onConfigureProvider={handleConfigureProvider}
            selectedModelProvider={modelInfo?.provider}
            modelSettings={modelSettingsMap[selectedModel] ?? {}}
            onModelSettingsChange={(settings) =>
              handleModelSettingsChange(selectedModel, settings)
            }
            activeSlashCommand={activeSlashCommand}
            extraSlashCommands={[...subagentSlashCommands, ...skillSlashCommands]}
            onOpenSlashDefinition={handleOpenSlashDefinition}
            hasMessages={messages.length > 0}
            contextEstimate={contextEstimate}
            onCompact={runCompaction}
            isOverContextBudget={isCompacting}
            referenceOptions={referenceOptions}
            references={draftReferences}
            onReferencesChange={setDraftReferences}
            onReferenceSearch={refreshReferenceSearch}
            disabledReferenceTabs={disabledReferenceTabs}
          />
        </>
      )}

      <AutoRunConfirmDialog
        open={autoRunConfirmOpen}
        onOpenChange={setAutoRunConfirmOpen}
        onConfirm={handleAutoRunConfirm}
      />

      <AlertDialog
        open={stopConfirmAction !== null}
        onOpenChange={(open) => { if (!open) setStopConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop current generation?</AlertDialogTitle>
            <AlertDialogDescription>
              A response is still being generated. Switching will stop it. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStopConfirmAction(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleStopConfirm}>
              Stop and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
