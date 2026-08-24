/**
 * Orion Agent Tool Schemas
 *
 * AI SDK `tool()` definitions for all Jupyter notebook and terminal tools.
 * These schemas are passed to every LLM provider; execution is client-side via
 * AssistantProvider.executeToolCall().
 *
 * Constraints (shared across providers, including Gemini function calling):
 * - No `.optional()` or `.nullable()` on tool arguments — every property is
 *   required so models emit explicit values.
 * - Use empty string "" where a parameter previously meant “default” or “active
 *   notebook” (see per-field descriptions).
 *
 * No `execute` functions are defined here — all execution is client-side.
 */

import { tool } from "ai";
import { z } from "zod";

import { MAX_PERSONAL_CONTEXT_CHARS } from "@/lib/onboarding/personal-context";

import {
  buildAskQuestionTool,
  DEFAULT_MAX_QUESTIONS_PER_ASK,
} from "./ask-question";

import { EditOrionMetadataParamsSchema } from "./tools/edit-orion-metadata-schema";
import type { ExecutionToolResult } from "./visual-evidence";

/**
 * Defaults for execution knobs the model has no real opinion about.
 *
 * Orion's schemas otherwise require every argument explicitly, which keeps the
 * model from silently relying on hidden behaviour. Transport details are the
 * exception: they are not decisions, and making them mandatory turns a missing
 * field into a hard tool failure. In session 1786897277027 a model omitted
 * `progressInterval` on `execute_cell`, got a schema rejection it could not
 * read, and abandoned the tool for the rest of the run.
 */
const DEFAULT_EXECUTION_TIMEOUT_SECONDS = 120;
const DEFAULT_PROGRESS_INTERVAL_MS = 1000;

/** Per-cell execution timeout, defaulted so a missing value cannot fail the call. */
function executionTimeoutSecondsSchema(description: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(600)
    .default(DEFAULT_EXECUTION_TIMEOUT_SECONDS)
    .describe(description);
}

/** Converts structured execution output into text plus raster model input. */
function executionResultToModelOutput({ output }: { output: unknown }) {
  if (typeof output === "string") {
    return { type: "text" as const, value: output };
  }
  const result = output as Partial<ExecutionToolResult>;
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image-data"; data: string; mediaType: string }
  > = [];
  if (typeof result.text === "string") {
    parts.push({ type: "text", text: result.text });
  }
  for (const visual of result.visuals ?? []) {
    if (visual.data) {
      parts.push({
        type: "text",
        text: `Raster output ${visual.visualId} (${visual.mimeType}) is included below. Review what it shows before choosing the next research step.`,
      });
      parts.push({ type: "image-data", data: visual.data, mediaType: visual.mimeType });
    } else if (visual.visualInspectionUnavailableReason) {
      parts.push({
        type: "text",
        text: `Raster output ${visual.visualId} (${visual.mimeType}) could not be shown to you: ${visual.visualInspectionUnavailableReason}. Use supporting numeric or structural checks before relying on it.`,
      });
    } else {
      parts.push({
        type: "text",
        text: `Raster output ${visual.visualId} (${visual.mimeType}) did not include preview data. Use supporting numeric or structural checks before relying on it.`,
      });
    }
  }
  return parts.length > 0
    ? { type: "content" as const, value: parts }
    : { type: "text" as const, value: "[No output generated]" };
}

