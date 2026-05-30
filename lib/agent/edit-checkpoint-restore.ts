import type { KernelService } from "@/lib/kernel/kernel-service";
import type { NotebookCellType, NotebookType } from "@/lib/types";
import {
  EditCheckpointSchema,
  hashCheckpointPayload,
  type EditCheckpoint,
  type EditCheckpointTarget,
} from "@/lib/agent/edit-checkpoints";

export interface CheckpointRestoreConflict {
  targetId: string;
  path: string;
  kind: EditCheckpointTarget["kind"];
  reason: string;
}

export interface CheckpointRestoreResult {
  restoredCount: number;
  skippedCount: number;
  conflicts: CheckpointRestoreConflict[];
}

export type CheckpointRestoreDirection = "undo" | "redo";

function normalizeCellSource(source: string[] | string | undefined): string {
  if (Array.isArray(source)) return source.join("");
  return source ?? "";
}

function sourceTextToLines(source: string): string[] {
  return source
    .split("\n")
    .map((line, index, array) => (index === array.length - 1 ? line : `${line}\n`));
}

function getCellId(cell: NotebookCellType | undefined): string | null {
  const id = cell?.metadata?.orion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function parsePayload<T>(target: EditCheckpointTarget, which: "beforeJson" | "afterJson"): T {
  return JSON.parse(target[which]) as T;
}

interface TextPayload {
  content: string;
}

interface CellPayload {
  index: number;
  source: string;
  cell: NotebookCellType | null;
}

/** Restore or redo one checkpoint through the active Jupyter ContentsManager. */
export async function restoreEditCheckpoint(options: {
  kernelService: KernelService;
  requestId: string;
  direction?: CheckpointRestoreDirection;
}): Promise<CheckpointRestoreResult> {
  const direction = options.direction ?? "undo";
  const response = await fetch(`/api/checkpoints/${encodeURIComponent(options.requestId)}`);
  if (!response.ok) {
    throw new Error(`Checkpoint '${options.requestId}' could not be loaded.`);
  }
  const raw = (await response.json()) as { checkpoint?: unknown };
  const checkpoint: EditCheckpoint = EditCheckpointSchema.parse(raw.checkpoint);
  const contents = options.kernelService.getContentsManager();
  const result: CheckpointRestoreResult = {
    restoredCount: 0,
    skippedCount: 0,
    conflicts: [],
  };

  for (const target of checkpoint.targets) {
    if (target.kind === "text_file") {
      await restoreTextFileTarget(contents, target, result, direction);
    } else {
      await restoreNotebookCellTarget(contents, target, result, direction);
    }
  }

  if (result.conflicts.length === 0) {
    await fetch(`/api/checkpoints/${encodeURIComponent(options.requestId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: direction === "undo" ? "reverted" : "completed" }),
    }).catch(() => undefined);
  }

  return result;
}

/** Restore or redo one text-file target if the current content matches the expected side. */
async function restoreTextFileTarget(
  contents: ReturnType<KernelService["getContentsManager"]>,
  target: EditCheckpointTarget,
  result: CheckpointRestoreResult,
  direction: CheckpointRestoreDirection
): Promise<void> {
  const before = parsePayload<TextPayload>(target, "beforeJson");
  const after = parsePayload<TextPayload>(target, "afterJson");
  const current = await contents
    .get(target.path, { content: true, format: "text" })
    .then((model) => (typeof model.content === "string" ? model.content : null))
    .catch(() => null);
  const currentHash = hashCheckpointPayload({ content: current ?? "" });
  const expectedHash = direction === "undo" ? target.afterHash : target.beforeHash;
  const nextContent = direction === "undo" ? before.content : after.content;

  if (expectedHash && currentHash !== expectedHash) {
    result.skippedCount += 1;
    result.conflicts.push({
      targetId: target.targetId ?? target.path,
      path: target.path,
      kind: target.kind,
      reason:
        direction === "undo"
          ? "Current file content differs from the recorded agent output."
          : "Current file content differs from the recorded pre-checkpoint state.",
    });
    return;
  }

  const shouldDelete =
    (direction === "undo" && target.operation === "insert") ||
    (direction === "redo" && target.operation === "delete");

  if (shouldDelete) {
    const maybeDelete = contents as unknown as { delete?: (path: string) => Promise<void> };
    if (maybeDelete.delete) {
      await maybeDelete.delete(target.path);
      result.restoredCount += 1;
      return;
    }
    result.skippedCount += 1;
    result.conflicts.push({
      targetId: target.path,
      path: target.path,
      kind: target.kind,
      reason: "The Jupyter contents manager does not expose file deletion.",
    });
    return;
  }

  await contents.save(target.path, {
    type: "file",
    format: "text",
    content: nextContent,
  });
  result.restoredCount += 1;
}

/** Restore or redo one notebook-cell target if the current cell source matches the expected side. */
async function restoreNotebookCellTarget(
  contents: ReturnType<KernelService["getContentsManager"]>,
  target: EditCheckpointTarget,
  result: CheckpointRestoreResult,
  direction: CheckpointRestoreDirection
): Promise<void> {
  const cellId = target.targetId;
  if (!cellId) {
    result.skippedCount += 1;
    result.conflicts.push({
      targetId: target.path,
      path: target.path,
      kind: target.kind,
      reason: "Notebook checkpoint target has no cell id.",
    });
    return;
  }

  const before = parsePayload<CellPayload>(target, "beforeJson");
  const after = parsePayload<CellPayload>(target, "afterJson");
  const model = await contents.get(target.path, { content: true, type: "notebook" });
  const notebook = model.content as NotebookType;
  const currentIndex = notebook.cells.findIndex((cell) => getCellId(cell) === cellId);
  const expectedHash = direction === "undo" ? target.afterHash : target.beforeHash;

  if (target.operation === "delete") {
    if (direction === "undo") {
      const currentHash = hashCheckpointPayload({ source: "" });
      if (expectedHash && currentHash !== expectedHash) {
        result.skippedCount += 1;
        result.conflicts.push({
          targetId: cellId,
          path: target.path,
          kind: target.kind,
          reason: "Notebook cell state differs from the recorded deletion state.",
        });
        return;
      }
      if (currentIndex !== -1) {
        result.skippedCount += 1;
        result.conflicts.push({
          targetId: cellId,
          path: target.path,
          kind: target.kind,
          reason: "Deleted cell already exists in the notebook.",
        });
        return;
      }
      if (!before.cell) {
        result.skippedCount += 1;
        return;
      }
      const insertIndex = Math.max(0, Math.min(before.index, notebook.cells.length));
      notebook.cells.splice(insertIndex, 0, before.cell);
      await contents.save(target.path, { type: "notebook", format: "json", content: notebook as any });
      result.restoredCount += 1;
      return;
    }

    if (currentIndex === -1) {
      result.skippedCount += 1;
      result.conflicts.push({
        targetId: cellId,
        path: target.path,
        kind: target.kind,
        reason: "Cell no longer exists in the notebook.",
      });
      return;
    }
    const currentCell = notebook.cells[currentIndex];
    const currentSource = normalizeCellSource(currentCell.source);
    const currentHash = hashCheckpointPayload({ source: currentSource });
    if (expectedHash && currentHash !== expectedHash) {
      result.skippedCount += 1;
      result.conflicts.push({
        targetId: cellId,
        path: target.path,
        kind: target.kind,
        reason: "Current cell source differs from the recorded pre-checkpoint state.",
      });
      return;
    }
    notebook.cells.splice(currentIndex, 1);
    await contents.save(target.path, { type: "notebook", format: "json", content: notebook as any });
    result.restoredCount += 1;
    return;
  }

  if (target.operation === "insert" && direction === "redo") {
    const currentHash = hashCheckpointPayload({ source: "" });
    if (expectedHash && currentHash !== expectedHash) {
      result.skippedCount += 1;
      result.conflicts.push({
        targetId: cellId,
        path: target.path,
        kind: target.kind,
        reason: "Notebook cell state differs from the recorded pre-checkpoint state.",
      });
      return;
    }
    if (currentIndex !== -1) {
      result.skippedCount += 1;
      result.conflicts.push({
        targetId: cellId,
        path: target.path,
        kind: target.kind,
        reason: "Inserted cell already exists in the notebook.",
      });
      return;
    }
    if (!after.cell) {
      result.skippedCount += 1;
      return;
    }
    const insertIndex = Math.max(0, Math.min(after.index, notebook.cells.length));
    notebook.cells.splice(insertIndex, 0, after.cell);
    await contents.save(target.path, { type: "notebook", format: "json", content: notebook as any });
    result.restoredCount += 1;
    return;
  }

  if (currentIndex === -1) {
    result.skippedCount += 1;
    result.conflicts.push({
      targetId: cellId,
      path: target.path,
      kind: target.kind,
      reason: "Cell no longer exists in the notebook.",
    });
    return;
  }

  const currentCell = notebook.cells[currentIndex];
  const currentSource = normalizeCellSource(currentCell.source);
  const currentHash = hashCheckpointPayload({ source: currentSource });
  if (expectedHash && currentHash !== expectedHash) {
    result.skippedCount += 1;
    result.conflicts.push({
      targetId: cellId,
      path: target.path,
      kind: target.kind,
      reason:
        direction === "undo"
          ? "Current cell source differs from the recorded agent output."
          : "Current cell source differs from the recorded pre-checkpoint state.",
    });
    return;
  }

  if (target.operation === "insert") {
    notebook.cells.splice(currentIndex, 1);
  } else {
    const next = direction === "undo" ? before : after;
    currentCell.source = sourceTextToLines(next.source);
    if (next.cell?.cell_type === "code" && currentCell.cell_type === "code") {
      currentCell.outputs = next.cell.outputs ?? [];
      currentCell.execution_count = next.cell.execution_count ?? null;
    }
  }

  await contents.save(target.path, { type: "notebook", format: "json", content: notebook as any });
  result.restoredCount += 1;
}
