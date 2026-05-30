/**
 * BaseTool - Abstract base class for all Jupyter notebook tools
 *
 * Provides common infrastructure for:
 * - Reading/writing .ipynb files via ContentsManager (@jupyterlab/services)
 * - Kernel communication through KernelService
 * - Traffic light state awareness via KernelSidecar
 *
 * All tools extend this class and implement the `execute` method.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import { CellType } from "@/lib/types";
import type { KernelSidecar } from "../kernel-sidecar";
import type {
  OpenDocumentSnapshotProvider,
  OpenDocumentSnapshotSource,
} from "../open-document-snapshots";
import type {
  EditCheckpointContext,
  EditCheckpointRecorder,
} from "../edit-checkpoint-recorder";
import {
  guardToolText,
  TOOL_OUTPUT_TEXT_CHAR_BUDGET,
} from "../tool-output-guard";
import type { NotebookDocument, CellOutput, NotebookCell } from "./types";

interface NotebookReadResult {
  notebook: NotebookDocument;
  source: "jupyter-contents" | OpenDocumentSnapshotSource;
  dirty: boolean;
}

// ============================================================================
// Abstract Base Class
// ============================================================================

export abstract class BaseTool {
  protected kernelService: KernelService;
  protected sidecar: KernelSidecar | null;
  protected snapshotProvider: OpenDocumentSnapshotProvider | null;
  protected checkpointRecorder: EditCheckpointRecorder | null;
  protected checkpointContext: EditCheckpointContext | null = null;

  /** Safety backstop: max characters returned to the LLM per tool call */
  private static readonly MAX_OUTPUT_CHARS = TOOL_OUTPUT_TEXT_CHAR_BUDGET;
  /** Max traceback lines to include before truncating */
  private static readonly MAX_TRACEBACK_LINES = 30;

  constructor(
    kernelService: KernelService,
    sidecar?: KernelSidecar | null,
    snapshotProvider?: OpenDocumentSnapshotProvider | null,
    checkpointRecorder?: EditCheckpointRecorder | null
  ) {
    this.kernelService = kernelService;
    this.sidecar = sidecar ?? null;
    this.snapshotProvider = snapshotProvider ?? null;
    this.checkpointRecorder = checkpointRecorder ?? null;
  }

  /** Set the request/tool context used for the next mutation checkpoint write. */
  setCheckpointContext(context: EditCheckpointContext | null): void {
    this.checkpointContext = context;
  }

  /**
   * Truncate output to stay within the LLM context budget.
   * This is a safety backstop — the sidecar handles structured variable
   * summaries; this catches raw large prints from execute_code/execute_cell.
   */
  protected truncateOutput(text: string): string {
    return guardToolText(text, {
      maxChars: BaseTool.MAX_OUTPUT_CHARS,
    }).text;
  }

  /**
   * Execute the tool with the given parameters.
   * Must be implemented by each concrete tool.
   *
   * Each subclass defines its own params type via method override.
   * eslint-disable-next-line @typescript-eslint/no-explicit-any
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract execute(params?: any): Promise<string | string[] | object>;

  // ============================================================================
  // Notebook File I/O (via @jupyterlab/services ContentsManager)
  // ============================================================================

  /**
   * Read a notebook file from the Jupyter server contents API.
   *
   * @param path - Notebook path relative to the Jupyter root directory
   * @returns Parsed NotebookDocument
   */
  protected async readNotebook(path: string): Promise<NotebookDocument> {
    return (await this.readNotebookWithSource(path)).notebook;
  }

  /**
   * Read a notebook, preferring Orion's open editor buffer when available.
   *
   * Snapshot notebooks are cloned before returning so tools can safely mutate
   * their working copy without directly changing React editor state.
   */
  protected async readNotebookWithSource(path: string): Promise<NotebookReadResult> {
    const snapshot = this.snapshotProvider?.getNotebookSnapshot(path);
    if (snapshot) {
      return {
        notebook: this.cloneNotebook(snapshot.notebook),
        source: snapshot.source,
        dirty: snapshot.dirty,
      };
    }

    const contents = this.kernelService.getContentsManager();

    const model = await contents.get(path, {
      type: "notebook",
      content: true,
    });

    if (!model.content) {
      throw new Error(`Notebook '${path}' has no content`);
    }

    return {
      notebook: model.content as unknown as NotebookDocument,
      source: "jupyter-contents",
      dirty: false,
    };
  }

  /** Clone notebook JSON data into a mutable working copy. */
  protected cloneNotebook(notebook: NotebookDocument): NotebookDocument {
    return JSON.parse(JSON.stringify(notebook)) as NotebookDocument;
  }

  /**
   * Write a notebook document back to the Jupyter server contents API.
   *
   * @param path - Notebook path relative to the Jupyter root directory
   * @param notebook - The notebook document to write
   */
  protected async writeNotebook(
    path: string,
    notebook: NotebookDocument
  ): Promise<void> {
    const contents = this.kernelService.getContentsManager();

    await contents.save(path, {
      type: "notebook",
      format: "json",
      content: notebook as any,
    });
  }

  /**
   * Create a new empty notebook on the Jupyter server using the contents API
   * (`newUntitled`), so the server defines kernelspec and language metadata.
   *
   * @param path - Notebook path relative to the Jupyter root directory
   * @returns The created NotebookDocument
   */
  protected async createNotebook(path: string): Promise<NotebookDocument> {
    const contents = this.kernelService.getContentsManager();
    const parentPath = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    const created = await contents.newUntitled({
      path: parentPath,
      type: "notebook",
    });
    if (created.path !== path) {
      await contents.rename(created.path, path);
    }
    return this.readNotebook(path);
  }

  // ============================================================================
  // Cell Utilities
  // ============================================================================

  /**
   * Normalize cell source to a single string.
   * Cells can have source as string or string array.
   */
  protected normalizeCellSource(source: string | string[]): string {
    if (Array.isArray(source)) {
      return source.join("");
    }
    return source;
  }

  /** Create a stable Orion cell id for notebook mutation tools. */
  protected createOrionCellId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /** Returns the stable Orion cell id when present. */
  protected getCellOrionId(cell: NotebookCell | undefined): string | null {
    const id = cell?.metadata?.orion?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  /** Ensure every notebook cell has a stable Orion id before mutation saves. */
  protected ensureNotebookCellIds(notebook: NotebookDocument): void {
    const seen = new Set<string>();
    for (const cell of notebook.cells) {
      let id = this.getCellOrionId(cell);
      if (!id || seen.has(id)) {
        id = this.createOrionCellId();
        cell.metadata = {
          ...(cell.metadata ?? {}),
          orion: {
            ...(cell.metadata?.orion ?? {}),
            id,
          },
        };
      }
      seen.add(id);
    }
  }

  /**
   * Create a new code cell matching nbformat v4.
   */
  protected createCodeCell(source: string): NotebookCell {
    return {
      cell_type: CellType.CODE,
      source: [source],
      metadata: { orion: { id: this.createOrionCellId() } },
      execution_count: null,
      outputs: [],
    };
  }

  /**
   * Create a new markdown cell matching nbformat v4.
   */
  protected createMarkdownCell(source: string): NotebookCell {
    return {
      cell_type: CellType.MARKDOWN,
      source: [source],
      metadata: { orion: { id: this.createOrionCellId() } },
    };
  }

  /**
   * Extract human-readable text from cell outputs.
   */
  protected extractOutputText(outputs: CellOutput[]): string[] {
    const result: string[] = [];

    for (const output of outputs) {
      switch (output.output_type) {
        case "stream": {
          const rawText = output.text;
          const text = Array.isArray(rawText)
            ? rawText.join("")
            : (rawText ?? "");
          if (text) {
            result.push(text);
          }
          break;
        }
        case "execute_result":
        case "display_data": {
          const data = output.data;
          if (!data) {
            break;
          }
          if (data["text/plain"]) {
            const plain = data["text/plain"];
            result.push(Array.isArray(plain) ? plain.join("") : plain);
          } else if (data["text/html"]) {
            result.push("[HTML output]");
          } else if (data["image/png"]) {
            result.push("[Image: PNG]");
          } else if (data["image/svg+xml"]) {
            result.push("[Image: SVG]");
          }
          break;
        }
        case "error": {
          const traceback = (output.traceback ?? []).slice(-BaseTool.MAX_TRACEBACK_LINES);
          result.push(
            `[ERROR: ${output.ename}: ${output.evalue}]\n${traceback.join("\n")}`
          );
          break;
        }
      }
    }

    const joined = result.join("\n");
    if (joined.length > BaseTool.MAX_OUTPUT_CHARS) {
      return [this.truncateOutput(joined)];
    }
    return result;
  }

  /**
   * Summarize cell outputs as nbformat output_type plus mime keys (or stream channel).
   * Used for read_notebook detailed view so listing many cells does not embed output bodies.
   */
  protected extractOutputSummary(outputs: CellOutput[]): string[] {
    const result: string[] = [];

    for (const output of outputs) {
      switch (output.output_type) {
        case "stream": {
          const channel = output.name?.trim() || "stream";
          result.push(`stream (${channel})`);
          break;
        }
        case "execute_result":
        case "display_data": {
          const data = output.data;
          if (!data || Object.keys(data).length === 0) {
            result.push(`${output.output_type} (no mime data)`);
          } else {
            const mimes = Object.keys(data).sort().join(", ");
            result.push(`${output.output_type}: ${mimes}`);
          }
          break;
        }
        case "error": {
          result.push("error");
          break;
        }
        default: {
          const ot = (output as { output_type?: string }).output_type;
          if (ot) {
            result.push(ot);
          }
          break;
        }
      }
    }

    return result;
  }

  // ============================================================================
  // Kernel Utilities
  // ============================================================================

  /**
   * Wait for the kernel to reach idle state.
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @throws Error if kernel does not become idle within timeout
   */
  protected async waitForKernelIdle(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = this.kernelService.getStatus();
      if (status === "idle") {
        return;
      }

      // Check traffic light if sidecar is available
      if (this.sidecar) {
        const trafficLight = this.sidecar.getTrafficLightState();
        if (trafficLight === "red") {
          throw new Error("Kernel is unavailable (blocked or dead)");
        }
      }

      await this.sleep(500);
    }

    throw new Error(
      `Kernel did not become idle within ${timeoutMs / 1000} seconds`
    );
  }

  /**
   * Execute code in the kernel and collect all outputs.
   *
   * @param code - Python code to execute
   * @param timeoutMs - Maximum execution time in milliseconds
   * @returns Array of collected output strings and images
   */
  protected async executeCode(
    code: string,
    timeoutMs: number = 60000
  ): Promise<string[]> {
    const outputs: string[] = [];
    let completed = false;

    const executionFuture = await this.kernelService.execute(code, (msg) => {
      const msgType = msg.header?.msg_type;

      switch (msgType) {
        case "stream": {
          const text = msg.content?.text;
          if (text) {
            outputs.push(typeof text === "string" ? text : text.join(""));
          }
          break;
        }
        case "execute_result":
        case "display_data": {
          const data = msg.content?.data;
          if (data?.["text/plain"]) {
            const plain = data["text/plain"];
            outputs.push(typeof plain === "string" ? plain : plain.join(""));
          } else if (data?.["image/png"]) {
            outputs.push("[Image: PNG]");
          }
          break;
        }
        case "error": {
          const ename = msg.content?.ename || "Error";
          const evalue = msg.content?.evalue || "Unknown error";
          const traceback = (msg.content?.traceback || []).slice(-BaseTool.MAX_TRACEBACK_LINES);
          outputs.push(
            `[ERROR: ${ename}: ${evalue}]\n${traceback.join("\n")}`
          );
          break;
        }
        case "execute_reply": {
          completed = true;
          break;
        }
      }
    });
    const executionPromise = executionFuture.done.then(() => {
      completed = true;
    });

    // Race between execution and timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          reject(
            new Error(
              `Execution timed out after ${timeoutMs / 1000} seconds`
            )
          );
        }
      }, timeoutMs);

      executionPromise.finally(() => {
        clearTimeout(timeoutHandle);
      });
    });

    try {
      await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      // On timeout, try to interrupt the kernel
      try {
        await this.kernelService.interrupt();
        outputs.push("[Execution interrupted due to timeout]");
      } catch {
        outputs.push("[Failed to interrupt kernel after timeout]");
      }
    }

    const joined = outputs.join("\n");
    if (joined.length > BaseTool.MAX_OUTPUT_CHARS) {
      return [this.truncateOutput(joined)];
    }
    return outputs;
  }

  // ============================================================================
  // Formatting Utilities
  // ============================================================================

  /**
   * Format data as a tab-separated table.
   *
   * @param headers - Column headers
   * @param rows - Table rows
   * @returns TSV-formatted string
   */
  protected formatTSV(headers: string[], rows: string[][]): string {
    const lines: string[] = [headers.join("\t")];
    for (const row of rows) {
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }

  /**
   * Format file size in human-readable form.
   */
  protected formatSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
      return `${sizeBytes}B`;
    } else if (sizeBytes < 1024 * 1024) {
      return `${(sizeBytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  }

  /**
   * Get a brief overview of a cell (first line + hidden line count).
   */
  protected getCellOverview(cell: NotebookCell): string {
    const source = this.normalizeCellSource(cell.source);
    const lines = source.split("\n");
    if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
      return "(empty)";
    }

    const firstLine = lines[0].trim();
    if (lines.length > 1) {
      return `${firstLine}...  (${lines.length - 1} more lines)`;
    }
    return firstLine;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Sleep utility for async polling.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
