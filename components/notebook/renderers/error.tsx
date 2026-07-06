"use client";

import { Sparkles } from "lucide-react";
import type { JSX } from "react";

import { dispatchInsertChatMessage } from "@/lib/chat/chat-composer-events";
import type { NotebookMimeRendererProps } from "./types";

/**
 * Render notebook execution errors with traceback details.
 */
export function ErrorOutputRenderer({
  output,
  ansiConverter,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const cellLabel = `cell #${actions.cellIndex}`;

  return (
    <div className="relative bg-red-50 p-3 dark:bg-red-950/30">
      {!actions.isFullScreen && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dispatchInsertChatMessage(`Fix this error in ${cellLabel}.`);
          }}
          className="corner-squircle absolute right-8 top-2 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-red-700/70 transition-colors hover:bg-red-100/70 hover:text-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/40 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-red-200"
          aria-label={`Fix this error in ${cellLabel} on chat`}
          title={`Fix this error in ${cellLabel} on chat`}
        >
          <Sparkles className="h-3 w-3" />
          Fix on chat
        </button>
      )}
      <div className="pr-32 text-sm font-bold text-red-600">
        {output.ename}: {output.evalue}
      </div>
      {output.traceback && (
        <pre
          className="whitespace-pre-wrap text-xs mt-2"
          dangerouslySetInnerHTML={{
            __html: ansiConverter.toHtml(output.traceback.join("\n")),
          }}
        />
      )}
    </div>
  );
}
