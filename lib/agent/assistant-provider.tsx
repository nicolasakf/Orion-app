"use client";

/**
 * AssistantProvider - React context for the AI Assistant
 *
 * Provides access to:
 * - KernelSidecar for runtime introspection
 * - RuntimeContextStore for cached state
 * - JupyterToolSet for agent tool execution (client-side)
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { NotebookType } from "@/lib/types";
import { KernelSidecar, type VariableSummary, type TrafficLightState } from "./kernel-sidecar";
import { RuntimeContextStore, type RuntimeSnapshot } from "./runtime-store";
import { createJupyterTools, type JupyterToolSet, type TerminalShell } from "./tools";
import type { OrionToolName } from "./tool-schemas";
import { TerminalPool } from "@/lib/shell/terminal-pool";
import { guardToolResult } from "./tool-output-guard";
import {
  ORION_AGENT_FILE_MODIFIED_EVENT,
  type OpenDocumentKind,
  type OpenDocumentSaveResult,
  type OpenDocumentSnapshotProvider,
} from "./open-document-snapshots";
import {
  ApiEditCheckpointRecorder,
  type EditCheckpointContext,
} from "./edit-checkpoint-recorder";
import {
  logToolDispatch,
  logToolResult,
  logToolError,
} from "@/lib/logging/dev-logger-client";
import { SkillRegistry } from "@/lib/skills/skill-registry";
import { isSkillDefinitionPath } from "@/lib/skills/paths";
import type { SkillInfo } from "@/lib/skills/types";
import { isRuleFilePath, RuleRegistry, type AgentRule } from "@/lib/agent/rules";
import {
  SubagentRegistry,
  buildSubagentTmpNotebookPath,
  type SubagentDefinition,
} from "@/lib/agent/subagents";
import { detectClientPlatformOs, isJupyterServerHostLocal } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Resolve the shell family used by Jupyter terminals.
 *
 * Server-reported OS wins because terminals execute on the Jupyter host. When
 * the server does not report OS metadata but the URL is loopback, the browser
 * OS is a reliable local fallback.
 */
function resolveJupyterTerminalShell(options: {
  serverInfo: JupyterServerInfo | null;
  jupyterServerIsLocal: boolean;
}): TerminalShell {
  const serverOs = options.serverInfo?.os?.toLowerCase() ?? "";
  if (
    serverOs === "nt" ||
    serverOs === "win32" ||
    serverOs.includes("windows")
  ) {
    return "powershell";
  }
  if (
    serverOs === "posix" ||
    serverOs.includes("linux") ||
    serverOs.includes("darwin") ||
    serverOs.includes("mac")
  ) {
    return "posix";
  }
  if (options.jupyterServerIsLocal && detectClientPlatformOs() === "windows") {
    return "powershell";
  }
  return "posix";
}

/** Returns true when a tool can write notebook state through the ContentsManager. */
function isNotebookMutationTool(toolName: OrionToolName): boolean {
  return (
    toolName === "insert_cell" ||
    toolName === "delete_cell" ||
    toolName === "overwrite_cell_source" ||
    toolName === "edit_orion_metadata" ||
    toolName === "execute_cell"
  );
}