export const orionTools = {
  // ============================================================================
  // Server Management
  // ============================================================================

  list_kernels: tool({
    description:
      "List all running kernels and available kernel specs on the Jupyter server. Use this to find an existing kernel to connect a notebook to.",
    inputSchema: z.object({}),
  }),

  shutdown_kernel: tool({
    description:
      "Shut down one or more running Jupyter kernels by their IDs. This terminates each kernel process and clears any associated notebook connections. Use list_kernels to find kernel IDs first.",
    inputSchema: z.object({
      kernelIds: z
        .array(z.string())
        .min(1)
        .describe("Array of kernel IDs to shut down (from list_kernels). Provide multiple IDs to shut down several kernels at once."),
    }),
  }),

  // ============================================================================
  // Notebook Management
  // ============================================================================

  use_notebook: tool({
    description:
      "Connect to an existing notebook file or create a new one, associating it with a kernel. MUST be called before any cell operations. Use mode='connect' for existing notebooks, mode='create' for new ones. The response includes a notebookId — save it and pass it to read_notebook and restart_notebook.",
    inputSchema: z.object({
      notebookName: z
        .string()
        .describe(
          "A short human-readable label for this notebook (e.g. 'main', 'analysis'). Display only — not used as an identifier."
        ),
      notebookPath: z
        .string()
        .describe(
          "Absolute host path to the notebook under the Jupyter root when the system prompt provides a Jupyter root (e.g. '/Users/me/project/notebooks/eda.ipynb'). If the prompt says absolute host paths are unavailable, use a Jupyter-root-relative path instead."
        ),
      mode: z
        .enum(["connect", "create"])
        .describe(
          "'connect' to attach to an existing notebook file, 'create' to create a new notebook."
        ),
      kernelId: z
        .string()
        .describe(
          "ID of an existing running kernel to connect to (from list_kernels). Pass an empty string \"\" to start a new kernel instead."
        ),
    }),
  }),

  read_notebook: tool({
    description:
      "Read the content of a managed notebook, preferring Orion's unsaved editor buffer for the active notebook before falling back to the Jupyter server. Returns full cell sources, types, and per-output type/mime summaries (not full output bodies). Set includeOrionMetadata=false unless you specifically need metadata.orion.",
    inputSchema: z.object({
      notebookId: z
        .string()
        .describe(
          "ID returned by use_notebook for the notebook to read. Pass an empty string \"\" to read the currently active notebook."
        ),
      startIndex: z
        .number()
        .int()
        .min(0)
        .describe("Zero-based index of the first cell to include (pagination)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .describe("Maximum number of cells to return (1–100)."),
      includeOrionMetadata: z
        .boolean()
        .describe(
          "Whether to include notebook and cell metadata.orion JSON. Use false for normal notebook reads and true before editing Orion metadata."
        ),
    }),
  }),

  restart_notebook: tool({
    description:
      "Restart the kernel for a notebook. This clears all in-memory variables. Use when the kernel is stuck, when you need a clean state, or after installing packages.",
    inputSchema: z.object({
      notebookId: z
        .string()
        .describe(
          "ID returned by use_notebook for the notebook to restart. Pass an empty string \"\" to restart the currently active notebook."
        ),
    }),
  }),

  // ============================================================================
  // Cell Operations
  // ============================================================================

  read_cell: tool({
    description:
      "Read the source code and optionally the outputs and Orion metadata of one or more cells by index, preferring Orion's unsaved editor buffer for the active notebook before falling back to the Jupyter server. Provide multiple indices to read several cells in one call (order is preserved). Negative indices count from the end of the notebook. Set includeOrionMetadata=false unless you specifically need metadata.orion.",
    inputSchema: z.object({
      cellIndices: z
        .array(z.number().int())
        .min(1)
        .describe(
          "Zero-based cell indices to read, in order. Use a single-element array for one cell. Negative values count from the end (e.g. -1 is the last cell)."
        ),
      includeOutputs: z
        .boolean()
        .describe("Whether to include cell execution outputs for code cells."),
      includeOrionMetadata: z
        .boolean()
        .describe(
          "Whether to include cell metadata.orion JSON. Use false for normal cell reads and true before editing Orion metadata."
        ),
    }),
  }),

  insert_cell: tool({
    description:
      "Insert one or more code or markdown cells at a specific position in the notebook. If the active notebook has unsaved editor changes, Orion saves them before this mutation runs. Existing cells at or after the index are shifted down. Each cell can also merge a JSON object into metadata.orion via orionMetadataJson, which is the easiest way to mark inserted App View markdown cells with {\"app\":{\"enabled\":true}}. Set execute=true to run the inserted code cells immediately and get their output back in this same call — prefer that over a separate execute_cell call, which costs an extra model round-trip for no added control.",
    inputSchema: z.object({
      cells: z
        .array(
          z.object({
            cellType: z
              .enum(["code", "markdown"])
              .describe("Type of the cell."),
            cellSource: z
              .string()
              .describe("Source code or markdown content for the cell."),
            orionMetadataJson: z
              .string()
              .describe(
                "JSON object to recursively merge into this new cell's metadata.orion. Use \"\" for no metadata edits. For App View markdown cells, pass \"{\\\"app\\\":{\\\"enabled\\\":true}}\". For a future first code output, pass \"{\\\"app\\\":{\\\"outputs\\\":{\\\"0\\\":{\\\"enabled\\\":true}}}}\"."
              ),
          })
        )
        .min(1)
        .describe(
          "Array of cells to insert. Each cell has cellType and cellSource. Cells are inserted consecutively starting at startIndex."
        ),
      startIndex: z
        .number()
        .int()
        .min(-1)
        .describe(
          "Zero-based index at which to insert the first cell. Use -1 to append at the end. Use the current number of cells to append."
        ),
      execute: z
        .boolean()
        .describe(
          "Whether to run the inserted code cells right away and return their outputs with the insert summary. Markdown cells are skipped. Use true whenever you would otherwise call execute_cell on exactly these cells next. Use false for markdown-only inserts or scaffolding you deliberately want to run later."
        ),
      timeoutSeconds: executionTimeoutSecondsSchema(
        `When execute is true, maximum execution time in seconds per cell. Ignored when execute is false. Optional; defaults to ${DEFAULT_EXECUTION_TIMEOUT_SECONDS}.`
      ),
    }),
    toModelOutput: executionResultToModelOutput,
  }),

  delete_cell: tool({
    description:
      "Delete one or more cells from the notebook by their indices. If the active notebook has unsaved editor changes, Orion saves them before this mutation runs. Provide multiple indices to delete several cells at once.",
    inputSchema: z.object({
      cellIndices: z
        .array(z.number().int().min(0))
        .min(1)
        .describe(
          "Array of zero-based cell indices to delete. They will be deleted in descending order to preserve index stability."
        ),
      includeSource: z
        .boolean()
        .default(false)
        .describe(
          "Whether to include deleted cell sources in the response (false keeps the reply shorter). Optional; defaults to false."
        ),
    }),
  }),

  overwrite_cell_source: tool({
    description:
      "Replace the source code of one or more existing cells. If the active notebook has unsaved editor changes, Orion saves them before this mutation runs. Use this to update or fix code without reinserting cells. Entries are applied in order; if the same index appears twice, the last newSource wins. Each entry can also merge a JSON object into metadata.orion via orionMetadataJson, which is the easiest way to keep or add App View inclusion while editing source. Set execute=true to re-run the edited code cells immediately and get their output back in this same call — prefer that over a separate execute_cell call, which costs an extra model round-trip for no added control.",
    inputSchema: z.object({
      cells: z
        .array(
          z.object({
            cellIndex: z
              .number()
              .int()
              .min(0)
              .describe("Zero-based index of the cell to overwrite."),
            newSource: z.string().describe("New source content for that cell."),
            orionMetadataJson: z
              .string()
              .describe(
                "JSON object to recursively merge into this cell's metadata.orion after the source update. Use \"\" for no metadata edits. For App View markdown cells, pass \"{\\\"app\\\":{\\\"enabled\\\":true}}\". For code output 0, pass \"{\\\"app\\\":{\\\"outputs\\\":{\\\"0\\\":{\\\"enabled\\\":true}}}}\"."
              ),
          })
        )
        .min(1)
        .describe(
          "Cells to update. Each item has cellIndex and newSource. Provide one object to change a single cell."
        ),
      execute: z
        .boolean()
        .describe(
          "Whether to re-run the edited code cells right away and return their outputs with the edit summary. Markdown cells are skipped. Use true whenever you would otherwise call execute_cell on exactly these cells next — fixing a cell and seeing the result is one step. Use false when the edit should not run yet."
        ),
      timeoutSeconds: executionTimeoutSecondsSchema(
        `When execute is true, maximum execution time in seconds per cell. Ignored when execute is false. Optional; defaults to ${DEFAULT_EXECUTION_TIMEOUT_SECONDS}.`
      ),
    }),
    toModelOutput: executionResultToModelOutput,
  }),

  edit_orion_metadata: tool({
    description:
      "Modify notebook-level or cell-level metadata.orion fields in the current managed notebook. If the active notebook has unsaved editor changes, Orion saves them before this mutation runs. Use this instead of edit_file for Orion notebook metadata. Supports batched merge, replace, and delete operations; preserves source, outputs, execution counts, unrelated metadata, and protected cell metadata.orion.id values.",
    inputSchema: EditOrionMetadataParamsSchema,
  }),

  execute_cell: tool({
    description:
      "Execute one or more cells in the notebook by their indices and return their outputs. If the active notebook has unsaved editor changes, Orion saves them before execution. Cells are executed sequentially in the order provided. All cells must already exist in the notebook and be unchanged — to run cells you are creating now, use insert_cell with execute=true, and to re-run cells you are editing now, use overwrite_cell_source with execute=true. Both avoid an extra model round-trip. Use this tool only to run cells you are not touching in this step.",
    inputSchema: z.object({
      cellIndices: z
        .array(z.number().int().min(0))
        .min(1)
        .describe(
          "Array of zero-based cell indices to execute, in order. Provide a single-element array to execute one cell."
        ),
      timeoutSeconds: executionTimeoutSecondsSchema(
        `Maximum execution time in seconds per cell. Optional; defaults to ${DEFAULT_EXECUTION_TIMEOUT_SECONDS}.`
      ),
      stream: z
        .boolean()
        .default(false)
        .describe(
          "Whether to stream output progressively (true) or return when each cell finishes without progress chunks (false). Optional; defaults to false."
        ),
      progressInterval: z
        .number()
        .int()
        .min(250)
        .max(10000)
        .default(DEFAULT_PROGRESS_INTERVAL_MS)
        .describe(
          `When stream is true, how often (in ms) to emit progress updates (250–10000). Optional; defaults to ${DEFAULT_PROGRESS_INTERVAL_MS}.`
        ),
    }),
    toModelOutput: executionResultToModelOutput,
  }),

  read_cell_output: tool({
    description:
      "Read one or more outputs from notebook cells, preferring Orion's unsaved editor buffer for the active notebook before falling back to the Jupyter server. Outputs are intelligently formatted by mime type. For DataFrames it returns a TSV table; for Plotly charts a structured summary; for plain text the raw text. For images it returns the image itself only when the selected model accepts image input, and a placeholder explaining why otherwise — check the result rather than assuming you will be able to see it. Do NOT re-read an image that an execution result already showed you earlier in this turn; you have been shown it, and fetching it again costs the same tokens for nothing. Outputs that were stubbed or stripped from earlier turns to save context can be re-read when you still need them. Pass multiple reads to fetch several outputs in one call.",
    inputSchema: z.object({
      reads: z
        .array(
          z.object({
            cellIndex: z
              .number()
              .int()
              .describe(
                "Zero-based index of the cell to read the output from. Negative indices count from the end."
              ),
            outputIndex: z
              .number()
              .int()
              .min(0)
              .describe(
                "Zero-based index of the output within the cell (a cell can have multiple outputs). Use 0 for the first output."
              ),
          })
        )
        .min(1)
        .describe(
          "Output targets to read, in order. Each entry is { cellIndex, outputIndex }. Use a single-element array for one output."
        ),
    }),
    toModelOutput: ({ output }: { output: unknown }) => {
      // Plain text result (non-image outputs or errors) — pass through as text
      if (typeof output === "string") {
        return { type: "text" as const, value: output };
      }
      // Structured multimodal result containing image data
      const multimodal = output as { text?: string; images?: Array<{ mimeType: string; data: string }> };
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "image-data"; data: string; mediaType: string }
      > = [];
      if (multimodal.text) {
        parts.push({ type: "text", text: multimodal.text });
      }
      for (const img of multimodal.images ?? []) {
        parts.push({ type: "image-data", data: img.data, mediaType: img.mimeType });
      }
      if (parts.length === 0) {
        return { type: "text" as const, value: "[Empty output]" };
      }
      return { type: "content" as const, value: parts };
    },
  }),

  inspect_output: tool({
    description:
      "Inspect any notebook output exactly as it is currently rendered in Orion. Returns a model-visible image of the complete output frame while preserving its current clipping and internal scroll positions, plus rendered dimensions and applicable visual diagnostics. Use this after creating or changing visual output, then repair and reinspect any visual problems.",
    inputSchema: z.object({
      cellIndex: z
        .number()
        .int()
        .min(0)
        .describe("Zero-based cell index in the currently rendered notebook."),
      outputIndex: z
        .number()
        .int()
        .min(0)
        .describe("Zero-based output index within the cell."),
    }),
    toModelOutput: executionResultToModelOutput,
  }),

  execute_code: tool({
    description:
      "Execute arbitrary Python code directly in the kernel without modifying the notebook. Useful for quick computations, inspecting variables, installing packages, or running shell commands with '!'.",
    inputSchema: z.object({
      code: z
        .string()
        .describe("Python or IPython code to execute in the kernel."),
      timeoutSeconds: executionTimeoutSecondsSchema(
        `Maximum execution time in seconds. Optional; defaults to ${DEFAULT_EXECUTION_TIMEOUT_SECONDS}.`
      ),
    }),
    toModelOutput: executionResultToModelOutput,
  }),

  // ============================================================================
  // Terminal Management
  // ============================================================================

  bash: tool({
    description:
      'Run a shell command in a persistent PTY-backed Jupyter terminal (PowerShell on Windows; POSIX shell on macOS/Linux). Use terminalName="" to create a fresh chat-scoped terminal. Only pass a non-empty terminalName when intentionally reusing the exact value returned by bash or await_command; never invent a terminal name. Foreground calls block until completion or the built-in wait budget elapses. If status is running, call await_command with the same terminalName; do NOT resend the command. Set background=true for commands likely to run longer than about 15 seconds (servers, watchers, long builds, long installs). Commands must be non-interactive: one that waits for input is reported as status: stalled, and kill_command recovers the terminal.',
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          "Shell command to execute using the Jupyter terminal shell (e.g. 'ls -la' on POSIX or 'Get-ChildItem' on Windows PowerShell). Do not include a trailing newline. Use ASCII-only option flags; avoid Unicode lookalike characters in options."
        ),
      description: z
        .string()
        .describe(
          "One short sentence explaining why this command is being run (used for UI context and safety review)."
        ),
      terminalName: z
        .string()
        .describe(
          'Exact terminalName to reuse. Pass empty string "" to create a fresh chat-scoped terminal. Never invent a terminal name; only reuse an exact terminalName returned earlier by bash or await_command.'
        ),
      cwd: z
        .string()
        .describe(
          "Absolute host path to a working directory under the Jupyter root when the system prompt provides a Jupyter root. If absolute host paths are unavailable, use a Jupyter-root-relative path. Only applied when terminalName is empty because that creates a fresh chat terminal."
        ),
      background: z
        .boolean()
        .describe(
          "Set true for commands you expect to run longer than about 15 seconds (servers, watchers, long builds/installs). Set false for normal short commands; if the command runs long, use await_command when status returns running."
        ),
    }),
  }),

  await_command: tool({
    description:
      "Continue waiting on output from a prior bash call that returned status=running. This tool blocks until completion marker, optional pattern match, or the built-in wait budget elapses. Returns structured status (completed/matched/running/stalled/error). status=stalled means the command is waiting for input or has gone silent — recover it with kill_command instead of awaiting again.",
    inputSchema: z.object({
      terminalName: z
        .string()
        .describe(
          "Exact terminalName returned by a prior bash or await_command result. Copy it verbatim; never invent or rename it."
        ),
      pattern: z
        .string()
        .describe(
          "Optional regular expression used for early return when matched in output. Pass empty string \"\" to disable pattern matching."
        ),
    }),
  }),

  kill_command: tool({
    description:
      "Stop a command that is holding a terminal and cannot finish on its own — typically one that stalled at a pager or an interactive prompt. mode=\"interrupt\" sends Ctrl-C, quits a pager if one is holding the terminal, and hands the terminal back for reuse. mode=\"close\" shuts the terminal down when interrupting did not free it. After killing, re-run the command non-interactively (for example --no-pager, pipe through cat, or the flag that skips confirmation).",
    inputSchema: z.object({
      terminalName: z
        .string()
        .describe(
          "Exact terminalName returned by a prior bash or await_command result. Copy it verbatim; never invent or rename it."
        ),
      mode: z
        .enum(["interrupt", "close"])
        .describe(
          'Use "interrupt" first: it stops the command and keeps the terminal usable. Use "close" only when a prior interrupt reported status: stalled.'
        ),
    }),
  }),

  // ============================================================================
  // File & Workspace Operations
  // ============================================================================

  // ============================================================================
  // File Operations
  // ============================================================================

  read_file: tool({
    description:
      "Read a non-notebook text file (e.g. .py, .csv, .json, .yaml, .txt), preferring Orion's unsaved editor buffer for the active file before falling back to the Jupyter server. Returns line-numbered content. Use startLine/endLine to read a specific range; pass 0 for both to read the entire file.",
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          "Absolute host path to the file under the Jupyter root when the system prompt provides a Jupyter root (e.g. '/Users/me/project/scripts/preprocess.py'). If the prompt says absolute host paths are unavailable, use a Jupyter-root-relative path instead."
        ),
      startLine: z
        .number()
        .int()
        .min(0)
        .describe(
          "0-based index of the first line to return. Pass 0 to start from the beginning."
        ),
      endLine: z
        .number()
        .int()
        .min(0)
        .describe(
          "0-based index of the last line to return (inclusive). Pass 0 to read to the end of the file."
        ),
    }),
  }),

  edit_file: tool({
    description:
      "Write or modify a non-notebook text file. If the active text file has unsaved editor changes, Orion saves them before this mutation runs. Use mode='overwrite' to create or replace the entire file (missing parent directories are created automatically; do not mkdir first), or mode='replace' to make a targeted string substitution. Never use this tool on .ipynb files — use the notebook cell tools instead.",
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          "Absolute host path to the file under the Jupyter root when the system prompt provides a Jupyter root (e.g. '/Users/me/project/scripts/utils.py'). If the prompt says absolute host paths are unavailable, use a Jupyter-root-relative path instead."
        ),
      mode: z
        .enum(["overwrite", "replace"])
        .describe(
          "'overwrite' replaces the entire file with 'content'. 'replace' finds the unique 'oldString' in the file and substitutes 'newString'."
        ),
      content: z
        .string()
        .describe(
          "Full new file content for overwrite mode. Pass an empty string \"\" when using replace mode."
        ),
      oldString: z
        .string()
        .describe(
          "Exact text to find and replace (replace mode only). Must appear exactly once in the file. Pass an empty string \"\" when using overwrite mode."
        ),
      newString: z
        .string()
        .describe(
          "Replacement text for the matched oldString (replace mode only). Pass an empty string \"\" when using overwrite mode."
        ),
    }),
  }),

  update_memory: tool({
    description:
      "Replace the user's durable Orion memory at ~/.orion/ORION.md. This is the only tool an agent may use to update that file. Use it only when the user explicitly asks Orion to remember durable information or approves a proposed memory update. Preserve useful existing context, remove duplicates, and provide the complete replacement Markdown file.",
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .max(MAX_PERSONAL_CONTEXT_CHARS)
        .describe(
          "Complete replacement Markdown for ORION.md. Include useful existing context that should be preserved; do not include passwords, tokens, API keys, or other credentials."
        ),
      reason: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "Short explanation of the user's explicit request or approval that authorizes this memory update."
        ),
    }),
  }),

  reload_page: tool({
    description:
      "Reload the Orion browser page. Use this after changing Orion settings files or other app configuration that the running UI will not fully pick up until refresh. This tool schedules the reload after returning its tool result.",
    inputSchema: z.object({}),
  }),

  // ============================================================================
  // Connections
  // ============================================================================

  connections: tool({
    description:
      "Inspect and request access to the user's third-party systems (Google Sheets, Slack, a Postgres warehouse, and so on). Call this BEFORE claiming a system is unreachable, and before describing any way for the user to connect one — it is the only accurate source for what Orion can currently reach. Action 'list' returns every stored connection with its id, tool, auth kind, the NAMES of its stored secrets, and its non-secret settings; secret values are never returned. Action 'request' opens Orion's Connections settings so the user can add or repair a connection. Notebook code reads a connection with `orion_ui.connections.get(\"<id>\")`, which resolves the secret in-process without printing it.",
    inputSchema: z.object({
      action: z
        .enum(["list", "request"])
        .describe(
          "'list' to see what is already connected; 'request' to ask the user to add or repair a connection.",
        ),
      toolId: z
        .string()
        .optional()
        .describe(
          "For 'request': the system to connect, as a catalog id when known (e.g. 'google-sheets', 'slack') or the product name otherwise. Ignored by 'list'.",
        ),
      reason: z
        .string()
        .max(300)
        .optional()
        .describe(
          "For 'request': one short sentence telling the user why this connection is needed, shown alongside the prompt.",
        ),
    }),
  }),

  // ============================================================================
  // Web Access
  // ============================================================================

  web_fetch: tool({
    description:
      "Fetch a public web URL and return readable page content. Use this for specific documentation pages, articles, or links the user provides. Only http and https URLs are supported.",
    inputSchema: z.object({
      url: z
        .string()
        .describe("Fully formed public URL to fetch, starting with http:// or https://."),
    }),
  }),

  web_search: tool({
    description:
      "Search the public web for up-to-date information using Exa. Use this when you need to discover relevant current pages before reading specific URLs.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Concise web search query. Include the current year when searching for recent information."),
    }),
  }),

  // ============================================================================
  // Sub-agent Delegation
  // ============================================================================

  delegate: tool({
    description:
      "Spawn a focused notebook-defined sub-agent to perform a specific task and return a summary. Choose the sub-agent by exact name from the Sub-agent Delegation section of the system prompt. The sub-agent runs autonomously in a temporary notebook copy and returns a concise text summary.",
    inputSchema: z.object({
      description: z
        .string()
        .describe(
          "Detailed task description for the sub-agent. Be specific — include what to find, where to look, and what information to include in the summary."
        ),
      subagent: z
        .string()
        .min(1)
        .describe("Exact sub-agent name to spawn, matching one of the notebook-defined sub-agents listed under Sub-agent Delegation in the system prompt."),
      reconnectTmpNotebookPath: z
        .string()
        .describe(
          "Pass an empty string \"\" for a fresh sub-agent run. To ask follow-up questions about a prior run, pass the exact tmpNotebookPath returned by that earlier delegate result."
        ),
    }),
  }),

  // ============================================================================
  // User Interaction
  // ============================================================================

  /**
   * Registered at the default per-call limit so the tool name, types, and mode
   * tool lists stay static. `prepareChatInvocation` swaps in a tool built for
   * the user's configured limit before the request is sent.
   */
  ask_question: buildAskQuestionTool(DEFAULT_MAX_QUESTIONS_PER_ASK),

  // ============================================================================
  // Skills
  // ============================================================================

  load_skill: tool({
    description:
      "Load a skill to get specialized workflow instructions for a specific task type. Call this when the user's task matches one of the available skills listed in the system prompt. The skill content will be returned as detailed instructions to follow.",
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          "The name of the skill to load. Use an exact name from the Available Skills list, or from the Required Skills section — skills the user selected for this turn are named there and may not appear in the Available Skills list."
        ),
    }),
  }),
} as const;

