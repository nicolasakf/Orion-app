"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Render nteract model debug MIME bundles as an inspection panel.
 */
export function NteractModelDebugOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const model = asRecord(value);
  const entries = Object.entries(model);

  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/30 p-3">
        <div className="font-medium">nteract model debug</div>
        <div className="text-sm text-muted-foreground">
          {entries.length} field{entries.length === 1 ? "" : "s"}
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">No model fields included.</div>
      ) : (
        <dl className="divide-y text-sm">
          {entries.map(([key, entryValue]) => (
            <div key={key} className="grid gap-1 p-3 md:grid-cols-[12rem_1fr]">
              <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
              <dd>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {formatValue(entryValue)}
                </pre>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
