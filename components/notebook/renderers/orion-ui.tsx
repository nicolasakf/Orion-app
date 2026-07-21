"use client";

import type { JSX } from "react";

import { OrionUiPrimitiveTree } from "@/components/notebook/orion-ui-primitives";
import type { OrionUiRenderCallbacks } from "@/components/notebook/orion-ui-primitives";
import type { OrionTableOutputMetadata } from "@/components/notebook/orion-ui-table/types";
import { ORION_UI_MIME_TYPE, parseOrionUiMimePayload } from "@/lib/notebook/app-view";
import type { NotebookMimeRendererProps } from "./types";

/** Coerces a candidate table metadata object into the table metadata shape. */
function parseOutputTableMetadata(candidate: unknown): OrionTableOutputMetadata | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const views = (candidate as Record<string, unknown>).views;
  if (!Array.isArray(views)) {
    return { version: 1, activeViewId: null, views: [] };
  }
  return candidate as OrionTableOutputMetadata;
}

/** Reads table metadata from MIME namespaced output metadata, with legacy fallback. */
function getOutputTableMetadata(
  metadata: unknown,
): OrionTableOutputMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const orionUi = record[ORION_UI_MIME_TYPE];
  const tableMetadata = parseOutputTableMetadata(
    orionUi && typeof orionUi === "object" && !Array.isArray(orionUi)
      ? (orionUi as Record<string, unknown>).table
      : undefined,
  );
  if (tableMetadata) return tableMetadata;

  const orion = record.orion;
  if (!orion || typeof orion !== "object" || Array.isArray(orion)) {
    return null;
  }
  return parseOutputTableMetadata((orion as Record<string, unknown>).table);
}

/**
 * Render an Orion-native declarative UI MIME payload with shared notebook/app primitives.
 */
export function OrionUiOutputRenderer({
  output,
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const parsed = parseOrionUiMimePayload(value);

  if (parsed.status === "invalid") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="font-medium">Orion UI output could not be rendered</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {parsed.errors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  const callbacks: OrionUiRenderCallbacks = {
    onStateChange: (key, nextValue, change) => {
      if (change === undefined) {
        actions.onOrionUiStateChange?.(key, nextValue, parsed.payload.id);
        return;
      }
      actions.onOrionUiStateChange?.(
        key,
        nextValue,
        parsed.payload.id,
        change,
      );
    },
    onAction: actions.onOrionUiAction,
    onUnmount: () => actions.onOrionUiUnmount?.(parsed.payload.id),
    onTableRequest: actions.onOrionUiTableRequest,
    tableMetadata: getOutputTableMetadata(output.metadata),
    onTableMetadataChange: (metadata) => {
      actions.onOrionUiTableMetadataChange?.(
        actions.cellIndex,
        actions.outputIndex,
        metadata,
      );
    },
  };

  return (
    <OrionUiPrimitiveTree
      root={parsed.payload.root}
      initialState={parsed.payload.state}
      callbacks={callbacks}
      className="orion-ui-output"
    />
  );
}
