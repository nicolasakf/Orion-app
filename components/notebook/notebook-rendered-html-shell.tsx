"use client";

import type { JSX } from "react";

import { handleNotebookRenderedLinkClick } from "@/lib/markdown/notebook-links";
import { cn } from "@/lib/utils";

interface NotebookRenderedHtmlShellProps {
  className?: string;
  html: string;
}

/**
 * Renders trusted notebook HTML while routing external anchor clicks out of Orion.
 */
export function NotebookRenderedHtmlShell({
  className,
  html,
}: NotebookRenderedHtmlShellProps): JSX.Element {
  return (
    <div
      className={cn(className)}
      onClickCapture={handleNotebookRenderedLinkClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
