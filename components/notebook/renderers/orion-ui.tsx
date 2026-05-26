"use client";

import type { JSX } from "react";

import { OrionUiPrimitiveTree } from "@/components/notebook/orion-ui-primitives";
import type { OrionUiRenderCallbacks } from "@/components/notebook/orion-ui-primitives";
import { parseOrionUiMimePayload } from "@/lib/notebook/app-view";
import type { NotebookMimeRendererProps } from "./types";

/**
 * Render an Orion-native declarative UI MIME payload with shared notebook/app primitives.
 */
export function OrionUiOutputRenderer({
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
    onStateChange: (key, nextValue) =>
      actions.onOrionUiStateChange?.(key, nextValue, parsed.payload.id),
    onAction: actions.onOrionUiAction,
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