/** Type representing the names of all available Orion tools */
export type OrionToolName = keyof typeof orionTools;

/** Canonical runtime list of model-facing Orion tool names. */
export const ORION_TOOL_NAMES = Object.keys(orionTools) as OrionToolName[];

/** Returns true when a raw value is the name of a model-facing Orion tool. */
export function isOrionToolName(value: unknown): value is OrionToolName {
  return typeof value === "string" && ORION_TOOL_NAMES.includes(value as OrionToolName);
}

/**
 * Tools that require no Jupyter server or kernel session for gating purposes.
 * These always execute regardless of kernel or Jupyter server status (client-side handlers).
 */
export const NO_DEPENDENCY_TOOLS: ReadonlySet<OrionToolName> = new Set<OrionToolName>([
  "load_skill",
  "connections",
  "update_memory",
  "reload_page",
  "inspect_output",
  "web_fetch",
  "web_search",
  // ask_question is answered by the user in the chat body, so it needs no
  // Jupyter server or kernel.
  "ask_question",
  // delegate spawns a client-side sub-agent and does not need a Jupyter server or
  // kernel — the sub-agent itself acquires whatever tools it needs.
  "delegate",
]);

/**
 * Tools that require a Jupyter server connection (REST API) but NOT a running kernel.
 * These can execute when a server is connected even if no kernel is active (e.g. when a
 * non-notebook file is open).
 */
