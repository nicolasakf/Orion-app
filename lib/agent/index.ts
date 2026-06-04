/**
 * AI Assistant Module
 *
 * Tool-driven AI assistant for Jupyter notebooks.
 *
 * Components:
 * - KernelSidecar: Runtime introspection via Jupyter protocol
 * - RuntimeContextStore: Caches runtime state and events
 * - AssistantProvider: React context for UI integration
 *
 * Model gateway: import `getModelGateway` from `@/lib/agent/model-gateway`
 * (not re-exported here to keep this barrel client-safe).
 * - Jupyter Tools: Native notebook manipulation tools (cell ops, file listing, etc.)
 */

// Kernel Sidecar - Runtime introspection
export {
  KernelSidecar,
  type TrafficLightState,
  type VariableSummary,
  type ColumnInfo,
  type DataFramePreview,
  type DataFrameCell,
  type KernelMessage,
  type IOPubEvent,
} from "./kernel-sidecar";

// Runtime Context Store - State caching
export {
  RuntimeContextStore,
  getRuntimeContextStore,
  resetRuntimeContextStore,
  type StreamEvent,
  type ErrorEvent,
  type ExecutionResult,
  type RuntimeSnapshot,
  type StoreConfig,
} from "./runtime-store";

// Model gateway types (client-safe). Implementation: `@/lib/agent/model-gateway`.
export type { SupportedProvider } from "./model-gateway-types";

// React Provider - UI integration
export {
  AssistantProvider,
  useAssistant,
  useAssistantOptional,
  useAssistantChatOptional,
  type AssistantContextValue,
  type AssistantChatContextValue,
} from "./assistant-provider";

// Tool Schemas - Zod definitions for AI SDK
export { orionTools, type OrionToolName } from "./tool-schemas";

// Agent System Prompt
export {
  ORION_AGENT_SYSTEM_PROMPT,
  buildAgentSystemPrompt,
} from "./agent-system-prompt";

// Jupyter Tools - Native notebook manipulation
export {
  // Factory function
  createJupyterTools,
  type JupyterToolSet,
  // Foundation
  BaseTool,
  NotebookManager,
  // Server Management
  ListKernelsTool,
  ShutdownKernelTool,
  // Notebook Management
  UseNotebookTool,
  ListNotebooksTool,
  RestartNotebookTool,
  UnuseNotebookTool,
  ReadNotebookTool,
  // Cell Operations
  ReadCellTool,
  InsertCellTool,
  DeleteCellTool,
  OverwriteCellSourceTool,
  ExecuteCellTool,
  ExecuteCodeTool,
  // Terminal Management
  BashTool,
  AwaitCommandTool,
} from "./tools";
