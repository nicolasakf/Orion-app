"use client";

import type { JSX } from "react";
import { OutputContextMenu } from "@/components/notebook/output-context-menu";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

/**
 * Render Plotly HTML output inside a sandboxed iframe so script tags execute.
 */
export function PlotlyHtmlOutputRenderer({
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const {
    cellIndex,
    outputIndex,
    onClearOutput,
    onCopyOutput,
    onHideOutput,
    onMentionOutput,
    onGoToSource,
    onToggleOutputAppView,
    isInAppView,
    businessMode,
  } = actions;
  const canShowContextMenu = !!(
    onClearOutput ||
    onCopyOutput ||
    onHideOutput ||
    onMentionOutput ||
    onGoToSource ||
    onToggleOutputAppView
  );

  const frame = (
    <iframe
      className={
        actions.isFullScreen
          ? "w-[95vw] max-w-[95vw] min-h-[85vh] border-0 plotly-html-container"
          : "w-full min-h-[420px] border-0 plotly-html-container"
      }
      sandbox="allow-scripts allow-same-origin"
      srcDoc={toJoinedString(value)}
      title="Plotly HTML output"
    />
  );

  if (!canShowContextMenu || actions.isFullScreen) {
    return frame;
  }

  return (
    <OutputContextMenu
      cellIndex={cellIndex}
      outputIndex={outputIndex}
      onClearOutput={onClearOutput}
      onCopyOutput={onCopyOutput}
      onHideOutput={onHideOutput}
      onMentionOutput={onMentionOutput}
      onGoToSource={onGoToSource}
      onToggleAppView={onToggleOutputAppView}
      isInAppView={!!isInAppView}
      businessMode={businessMode}
      onOpenFullScreen={actions.onOpenFullScreen}
      presentationMenu={actions.presentationMenu ?? undefined}
    >
      {frame}
    </OutputContextMenu>
  );
}
