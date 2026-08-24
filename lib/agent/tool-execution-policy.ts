import type { OrionToolName } from "@/lib/agent/tool-schemas";

/** Default maximum independent read-only calls per agent turn. */
export const DEFAULT_MAX_PARALLEL_READ_ONLY_CALLS = 10;

/** Tool calls that are safe to overlap within one ordered assistant tool batch. */
export const PARALLEL_READ_ONLY_TOOLS: ReadonlySet<OrionToolName> =
  new Set<OrionToolName>([
    "read_file",
    "read_notebook",
    "read_cell",
    "read_cell_output",
    "inspect_output",
    "list_kernels",
    "web_search",
    "web_fetch",
    "load_skill",
  ]);

/** Shared model guidance for making parallel-safe tool batches discoverable. */
export const PARALLEL_TOOL_CALLS_PROMPT_SECTION = `## Parallel Tool Calls

When several read-only tool calls are independent, issue them together in the same response so Orion can run them concurrently. Keep dependent calls and every state-changing, execution, terminal, reload, or delegation call sequential.`;

/** Returns whether a tool may share a parallel execution wave. */
export function isParallelReadOnlyTool(
  toolName: OrionToolName
): boolean {
  return PARALLEL_READ_ONLY_TOOLS.has(toolName);
}
