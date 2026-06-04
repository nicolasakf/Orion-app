"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";

interface DataResourceField {
  name?: string;
  title?: string;
  type?: string;
}

interface DataResourcePayload {
  name?: string;
  title?: string;
  description?: string;
  schema?: {
    fields?: DataResourceField[];
  };
  data?: unknown;
  values?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rowsFromPayload(payload: DataResourcePayload): Record<string, unknown>[] {
  const candidate = payload.data ?? payload.values;
  if (Array.isArray(candidate)) {
    return candidate
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row !== null);
  }
  const nested = asRecord(candidate);
  if (Array.isArray(nested?.values)) {
    return nested.values
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row !== null);
  }
  return [];
}

function fieldsFromPayload(
  payload: DataResourcePayload,
  rows: Record<string, unknown>[]
): DataResourceField[] {
  const declaredFields = payload.schema?.fields ?? [];
  if (declaredFields.length > 0) {
    return declaredFields;
  }
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Array.from(keys).map((name) => ({ name }));
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Render Frictionless Data Resource bundles as a schema-aware table.
 */
export function DataResourceOutputRenderer({
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const payload = (asRecord(value) ?? {}) as DataResourcePayload;
  const rows = rowsFromPayload(payload);
  const fields = fieldsFromPayload(payload, rows);
  const title = payload.title ?? payload.name ?? "Data resource";

  return (
    <div
      className={
        actions.isFullScreen ? "w-max max-w-[98vw] rounded-md border" : "rounded-md border"
      }
    >
      <div className="border-b bg-muted/30 p-3">
        <div className="font-medium">{title}</div>
        {payload.description && (
          <div className="mt-1 text-sm text-muted-foreground">{payload.description}</div>
        )}
      </div>
      {fields.length > 0 && (
        <div
          className={
            actions.isFullScreen ? "w-max max-w-[98vw] overflow-visible" : "overflow-x-auto"
          }
        >
          <table
            className={
              actions.isFullScreen
                ? "w-max border-collapse text-sm"
                : "w-full border-collapse text-sm"
            }
          >
            <thead>
              <tr className="border-b bg-muted/20">
                {fields.map((field, index) => (
                  <th key={`${field.name ?? index}`} className="px-3 py-2 text-left font-medium">
                    {field.title ?? field.name ?? `Column ${index + 1}`}
                    {field.type && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {field.type}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-b-0">
                  {fields.map((field, fieldIndex) => (
                    <td
                      key={`${field.name ?? fieldIndex}-${rowIndex}`}
                      className="px-3 py-2 align-top"
                    >
                      {formatCell(field.name ? row[field.name] : undefined)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && (
        <div className="p-3 text-sm text-muted-foreground">
          No tabular rows were included in this data resource.
        </div>
      )}
      {rows.length > 100 && (
        <div className="border-t p-2 text-xs text-muted-foreground">
          Showing first 100 of {rows.length} rows.
        </div>
      )}
    </div>
  );
}
