"use client";

import React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VariableSummary, ColumnInfo } from "@/lib/agent/kernel-sidecar";
import { cn } from "@/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

/** Converts bytes to a human-readable string (e.g. "1.2 MB"). */
function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============================================================================
// Sub-components
// ============================================================================

/** A key/value metadata row used in the info grid. */
function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-mono text-right">{value}</span>
    </div>
  );
}

/** Column stats table for DataFrame / Series summaries. */
function ColumnTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="corner-squircle overflow-auto max-h-52 rounded border border-border text-xs">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            {["Column", "Dtype", "Nulls", "Uniques", "Min", "Max", "Mean"].map((h) => (
              <th
                key={h}
                className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr
              key={col.name}
              className={cn("hover:bg-muted/50", i % 2 === 0 ? "bg-transparent" : "bg-muted/20")}
            >
              <td className="px-2 py-1 font-mono font-medium truncate max-w-[120px]">{col.name}</td>
              <td className="px-2 py-1 text-muted-foreground">{col.dtype}</td>
              <td className="px-2 py-1">{col.nullCount ?? "—"}</td>
              <td className="px-2 py-1">{col.uniqueCount ?? "—"}</td>
              <td className="px-2 py-1">{col.min != null ? String(col.min) : "—"}</td>
              <td className="px-2 py-1">{col.max != null ? String(col.max) : "—"}</td>
              <td className="px-2 py-1">{col.mean != null ? col.mean.toFixed(3) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Main dialog
// ============================================================================

interface VariableDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full inspection result. Null while loading or before any click. */
  summary: VariableSummary | null;
  /** True while inspectVariable() is in flight. */
  loading: boolean;
}

/**
 * Displays a detailed preview of a kernel variable.
 * Shows type-specific sections (metadata grid, DataFrame column table, stats, repr).
 */
export function VariableDetailDialog({
  open,
  onOpenChange,
  summary,
  loading,
}: VariableDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-left">
            <span className="font-mono">{summary?.name ?? "Variable"}</span>
            {!loading && summary?.type && (
              <span className="text-sm font-normal text-muted-foreground font-mono break-all">
                {summary.type}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            Loading…
          </div>
        )}

        {!loading && !summary && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No data available.
          </div>
        )}

        {!loading && summary?.error && (
          <div className="corner-squircle rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {summary.error}
          </div>
        )}

        {!loading && summary && !summary.error && (
          <div className="space-y-4 overflow-auto max-h-[60vh]">
            {/* Metadata grid */}
            {(summary.shape || summary.dtype || summary.memoryUsage || summary.device) && (
              <div className="border-t border-border pt-3 divide-y divide-border/50">
                {summary.shape && (
                  <MetaRow label="Shape" value={`(${summary.shape.join(", ")})`} />
                )}
                {summary.dtype && <MetaRow label="Dtype" value={summary.dtype} />}
                {summary.memoryUsage && (
                  <MetaRow label="Memory" value={formatMemory(summary.memoryUsage)} />
                )}
                {summary.device && <MetaRow label="Device" value={summary.device} />}
              </div>
            )}

            {/* DataFrame / Series column table */}
            {summary.columns && summary.columns.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Columns ({summary.columns.length})
                </p>
                <ColumnTable columns={summary.columns} />
              </div>
            )}

            {/* Stats */}
            {summary.stats && Object.keys(summary.stats).length > 0 && (
              <div className="border-t border-border pt-3 space-y-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">Stats</p>
                {Object.entries(summary.stats).map(([k, v]) => (
                  <MetaRow key={k} label={k} value={String(v)} />
                ))}
              </div>
            )}

            {/* Repr */}
            {summary.repr && (
              <div className="space-y-1 border-t border-border pt-3">
                <pre className="corner-squircle text-xs font-mono bg-muted/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                  {summary.repr}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
