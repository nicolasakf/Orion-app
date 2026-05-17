"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";

/**
 * Render notebook execution errors with traceback details.
 */
export function ErrorOutputRenderer({
  output,
  ansiConverter,
}: NotebookMimeRendererProps): JSX.Element {
  return (
    <div className="p-3 dark:bg-red-950/30 bg-red-50">
      <div className="text-red-600 font-bold text-sm">
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