export const SERVER_ONLY_TOOLS: ReadonlySet<OrionToolName> = new Set<OrionToolName>([
  "read_file",
  "edit_file",
  "use_notebook",
  "read_notebook",
  "read_cell",
  "insert_cell",
  "delete_cell",
  "overwrite_cell_source",
  "edit_orion_metadata",
  "read_cell_output",
  "list_kernels",
  "shutdown_kernel",
  "bash",
  "await_command",
  "kill_command",
]);

// Tools not in either set above (execute_cell, execute_code, restart_notebook) require
// a running kernel and are gated on kernelStatus === "connected".

/**
 * Tools available in Ask mode — read-only exploration access.
 * Bash is included but guarded by the read-only bash policy at runtime.
 */
export const ASK_MODE_TOOLS: Pick<
  typeof orionTools,
  | "list_kernels"
  | "read_file"
  | "read_notebook"
  | "read_cell"
  | "read_cell_output"
  | "inspect_output"
  | "bash"
  | "await_command"
  | "kill_command"
  | "web_fetch"
  | "web_search"
  | "load_skill"
  | "connections"
  | "ask_question"
> = {
  list_kernels: orionTools.list_kernels,
  read_file: orionTools.read_file,
  read_notebook: orionTools.read_notebook,
  read_cell: orionTools.read_cell,
  read_cell_output: orionTools.read_cell_output,
  inspect_output: orionTools.inspect_output,
  bash: orionTools.bash,
  await_command: orionTools.await_command,
  kill_command: orionTools.kill_command,
  web_fetch: orionTools.web_fetch,
  web_search: orionTools.web_search,
  load_skill: orionTools.load_skill,
  connections: orionTools.connections,
  ask_question: orionTools.ask_question,
};

/** Tool names excluded from Edit mode (notebook cell execution). */
const EDIT_MODE_EXCLUDED: ReadonlySet<OrionToolName> = new Set<OrionToolName>([
  "execute_cell",
  "execute_code",
  "restart_notebook",
]);

/**
 * Tools available in Edit mode — full file and terminal access, but no notebook
 * cell execution. Built by filtering `orionTools` at module load time.
 */
export const EDIT_MODE_TOOLS = Object.fromEntries(
  (Object.entries(orionTools) as Array<[OrionToolName, (typeof orionTools)[OrionToolName]]>).filter(
    ([name]) => !EDIT_MODE_EXCLUDED.has(name)
  )
) as Omit<typeof orionTools, "execute_cell" | "execute_code" | "restart_notebook">;
