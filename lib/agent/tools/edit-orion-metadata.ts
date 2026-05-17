/**
 * EditOrionMetadataTool - Modify notebook and cell metadata.orion fields.
 *
 * Applies one or more merge/replace/delete operations inside the Orion-owned
 * metadata namespace without touching source, outputs, execution counts, or
 * non-Orion metadata.
 */

import { BaseTool } from "./base-tool";
import {
  CellOrionMetadataSchema,
  EditOrionMetadataParamsSchema,
  NotebookOrionMetadataSchema,
  isJsonObjectValue,
  type ParsedEditOrionMetadataEntry,
} from "./edit-orion-metadata-schema";
import { NotebookManager } from "./notebook-manager";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { KernelSidecar } from "../kernel-sidecar";
import type {
  EditOrionMetadataParams,
  NotebookCell,
  NotebookDocument,
} from "./types";

type JsonObject = Record<string, unknown>;
type ParsedEditValue =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonObjectValue(value);
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function cloneNotebookDocument(value: NotebookDocument): NotebookDocument {
  return JSON.parse(JSON.stringify(value)) as NotebookDocument;
}

export class EditOrionMetadataTool extends BaseTool {
  private notebookManager: NotebookManager;

  constructor(
    kernelService: KernelService,
    sidecar: KernelSidecar | null,
    notebookManager: NotebookManager
  ) {
    super(kernelService, sidecar);
    this.notebookManager = notebookManager;
  }

  /**
   * Apply one or more edits inside notebook or cell metadata.orion.
   */
  async execute(params: EditOrionMetadataParams): Promise<string> {
    const parsedParams = EditOrionMetadataParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return this.formatZodError("Invalid edit_orion_metadata parameters", parsedParams.error);
    }

    const { edits, notebookId } = parsedParams.data;

    const id = this.resolveNotebookId(notebookId);
    if (!id) {
      return "[ERROR] No notebook specified and no current notebook is active. Use use_notebook first.";
    }

    if (!this.notebookManager.has(id)) {
      return (
        `[WARNING] Notebook ID '${id}' is not connected. ` +
        `All currently connected IDs: ${this.notebookManager.listIds().join(", ") || "none"}`
      );
    }

    const path = this.notebookManager.getNotebookPath(id);
    if (!path) {
      return `[ERROR] Cannot determine path for notebook ID '${id}'.`;
    }

    const originalNotebook = await this.readNotebook(path);
    const validationError = this.validateEditTargets(edits, originalNotebook.cells.length);
    if (validationError) return validationError;

    const parsedValues: unknown[] = [];
    for (let i = 0; i < edits.length; i += 1) {
      const edit = edits[i]!;
      const parsed = this.parseEditValue(edit, i);
      if (!parsed.ok) return parsed.error;
      parsedValues.push(parsed.value);

      if (edit.target === "cell") {
        const cell = originalNotebook.cells[edit.cellIndex];
        if (!cell) {
          return `[ERROR] Edit ${i}: cell index ${edit.cellIndex} is out of range. Notebook has ${originalNotebook.cells.length} cells.`;
        }
        const protectionError = this.validateCellIdProtection(edit, parsed.value, cell, i);
        if (protectionError) return protectionError;
      }
    }

    const notebook = cloneNotebookDocument(originalNotebook);
    const messages: string[] = [];