/** Extracts a string property from sanitized tool parameters. */
function getStringParam(params: unknown, key: string): string | null {
  if (!params || typeof params !== "object") return null;
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export interface AssistantContextValue {
  // State
  isReady: boolean;
  toolsReady: boolean;
  trafficLight: TrafficLightState;
  runtimeSnapshot: RuntimeSnapshot | null;
  /** Current chat ID for dev logging (one log file per chat session) */
  chatId: string | null;
  /** TerminalPool managing all terminal sessions; null until kernelService is connected */
  terminalPool: TerminalPool | null;
  /** All available skills (built-in + workspace); passed to the server for system prompt injection */
  availableSkills: SkillInfo[];
  /** All available notebook-defined subagents; passed to the server for system prompt injection */
  availableSubagents: SubagentDefinition[];
  /** AGENTS.md / CLAUDE.md rules loaded for this workspace. */
  availableRules: AgentRule[];
  /** Basic environment info fetched from the Jupyter server on connect; null until connected */
  serverInfo: JupyterServerInfo | null;
  /** True when the configured Jupyter server URL is loopback (client-derived). */
  jupyterServerIsLocal: boolean;

  // Actions
  inspectVariable: (name: string) => Promise<VariableSummary>;
  listVariables: () => Promise<
    { name: string; type: string; shape?: number[]; length?: number; repr?: string }[]
  >;
  listDirectoryEntries: (directoryPath: string) => Promise<
    { name: string; path: string; type: "file" | "folder"; size?: number }[]
  >;
  refreshVariables: (names?: string[]) => Promise<void>;
  /** Trigger a workspace skill refresh (e.g. after creating a new SKILL.md) */
  refreshSkills: () => Promise<void>;
  /** Trigger a notebook-defined subagent refresh. */
  refreshSubagents: () => Promise<void>;
  /** Re-scan AGENTS.md / CLAUDE.md rules. */
  refreshRules: () => Promise<void>;

  /**
   * Execute a named tool with the given parameters.
   * Used by the chat UI to execute agent tool calls client-side.
   */
  executeToolCall: (
    toolName: OrionToolName,
    params: unknown,
    checkpointContext?: EditCheckpointContext
  ) => Promise<unknown>;

  /** Create a writable tmp copy of a subagent source notebook for one delegate run. */
  createTmpSubagentNotebookCopy: (subagent: SubagentDefinition, runId: string) => Promise<string>;

  /**
   * Register the active notebook with the NotebookManager so cell tools can
   * find it. Call this once when a notebook is opened.
   */
  registerNotebook: (notebookPath: string, kernelId?: string) => Promise<void>;

  // Setters for external state
  setNotebook: (notebook: NotebookType | null) => void;
  setChatId: (id: string | null) => void;
}

export type AssistantChatContextValue = Pick<
  AssistantContextValue,
  | "toolsReady"
  | "terminalPool"
  | "availableSkills"
  | "availableSubagents"
  | "availableRules"
  | "listVariables"
  | "listDirectoryEntries"
  | "serverInfo"
  | "jupyterServerIsLocal"
  | "executeToolCall"
  | "createTmpSubagentNotebookCopy"
  | "setChatId"
>;

const AssistantContext = createContext<AssistantContextValue | null>(null);
const AssistantChatContext = createContext<AssistantChatContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface AssistantProviderProps {
  children: React.ReactNode;
  kernelService: KernelService | null;
  notebook?: NotebookType | null;
  /** Called after the agent modifies the notebook (insert/overwrite/delete cells) */
  onAgentNotebookChange?: () => void;
  /** Current workspace directory (relative to Jupyter root); forwarded to glob/grep tools to guarantee correct cwd */
  workspaceDirectory?: string;
  /** Supplies live active editor content for read/edit tools before they fall back to disk. */
  openDocumentSnapshots?: OpenDocumentSnapshotProvider;
}

export function AssistantProvider({
  children,
  kernelService,
  notebook: initialNotebook,
  onAgentNotebookChange: onAgentNotebookChangeProp,
  workspaceDirectory,
  openDocumentSnapshots,
}: AssistantProviderProps) {
  // Core instances
  const sidecarRef = useRef<KernelSidecar | null>(null);
  const runtimeStoreRef = useRef<RuntimeContextStore>(new RuntimeContextStore());
  const toolSetRef = useRef<JupyterToolSet | null>(null);
  const terminalPoolRef = useRef<TerminalPool | null>(null);
  const skillRegistryRef = useRef<SkillRegistry>(new SkillRegistry());
  const ruleRegistryRef = useRef<RuleRegistry>(new RuleRegistry());
  const subagentRegistryRef = useRef<SubagentRegistry>(new SubagentRegistry());
  const checkpointRecorderRef = useRef(new ApiEditCheckpointRecorder());

  // State
  const [isReady, setIsReady] = useState(false);
  const [toolsReady, setToolsReady] = useState(false);
  const [trafficLight, setTrafficLight] = useState<TrafficLightState>("red");
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [notebook, setNotebook] = useState<NotebookType | null>(initialNotebook || null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>(
    () => skillRegistryRef.current.getAll()
  );
  const [availableSubagents, setAvailableSubagents] = useState<SubagentDefinition[]>(
    () => subagentRegistryRef.current.getAll()
  );
  const [availableRules, setAvailableRules] = useState<AgentRule[]>(
    () => ruleRegistryRef.current.getAll()
  );
  const [serverInfo, setServerInfo] = useState<JupyterServerInfo | null>(null);
  // Ref so tool constructors can read the latest chatId without stale closures
  const chatIdRef = useRef<string | null>(null);
  // Ref so terminal tools can read latest server OS metadata without stale closures
  const serverInfoRef = useRef<JupyterServerInfo | null>(null);
  // Ref so glob/grep tools always read the latest workspaceDirectory without stale closures
  const workspaceDirRef = useRef<string | undefined>(workspaceDirectory);
  // Expose the pool via context so TerminalPanel can subscribe to pool state
  const [terminalPool, setTerminalPool] = useState<TerminalPool | null>(null);
  // Use a ref so the executeToolCall callback always has the latest value
  const onAgentNotebookChangeRef = useRef(onAgentNotebookChangeProp);
  const openDocumentSnapshotsRef = useRef<OpenDocumentSnapshotProvider | undefined>(
    openDocumentSnapshots
  );
  useEffect(() => {
    onAgentNotebookChangeRef.current = onAgentNotebookChangeProp;
  }, [onAgentNotebookChangeProp]);

  useEffect(() => {
    openDocumentSnapshotsRef.current = openDocumentSnapshots;
  }, [openDocumentSnapshots]);

  // Update notebook when prop changes
  useEffect(() => {
    setNotebook(initialNotebook || null);
  }, [initialNotebook]);

  // Keep chatIdRef in sync so CreateTerminalTool always reads the latest chatId
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Keep serverInfoRef in sync so BashTool chooses the active terminal shell
  useEffect(() => {
    serverInfoRef.current = serverInfo;
  }, [serverInfo]);

  // Keep workspaceDirRef in sync for tools that need the current workspace directory
  useEffect(() => {
    workspaceDirRef.current = workspaceDirectory;
  }, [workspaceDirectory]);

  // Initialize sidecar, terminal pool, and tool set when kernel service changes
  useEffect(() => {
    if (!kernelService) {
      sidecarRef.current = null;
      toolSetRef.current = null;
      terminalPoolRef.current?.dispose();
      terminalPoolRef.current = null;
      setTerminalPool(null);
      setIsReady(false);
      setToolsReady(false);
      setTrafficLight("red");
      return;
    }

    // Create new sidecar
    const sidecar = new KernelSidecar(kernelService);
    sidecarRef.current = sidecar;

    // Create terminal pool for this kernel session
    const pool = new TerminalPool(kernelService);
    terminalPoolRef.current = pool;
    setTerminalPool(pool);

    // Create the tool set (shared NotebookManager, pool, and kernel access)
    toolSetRef.current = createJupyterTools(
      kernelService,
      sidecar,
      pool,
      () => chatIdRef.current,
      () => workspaceDirRef.current,
      () =>
        resolveJupyterTerminalShell({
          serverInfo: serverInfoRef.current,
          jupyterServerIsLocal: isJupyterServerHostLocal(
            kernelService.getServerSettings().baseUrl
          ),
        }),
      {
        getTextSnapshot: (path) =>
          openDocumentSnapshotsRef.current?.getTextSnapshot(path) ?? null,
        getNotebookSnapshot: (path) =>
          openDocumentSnapshotsRef.current?.getNotebookSnapshot(path) ?? null,
        saveOpenDocumentIfDirty: (path, kind) =>
          openDocumentSnapshotsRef.current?.saveOpenDocumentIfDirty(path, kind) ??
          Promise.resolve({ status: "not-open" }),
      },
      checkpointRecorderRef.current
    );
    setToolsReady(true);

    // Subscribe to traffic light changes
    const unsubTraffic = sidecar.onTrafficLightChange((state) => {
      setTrafficLight(state);
    });

    // Subscribe to messages for runtime store
    const unsubMessages = sidecar.onMessage((msg) => {
      runtimeStoreRef.current.processMessage(msg);
    });

    // Subscribe to runtime store changes
    const unsubStore = runtimeStoreRef.current.onChange((snapshot) => {
      setRuntimeSnapshot(snapshot);
    });

    // Bootstrap inspector
    sidecar.ensureInspectorBootstrapped().then((success) => {
      setIsReady(success);
      if (success) {
        setTrafficLight(sidecar.getTrafficLightState());
      }
    });

    return () => {
      unsubTraffic();
      unsubMessages();
      unsubStore();
      sidecar.reset();
      pool.dispose();
      terminalPoolRef.current = null;
      toolSetRef.current = null;
      setTerminalPool(null);
      setToolsReady(false);
    };
  }, [kernelService]);

  /**
   * Keep the skill registry aligned with the Jupyter ContentsManager and workspace root.
   * Skills load from user `.agents/skills` then `.orion/skills`, then (with a workspace)
   * `<workspaceRoot>/.agents|orion/skills` — `.orion` overrides `.agents` in
   * the same scope; later paths override earlier. If the kernel connects before a workspace
   * is chosen, we only scan after `workspaceDirectory` updates — this effect must depend on both.
   */
  useEffect(() => {
    const registry = skillRegistryRef.current;
    if (!kernelService) {
      registry.setContentsManager(null, "");
      void registry.refresh().then(() => {
        setAvailableSkills(registry.getAll());
      });
      return;
    }
    registry.setContentsManager(
      kernelService.getContentsManager(),
      workspaceDirectory ?? ""
    );
    void registry.refresh().then(() => {
      setAvailableSkills(registry.getAll());
    });
  }, [kernelService, workspaceDirectory]);

  /**
   * Keep the notebook-defined subagent registry aligned with the Jupyter
   * ContentsManager and workspace root. Subagents default to `.agents/subagents`;
   * `.orion/subagents` overrides same id. User-level loads both trees (agents then orion),
   * then project `<workspaceRoot>/.agents/subagents` then `<workspaceRoot>/.orion/subagents`.
   */
  useEffect(() => {
    const registry = subagentRegistryRef.current;
    if (!kernelService) {
      registry.setContentsManager(null, "");
      void registry.refresh().then(() => {
        setAvailableSubagents(registry.getAll());
      });
      return;
    }
    registry.setContentsManager(
      kernelService.getContentsManager(),
      workspaceDirectory ?? ""
    );
    void registry.refresh().then(() => {
      setAvailableSubagents(registry.getAll());
    });
  }, [kernelService, workspaceDirectory]);

  /**
   * Keep rule files aligned with the active Jupyter ContentsManager and
   * workspace root. Rules are loaded from root/workspace AGENTS.md with
   * CLAUDE.md fallback at each scope.
   */
  useEffect(() => {
    const registry = ruleRegistryRef.current;
    if (!kernelService) {
      registry.setContentsManager(null, "");
      void registry.refresh().then(() => {
        setAvailableRules(registry.getAll());
      });
      return;
    }
    registry.setContentsManager(
      kernelService.getContentsManager(),
      workspaceDirectory ?? ""
    );
    void registry.refresh().then(() => {
      setAvailableRules(registry.getAll());
    });
  }, [kernelService, workspaceDirectory]);

  // Reset runtime store on kernel disconnect
  useEffect(() => {
    if (!kernelService) {
      runtimeStoreRef.current.reset();
      setRuntimeSnapshot(null);
    }
  }, [kernelService]);

  // Fetch Jupyter server info (OS, Python version, etc.) on connect
  useEffect(() => {
    if (!kernelService) {
      setServerInfo(null);
      return;
    }
    let cancelled = false;
    void kernelService.fetchServerInfo().then((info) => {
      if (!cancelled) setServerInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [kernelService]);

  // ============================================================================
  // Actions
  // ============================================================================

  const inspectVariable = useCallback(async (name: string): Promise<VariableSummary> => {
    if (!sidecarRef.current) {
      return {
        name,
        type: "unknown",
        error: "Assistant not initialized",
        timestamp: Date.now(),
      };
    }

    const summary = await sidecarRef.current.inspectVariable(name);

    if (!summary.error) {
      runtimeStoreRef.current.cacheVariableSummary(summary);
    }

    return summary;
  }, []);

  const listVariables = useCallback(async () => {
    if (!sidecarRef.current) {
      return [];
    }
    return sidecarRef.current.listVariables();
  }, []);

  const listDirectoryEntries = useCallback(async (directoryPath: string) => {
    if (!kernelService) {
      return [];
    }

    const contents = kernelService.getContentsManager();
    const model = await contents.get(directoryPath || "", { content: true });
    if (model.type !== "directory" || !Array.isArray(model.content)) {
      return [];
    }

    return model.content
      .filter((entry): entry is { name: string; path: string; type: string; size?: number } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.name === "string" &&
        typeof entry.path === "string" &&
        (entry.type === "file" || entry.type === "directory")
      )
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type === "directory" ? "folder" as const : "file" as const,
        size: entry.size,
      }));
  }, [kernelService]);

  const refreshVariables = useCallback(async (names?: string[]) => {
    if (!sidecarRef.current) return;

    const variablesToRefresh =
      names || (await sidecarRef.current.listVariables()).map((v) => v.name);

    const toInspect = variablesToRefresh.slice(0, 20);

    await Promise.all(
      toInspect.map(async (name) => {
        try {
          const summary = await sidecarRef.current!.inspectVariable(name);
          if (!summary.error) {
            runtimeStoreRef.current.cacheVariableSummary(summary);
          }
        } catch (e) {
          console.warn(`Failed to refresh variable ${name}:`, e);
        }
      })
    );
  }, []);

  /**
   * Recursively converts null values to undefined in a plain object.
   * Some models still send null for absent fields; normalizing avoids brittle
   * tool implementations.
   */
  const sanitizeToolParams = useCallback((obj: unknown): unknown => {
    if (obj === null) return undefined;
    if (Array.isArray(obj)) return obj.map(sanitizeToolParams);
    if (typeof obj === "object" && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
          k,
          sanitizeToolParams(v),
        ])
      );
    }
    return obj;
  }, []);

  /**
   * Re-scan the workspace for SKILL.md files and update the available skills list.
   */
  const refreshSkills = useCallback(async (): Promise<void> => {
    const registry = skillRegistryRef.current;
    await registry.refresh();
    setAvailableSkills(registry.getAll());
  }, []);

  /** Re-scan notebook-defined subagents and update the available subagent list. */
  const refreshSubagents = useCallback(async (): Promise<void> => {
    const registry = subagentRegistryRef.current;
    await registry.refresh();
    setAvailableSubagents(registry.getAll());
  }, []);

  /** Re-scan AGENTS.md / CLAUDE.md rules and update the available rules list. */
  const refreshRules = useCallback(async (): Promise<void> => {
    const registry = ruleRegistryRef.current;
    await registry.refresh();
    setAvailableRules(registry.getAll());
  }, []);

  useEffect(() => {
    const handleSkillsChanged = () => {
      void refreshSkills();
    };
    const handleSubagentsChanged = () => {
      void refreshSubagents();
    };
    const handleRulesChanged = () => {
      void refreshRules();
    };

    window.addEventListener("orion:skills-changed", handleSkillsChanged);
    window.addEventListener("orion:subagents-changed", handleSubagentsChanged);
    window.addEventListener("orion:rules-changed", handleRulesChanged);
    return () => {
      window.removeEventListener("orion:skills-changed", handleSkillsChanged);
      window.removeEventListener("orion:subagents-changed", handleSubagentsChanged);
      window.removeEventListener("orion:rules-changed", handleRulesChanged);
    };
  }, [refreshSkills, refreshRules, refreshSubagents]);

  const ensureJupyterDirectory = useCallback(
    async (directoryPath: string): Promise<void> => {
      if (!kernelService) {
        throw new Error("Cannot create sub-agent tmp notebook without a Jupyter server.");
      }
      const contents = kernelService.getContentsManager();
      const segments = directoryPath.split("/").filter(Boolean);
      let current = "";

      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        try {
          await contents.get(current, { content: false });
        } catch {
          await contents.save(current, {
            type: "directory",
            format: "json",
            content: null,
          } as any);
        }
      }
    },
    [kernelService]
  );

  /**
   * Copy a reusable subagent notebook definition to a writable tmp notebook for
   * a single run. The source definition is never modified during delegation.
   */
  const createTmpSubagentNotebookCopy = useCallback(
    async (subagent: SubagentDefinition, runId: string): Promise<string> => {
      if (!kernelService) {
        throw new Error("Cannot create sub-agent tmp notebook without a Jupyter server.");
      }
      const contents = kernelService.getContentsManager();
      const tmpDirectory = `${subagent.baseDirectory}/tmp/${subagent.name}`;
      const tmpPath = buildSubagentTmpNotebookPath({
        baseDirectory: subagent.baseDirectory,
        name: subagent.name,
        runId,
      });

      await ensureJupyterDirectory(tmpDirectory);
      await contents.save(tmpPath, {
        type: "notebook",
        format: "json",
        content: subagent.notebook,
      } as any);

      return tmpPath;
    },
    [ensureJupyterDirectory, kernelService]
  );

  /**
   * Saves the active dirty editor buffer before tools write to the same path.
   */
  const saveOpenDocumentBeforeMutation = useCallback(
    async (
      toolSet: JupyterToolSet,
      toolName: OrionToolName,
      sanitizedParams: unknown,
    ): Promise<OpenDocumentSaveResult> => {
      let path: string | null = null;
      let kind: OpenDocumentKind | null = null;

      if (toolName === "edit_file") {
        path = getStringParam(sanitizedParams, "filePath");
        kind = "text";
      } else if (isNotebookMutationTool(toolName)) {
        kind = "notebook";
        if (toolName === "edit_orion_metadata") {
          const notebookId = getStringParam(sanitizedParams, "notebookId")?.trim();
          path = notebookId
            ? toolSet.notebookManager.getNotebookPath(notebookId)
            : toolSet.notebookManager.getCurrentNotebookPath();
        } else {
          path = toolSet.notebookManager.getCurrentNotebookPath();
        }
      }

      if (!path || !kind) return { status: "not-open" };

      return (
        (await openDocumentSnapshotsRef.current?.saveOpenDocumentIfDirty(
          path,
          kind,
        )) ?? { status: "not-open" }
      );
    },
    [],
  );

  /**
   * Execute a named agent tool client-side using the JupyterToolSet.
   * Tool results are serialized to strings (JSON when needed).
   */
  const executeToolCall = useCallback(
    async (
      toolName: OrionToolName,
      params: unknown,
      checkpointContext?: EditCheckpointContext
    ): Promise<unknown> => {
      // Handle kernel-free tools before checking for the Jupyter tool set
      if (toolName === "load_skill") {
        const { name } = (sanitizeToolParams(params) ?? {}) as { name?: string };
        if (!name) return "[ERROR] load_skill requires a 'name' argument.";

        const registry = skillRegistryRef.current;
        const skill = registry.get(name);
        if (!skill) {
          const available = registry.getAll().map((s) => s.name).join(", ");
          return `[ERROR] Skill "${name}" not found. Available skills: ${available || "none"}`;
        }
        return skill.content;
      }

      if (toolName === "web_fetch" || toolName === "web_search") {
        const requestId = typeof crypto !== "undefined" ? crypto.randomUUID() : `tool-${Date.now()}`;
        const startMs = Date.now();
        const sanitizedParams = sanitizeToolParams(params);
        const path = toolName === "web_fetch" ? "/api/tools/web-fetch" : "/api/tools/web-search";

        logToolDispatch({ requestId, toolName, params }, chatIdRef.current);

        try {
          const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sanitizedParams ?? {}),
          });
          const data = await response.json().catch(() => ({})) as { output?: unknown; error?: unknown };
          if (!response.ok) {
            throw new Error(typeof data.error === "string" ? data.error : `Request failed with status ${response.status}`);
          }

          const finalResult = guardToolResult(
            typeof data.output === "string" ? data.output : JSON.stringify(data.output ?? "")
          ) as string;
          const durationMs = Date.now() - startMs;
          logToolResult({ requestId, toolName, params, result: finalResult, durationMs }, chatIdRef.current);
          return finalResult;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const durationMs = Date.now() - startMs;
          logToolError({ requestId, toolName, params, error: message, durationMs }, chatIdRef.current);
          console.error(`Tool execution error [${toolName}]:`, err);
          return guardToolResult({ error: `Tool execution failed: ${message}` });
        }
      }

      const toolSet = toolSetRef.current;
      if (!toolSet) {
        return { error: "Tool set not initialized. Please connect a kernel first." };
      }

      /** Tools that modify the notebook structure */
      const MODIFYING_TOOLS: Set<OrionToolName> = new Set([
        "use_notebook",
        "insert_cell",
        "delete_cell",
        "overwrite_cell_source",
        "edit_orion_metadata",
        "execute_cell",
      ]);

      const requestId = typeof crypto !== "undefined" ? crypto.randomUUID() : `tool-${Date.now()}`;
      const startMs = Date.now();

      logToolDispatch({ requestId, toolName, params }, chatIdRef.current);

      // Convert null values to undefined so tool implementations can use
      // destructuring defaults
      const sanitizedParams = sanitizeToolParams(params);

      try {
        const preSaveResult = await saveOpenDocumentBeforeMutation(
          toolSet,
          toolName,
          sanitizedParams,
        );
        if (preSaveResult.status === "error") {
          const finalResult = guardToolResult(
            `[ERROR] Could not save the open editor buffer before running ${toolName}. ${preSaveResult.message ?? "No changes were made."}`,
          ) as string;
          const durationMs = Date.now() - startMs;
          logToolResult(
            { requestId, toolName, params, result: finalResult, durationMs },
            chatIdRef.current,
          );
          return finalResult;
        }

        const executeWithCheckpointContext = async <
          TTool extends { setCheckpointContext: (context: EditCheckpointContext | null) => void; execute: (params: any) => Promise<string | string[]> },
        >(
          tool: TTool,
          toolParams: unknown
        ): Promise<string | string[]> => {
          tool.setCheckpointContext(checkpointContext ?? null);
          try {
            return await tool.execute(toolParams as any);
          } finally {
            tool.setCheckpointContext(null);
          }
        };

        let result: string | string[];

        switch (toolName) {
          case "list_kernels":
            result = await toolSet.tools.listKernels.execute();
            break;
          case "shutdown_kernel":
            result = await toolSet.tools.shutdownKernel.execute(sanitizedParams as any);
            break;
          case "use_notebook":
            result = await toolSet.tools.useNotebook.execute(sanitizedParams as any);
            break;
          case "read_notebook":
            result = await toolSet.tools.readNotebook.execute(sanitizedParams as any);
            break;
          case "restart_notebook":
            result = await toolSet.tools.restartNotebook.execute(sanitizedParams as any);
            break;
          case "read_cell":
            result = await toolSet.tools.readCell.execute(sanitizedParams as any);
            break;
          case "insert_cell":
            result = await executeWithCheckpointContext(toolSet.tools.insertCell, sanitizedParams);
            break;
          case "delete_cell":
            result = await executeWithCheckpointContext(toolSet.tools.deleteCell, sanitizedParams);
            break;
          case "overwrite_cell_source":
            result = await executeWithCheckpointContext(toolSet.tools.overwriteCellSource, sanitizedParams);
            break;
          case "edit_orion_metadata":
            result = await toolSet.tools.editOrionMetadata.execute(sanitizedParams as any);
            break;
          case "execute_cell":
            result = await toolSet.tools.executeCell.execute(sanitizedParams as any);
            break;
          case "execute_code":
            result = await toolSet.tools.executeCode.execute(sanitizedParams as any);
            break;
          case "bash":
            result = await toolSet.tools.bash.execute(sanitizedParams as any);
            break;
          case "await_command":
            result = await toolSet.tools.awaitCommand.execute(sanitizedParams as any);
            break;
          case "read_file":
            result = await toolSet.tools.readFile.execute(sanitizedParams as any);
            break;
          case "edit_file":
            result = await executeWithCheckpointContext(toolSet.tools.editFile, sanitizedParams);
            break;
          case "read_cell_output": {
            // May return a MultimodalToolResult object (for image outputs) instead of a plain string.
            // Pass it through as-is so addToolOutput sends the object; toModelOutput in the
            // tool schema converts it to multimodal content on the server side.
            const cellOutputResult = await toolSet.tools.readCellOutput.execute(sanitizedParams as any);
            const guardedCellOutputResult = guardToolResult(cellOutputResult);
            const durationMsCellOutput = Date.now() - startMs;
            logToolResult({
              requestId,
              toolName,
              params,
              result: String(guardedCellOutputResult),
              durationMs: durationMsCellOutput,
            }, chatIdRef.current);
            return guardedCellOutputResult;
          }
          default:
            return { error: `Unknown tool: ${toolName}` };
        }

        const finalResult = guardToolResult(
          Array.isArray(result) ? result.join("\n") : result
        ) as string;
        const durationMs = Date.now() - startMs;

        logToolResult({ requestId, toolName, params, result: finalResult, durationMs }, chatIdRef.current);

        // Notify page if the notebook was structurally modified
        if (MODIFYING_TOOLS.has(toolName)) {
          onAgentNotebookChangeRef.current?.();
        }

        if (toolName === "edit_file") {
          const filePath = (sanitizedParams as { filePath?: unknown } | undefined)?.filePath;
          if (typeof filePath === "string" && isSkillDefinitionPath(filePath)) {
            await refreshSkills();
          }
          if (typeof filePath === "string" && isRuleFilePath(filePath)) {
            await refreshRules();
          }
          if (
            typeof filePath === "string" &&
            typeof finalResult === "string" &&
            !finalResult.startsWith("[ERROR]")
          ) {
            window.dispatchEvent(
              new CustomEvent(ORION_AGENT_FILE_MODIFIED_EVENT, {
                detail: { path: filePath },
              })
            );
          }
        }

        return finalResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        logToolError({ requestId, toolName, params, error: message, durationMs }, chatIdRef.current);
        console.error(`Tool execution error [${toolName}]:`, err);
        return guardToolResult({ error: `Tool execution failed: ${message}` });
      }
    },
    [refreshRules, refreshSkills, sanitizeToolParams, saveOpenDocumentBeforeMutation]
  );

  /**
   * Register the active notebook with the agent's NotebookManager.
   * Should be called whenever a new notebook is opened in the UI.
   */
  const registerNotebook = useCallback(
    async (notebookPath: string, kernelId?: string): Promise<void> => {
      const toolSet = toolSetRef.current;
      if (!toolSet) return;

      try {
        await toolSet.tools.useNotebook.execute({
          notebookName: "active",
          notebookPath,
          mode: "connect",
          kernelId: kernelId ?? "",
        });
      } catch (err) {
        // Non-fatal — the agent can still call use_notebook itself
        console.warn("Failed to auto-register notebook:", err);
      }
    },
    []
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const jupyterServerIsLocal = kernelService
    ? isJupyterServerHostLocal(kernelService.getServerSettings().baseUrl)
    : false;

  const contextValue = useMemo<AssistantContextValue>(
    () => ({
      isReady,
      toolsReady,
      trafficLight,
      runtimeSnapshot,
      chatId,
      terminalPool,
      availableSkills,
      availableSubagents,
      availableRules,
      serverInfo,
      jupyterServerIsLocal,
      inspectVariable,
      listVariables,
      listDirectoryEntries,
      refreshVariables,
      executeToolCall,
      createTmpSubagentNotebookCopy,
      registerNotebook,
      refreshSkills,
      refreshSubagents,
      refreshRules,
      setNotebook,
      setChatId,
    }),
    [
      isReady,
      toolsReady,
      trafficLight,
      runtimeSnapshot,
      chatId,
      terminalPool,
      availableSkills,
      availableSubagents,
      availableRules,
      serverInfo,
      jupyterServerIsLocal,
      inspectVariable,
      listVariables,
      listDirectoryEntries,
      refreshVariables,
      executeToolCall,
      createTmpSubagentNotebookCopy,
      registerNotebook,
      refreshSkills,
      refreshSubagents,
      refreshRules,
    ]
  );

  const chatContextValue = useMemo<AssistantChatContextValue>(
    () => ({
      toolsReady,
      terminalPool,
      availableSkills,
      availableSubagents,
      availableRules,
      serverInfo,
      jupyterServerIsLocal,
      executeToolCall,
      listVariables,
      listDirectoryEntries,
      createTmpSubagentNotebookCopy,
      setChatId,
    }),
    [
      toolsReady,
      terminalPool,
      availableSkills,
      availableSubagents,
      availableRules,
      serverInfo,
      jupyterServerIsLocal,
      executeToolCall,
      listVariables,
      listDirectoryEntries,
      createTmpSubagentNotebookCopy,
    ]
  );

  return (
    <AssistantContext.Provider value={contextValue}>
      <AssistantChatContext.Provider value={chatContextValue}>
        {children}
      </AssistantChatContext.Provider>
    </AssistantContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access the AI Assistant context
 */
export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within an AssistantProvider");
  }
  return context;
}

/**
 * Hook to optionally access the AI Assistant context (returns null if not in provider)
 */
export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(AssistantContext);
}

/**
 * Hook to access the chat/tool subset of assistant state without subscribing
 * to high-frequency runtime snapshots.
 */
export function useAssistantChatOptional(): AssistantChatContextValue | null {
  return useContext(AssistantChatContext);
}
