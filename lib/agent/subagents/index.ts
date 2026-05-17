/**
 * Orion Subagent Framework — Public API (server-safe)
 *
 * Import `runSubagent` from `@/lib/agent/subagents/client-runner` in client
 * components only — it is a `"use client"` module and is not re-exported here
 * so this barrel stays resolvable for server code (e.g. `/api/chat`) without
 * tooling errors on `./client-runner`.
 */

export type {
  SubagentType,
  SubagentOptions,
  SubagentDefinition,
  RunSubagentOptions,
  RunSubagentResult,
} from "./types";
export type { SubagentPromptPayload } from "./types";
export { buildSubagentSystemPrompt } from "./prompt";
export { filterDiscoverableSubagents, isSubagentModelInvocable } from "./discovery";
export {
  SubagentRegistry,
  buildSubagentTmpNotebookPath,
  parseSubagentNotebookDefinition,
} from "./registry";