    for (let i = 0; i < edits.length; i += 1) {
      const edit = edits[i]!;
      const parsedValue = parsedValues[i];

      if (edit.target === "notebook") {
        notebook.metadata = notebook.metadata ?? {};
        const metadata = notebook.metadata as JsonObject;
        const currentOrion = isJsonObject(metadata.orion) ? metadata.orion : {};
        const updatedOrion = this.applyOperation(currentOrion, edit, parsedValue);
        if (updatedOrion === undefined) {
          delete metadata.orion;
        } else {
          metadata.orion = updatedOrion;
        }
        messages.push(this.describeEdit(edit, i));
        continue;
      }

      const cell = notebook.cells[edit.cellIndex];
      if (!cell) {
        return `[ERROR] Edit ${i}: cell index ${edit.cellIndex} is out of range. Notebook has ${notebook.cells.length} cells.`;
      }

      cell.metadata = cell.metadata ?? {};
      const metadata = cell.metadata as JsonObject;
      const currentOrion = isJsonObject(metadata.orion) ? metadata.orion : {};
      const updatedOrion = this.applyOperation(currentOrion, edit, parsedValue);
      if (updatedOrion === undefined) {
        delete metadata.orion;
      } else {
        metadata.orion = updatedOrion;
      }
      messages.push(this.describeEdit(edit, i));
    }

    const metadataValidationError = this.validateEditedMetadata(notebook, edits);
    if (metadataValidationError) return metadataValidationError;

    await this.writeNotebook(path, notebook);

