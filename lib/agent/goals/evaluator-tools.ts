import type { ToolSet } from "ai";

import {
  orionTools,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

/**
 * Investigative tools available to the independent goal evaluator.
 *
 * The evaluator is intentionally capable of reproducing and stress-testing the
 * worker's results. Tools whose primary purpose is to edit artifacts, mutate
 * notebook structure, manage app state, or communicate externally stay out of
 * this list; review-only use of the remaining tools is governed by the isolated
 * evaluator prompt.
 */
export const GOAL_EVALUATOR_TOOL_NAMES = [
  "list_kernels",
  "use_notebook",
  "read_notebook",
  "read_cell",
  "execute_cell",
  "read_cell_output",
  "inspect_output",
  "execute_code",
  "bash",
  "await_command",
  "kill_command",
  "read_file",
  "web_fetch",
  "web_search",
] as const satisfies readonly OrionToolName[];

/** Tool registry advertised for isolated goal-evaluation requests. */
export const goalEvaluatorTools: ToolSet = {
  list_kernels: orionTools.list_kernels,
  use_notebook: orionTools.use_notebook,
  read_notebook: orionTools.read_notebook,
  read_cell: orionTools.read_cell,
  execute_cell: orionTools.execute_cell,
  read_cell_output: orionTools.read_cell_output,
  inspect_output: orionTools.inspect_output,
  execute_code: orionTools.execute_code,
  bash: orionTools.bash,
  await_command: orionTools.await_command,
  kill_command: orionTools.kill_command,
  read_file: orionTools.read_file,
  web_fetch: orionTools.web_fetch,
  web_search: orionTools.web_search,
};

const GOAL_EVALUATOR_TOOL_NAME_SET = new Set<OrionToolName>(
  GOAL_EVALUATOR_TOOL_NAMES,
);

/** True when a client-side evaluator tool call is part of the advertised set. */
export function isGoalEvaluatorToolName(
  toolName: OrionToolName,
): boolean {
  return GOAL_EVALUATOR_TOOL_NAME_SET.has(toolName);
}
