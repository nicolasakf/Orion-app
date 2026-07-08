/**
 * Orion Subagent Framework — Core Types
 *
 * These types describe notebook-defined subagents discovered from the Jupyter
 * filesystem (`.agents/subagents` and `.orion/subagents`), the options passed
 * to the runner per invocation, and the result returned to the parent agent.
 */

import type { OrionToolName } from "@/lib/agent/tool-schemas";
import type { ProviderId } from "@/lib/agent/model-gateway-types";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { AgentRule } from "@/lib/agent/rules";
import type { PlatformOS } from "@/lib/utils";
import type { NotebookType } from "@/lib/types";
import type { UIMessage } from "ai";

// ============================================================================
// Sub-agent identity
// ============================================================================

/** Notebook-defined sub-agent identifier, derived from the `.agent.ipynb` filename. */
export type SubagentType = string;

// ============================================================================
// Sub-agent definition (held in the registry)
// ============================================================================

export interface SubagentOptions {
  /** Model catalog id used for this sub-agent instead of the parent chat model. */
  model?: string;

  /** When true, the model should not see or invoke this sub-agent automatically. */
  disableModelInvocation: boolean;
}

export interface SubagentDefinition {
  /** Slash-command and delegate identifier, derived from the `.agent.ipynb` filename. */
  name: string;

  /** Human-readable label, extracted from the first markdown H1 cell. */
  label: string;

  /** Short description shown in the UI and injected into parent prompts. */
  description: string;

  /** Sub-agent system prompt, extracted from the third markdown cell. */
  systemPrompt: string;

  /** Source notebook path relative to the Jupyter contents root. */
  location: string;

  /** Base directory containing the source notebook. Used as the tmp copy root. */
  baseDirectory: string;

  /** Parsed source notebook definition. The runner copies this before use. */
  notebook: NotebookType;

  /** Where the definition originates from. Project definitions override user ones. */
  source: "user" | "project";

  /** Optional notebook-level runtime/discovery options. */
  options?: SubagentOptions;
}

/** Sub-agent prompt payload sent to /api/chat for isolated sub-agent steps. */
export interface SubagentPromptPayload {
  name: string;
  label: string;
  originalNotebookPath: string;
  tmpNotebookPath: string;
  systemPrompt: string;
}

// ============================================================================
// Per-call run options (passed to the runner for each invocation)
// ============================================================================

export interface RunSubagentOptions {
  /** Sub-agent to run (must be registered in the registry). */
  subagentType: SubagentType;

  /** All notebook-defined sub-agents available in the current session. */
  availableSubagents: SubagentDefinition[];

  /** AGENTS.md / CLAUDE.md rules loaded for the current workspace. */
  agentRules?: AgentRule[];

  /** The task description passed from the parent agent as the sub-agent's prompt. */
  description: string;

  /** Parent agent's current LLM model ID, used for sub-agent requests. */
  modelId: string;

  /** Parent agent's provider. */
  providerId: ProviderId;

  /** Provider-specific model settings (e.g. thinking budget). */
  modelSettings?: Record<string, unknown>;

  /** Workspace directory — passed to /api/chat so tool path context is correct. */
  workspaceDirectory?: string;

  /** Absolute Jupyter root directory — lets sub-agents use the same absolute path contract. */
  rootDirectory?: string;

  /** Same editor/Jupyter context as the parent agent (injected into the sub-agent system prompt). */
  notebookPath?: string;
  activeFilePath?: string;
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;

  /**
   * Injected local tool executor — must be `assistant.executeToolCall` from
   * AssistantProvider context. Tools are called through this function so that
   * the existing JupyterToolSet handles actual execution.
   */
  executeToolCall: (toolName: OrionToolName, params: unknown) => Promise<unknown>;

  /** Called immediately before a nested sub-agent tool starts executing. */
  onToolStart?: (toolCallId: string) => void;

  /** Called after a nested sub-agent tool reaches a terminal result or error. */
  onToolEnd?: (toolCallId: string) => void;

  /** Copy the selected source notebook to a tmp run notebook. */
  createTmpNotebookCopy: (subagent: SubagentDefinition, runId: string) => Promise<string>;

  /** Called as soon as the writable tmp notebook path is known. */
  onTmpNotebookPath?: (tmpNotebookPath: string) => void;

  /**
   * Existing tmp notebook path to reconnect to. When set, the runner skips
   * copying the source notebook and continues from reconnectMessages.
   */
  reconnectTmpNotebookPath?: string;

  /** Prior isolated sub-agent transcript used when reconnecting to a run. */
  reconnectMessages?: UIMessage[];

  /** AbortSignal from the parent request for cooperative cancellation. */
  abortSignal?: AbortSignal;

  /**
   * Parent UI chat id — sent to `/api/chat` for dev logs and observability.
   * Does not merge sub-agent messages into the parent chat.
   */
  chatId?: string;

  /**
   * Nth delegate run of this subagent type in the parent chat (1-based).
   * Used for dev log filename: {parentChatId}-{agentName}#n.log (see dev-logger).
   */
  subagentDevLogInstance: number;

  /**
   * Optional progress callback fired at key moments during the sub-agent loop.
   * - `tools = []` means the sub-agent is making an LLM call (thinking).
   * - `tools = [...]` means those tools are about to be executed.
   */
  onStepProgress?: (step: number, tools: OrionToolName[]) => void;

  /**
   * Optional transcript callback fired whenever the isolated sub-agent message
   * history changes. The parent UI persists these snapshots for read-only
   * nested chat rendering.
   */
  onMessagesChange?: (messages: UIMessage[]) => void;
}

// ============================================================================
// Run result
// ============================================================================

export interface RunSubagentResult {
  /** Final text summary returned by the sub-agent. */
  summary: string;

  /** Writable tmp notebook used by this run. Returned so the parent can reconnect later. */
  tmpNotebookPath: string;

  /** True when this invocation continued an existing tmp notebook/transcript. */
  reconnected: boolean;

  /** Total number of steps taken (including the final text-only step). */
  stepsUsed: number;

  /** Always false now that sub-agent runs no longer have a client step limit. */
  stoppedByLimit: boolean;
}