    return `Applied ${edits.length} Orion metadata edit${edits.length === 1 ? "" : "s"} successfully.\n${messages.join("\n")}`;
  }

  /** Resolve the requested notebook id, using the current notebook for empty input. */
  private resolveNotebookId(notebookId: string): string | null {
    const trimmedId = notebookId.trim();
    return trimmedId === "" ? this.notebookManager.getCurrentNotebookId() : trimmedId;
  }

  /** Validate target/index constraints that depend on the current notebook. */
  private validateEditTargets(edits: ParsedEditOrionMetadataEntry[], totalCells: number): string | null {
    for (let i = 0; i < edits.length; i += 1) {
      const edit = edits[i]!;
      if (edit.target === "cell" && (edit.cellIndex < 0 || edit.cellIndex >= totalCells)) {
        return `[ERROR] Edit ${i}: cell index ${edit.cellIndex} is out of range. Notebook has ${totalCells} cells.`;
      }
    }
    return null;
  }

  /** Parse the JSON value required for merge and replace operations. */
  private parseEditValue(edit: ParsedEditOrionMetadataEntry, editIndex: number): ParsedEditValue {
    if (edit.operation === "delete") return { ok: true, value: undefined };

    let value: unknown;
    try {
      value = JSON.parse(edit.valueJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `[ERROR] Edit ${editIndex}: valueJson is not valid JSON: ${message}` };
    }

    if (edit.operation === "merge" && !isJsonObject(value)) {
      return {
        ok: false,
        error: `[ERROR] Edit ${editIndex}: merge requires valueJson to parse to a JSON object. Use replace for arrays or scalars.`,
      };
    }

    if (edit.path.length === 0 && !isJsonObject(value)) {
      return {
        ok: false,
        error: `[ERROR] Edit ${editIndex}: metadata.orion root edits require valueJson to parse to a JSON object.`,
      };
    }

    return { ok: true, value };
  }

  /** Guard stable cell ids from accidental deletion or mutation. */
  private validateCellIdProtection(
    edit: ParsedEditOrionMetadataEntry,
    parsedValue: unknown,
    cell: NotebookCell,
    editIndex: number
  ): string | null {
    const existingOrion = isJsonObject(cell.metadata?.orion) ? cell.metadata.orion : {};
    const existingId = typeof existingOrion.id === "string" ? existingOrion.id : null;

    if (edit.path[0] === "id") {
      return `[ERROR] Edit ${editIndex}: cell metadata.orion.id is protected and cannot be edited.`;
    }

    if (edit.path.length === 0 && edit.operation === "delete" && existingId) {
      return `[ERROR] Edit ${editIndex}: cannot delete cell metadata.orion because it would remove protected id '${existingId}'.`;
    }

    if (edit.path.length === 0 && edit.operation === "replace" && existingId) {
      if (!isJsonObject(parsedValue) || parsedValue.id !== existingId) {
        return `[ERROR] Edit ${editIndex}: replacing cell metadata.orion must preserve protected id '${existingId}'.`;
      }
    }

    if (edit.path.length === 0 && edit.operation === "merge" && existingId && isJsonObject(parsedValue)) {
      if (Object.prototype.hasOwnProperty.call(parsedValue, "id") && parsedValue.id !== existingId) {
        return `[ERROR] Edit ${editIndex}: merge cannot change protected cell metadata.orion.id '${existingId}'.`;
      }
    }

    return null;
  }

  /** Validate edited metadata.orion values against the supported contract. */
  private validateEditedMetadata(
    notebook: NotebookDocument,
    edits: ParsedEditOrionMetadataEntry[]
  ): string | null {
    for (let i = 0; i < edits.length; i += 1) {
      const edit = edits[i]!;
      if (edit.target === "notebook") {
        const metadata = notebook.metadata as JsonObject;
        if (!isJsonObject(metadata.orion)) continue;

        const result = NotebookOrionMetadataSchema.safeParse(metadata.orion);
        if (!result.success) {
          return this.formatZodError(`Edit ${i}: notebook metadata.orion is invalid`, result.error);
        }
        continue;
      }

      const cell = notebook.cells[edit.cellIndex];
      if (!cell || !isJsonObject(cell.metadata?.orion)) continue;

      const result = CellOrionMetadataSchema.safeParse(cell.metadata.orion);
      if (!result.success) {
        return this.formatZodError(`Edit ${i}: cell ${edit.cellIndex} metadata.orion is invalid`, result.error);
      }
    }

    return null;
  }

  /** Apply a single operation to an existing metadata.orion object. */
  private applyOperation(
    currentOrion: JsonObject,
    edit: ParsedEditOrionMetadataEntry,
    parsedValue: unknown
  ): JsonObject | undefined {
    const next = cloneJsonObject(currentOrion);

    if (edit.path.length === 0) {
      if (edit.operation === "delete") {
        return undefined;
      }
      if (edit.operation === "replace") {
        return cloneJsonObject(parsedValue as JsonObject);
      }
      return this.deepMerge(next, parsedValue as JsonObject);
    }

    const parent = this.ensureParent(next, edit.path);
    const key = edit.path[edit.path.length - 1]!;

    if (edit.operation === "delete") {
      delete parent[key];
      return next;
    }

    if (edit.operation === "replace") {
      parent[key] = parsedValue;
      return next;
    }

    const existing = parent[key];
    parent[key] = isJsonObject(existing)
      ? this.deepMerge(existing, parsedValue as JsonObject)
      : cloneJsonObject(parsedValue as JsonObject);
    return next;
  }

  /** Ensure all parent objects on a path exist, replacing non-objects as needed. */
  private ensureParent(root: JsonObject, path: string[]): JsonObject {
    let cursor = root;
    for (const part of path.slice(0, -1)) {
      if (!isJsonObject(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part] as JsonObject;
    }
    return cursor;
  }

  /** Recursively merge JSON object fields, replacing arrays and scalars. */
  private deepMerge(base: JsonObject, patch: JsonObject): JsonObject {
    const out = cloneJsonObject(base);
    for (const [key, value] of Object.entries(patch)) {
      const existing = out[key];
      if (isJsonObject(existing) && isJsonObject(value)) {
        out[key] = this.deepMerge(existing, value);
      } else if (isJsonObject(value)) {
        out[key] = cloneJsonObject(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /** Build a concise success line for an applied edit. */
  private describeEdit(edit: ParsedEditOrionMetadataEntry, index: number): string {
    const target = edit.target === "cell" ? `cell ${edit.cellIndex}` : "notebook";
    const path = edit.path.length === 0 ? "metadata.orion" : `metadata.orion.${edit.path.join(".")}`;
    return `- Edit ${index}: ${edit.operation} ${target} ${path}`;
  }

  /** Render a compact Zod validation error for tool responses. */
  private formatZodError(
    prefix: string,
    error: { issues: Array<{ path: Array<string | number>; message: string }> }
  ): string {
    const details = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "value";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    return `[ERROR] ${prefix}: ${details}`;
  }
}
