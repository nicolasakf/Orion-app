"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render trusted JavaScript MIME output in a sandboxed document.
 */
export function JavaScriptOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const script = toJoinedString(value);
  const safeScript = script.replace(/<\/script/gi, "<\\/script");
  const srcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: inherit;
        font: inherit;
      }
      body {
        padding: 0.75rem;
      }
    </style>
  </head>
  <body>
    <script>${safeScript}</script>
  </body>
</html>`;

  return (
    <iframe
      className="w-full min-h-16 border-0"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      title="JavaScript output"
    />
  );
}
