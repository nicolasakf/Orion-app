"use client";

import type { JSX } from "react";
import { OutputContextMenu } from "@/components/notebook/output-context-menu";
import type { NotebookMimeRendererProps } from "./types";
import { toJoinedString } from "./types";

interface ImageOutputWrapperProps {
  src: string;
  alt: string;
  actions: NotebookMimeRendererProps["actions"];
}

/**
 * Wrap image output with full-screen support and context menu actions.
 */
function ImageOutputWrapper({
  src,
  alt,
  actions,
}: ImageOutputWrapperProps): JSX.Element {
  const {
    cellIndex,
    outputIndex,
    onClearOutput,
    onCopyOutput,
    onHideOutput,
    onMentionOutput,
    onToggleOutputAppView,
    isInAppView,
    businessMode,
    onOpenFullScreen,
    isFullScreen,
  } = actions;

  const canShowContextMenu = !!(
    onClearOutput ||
    onCopyOutput ||
    onHideOutput ||
    onMentionOutput ||
    onToggleOutputAppView
  );
  const imageNode = (
    <img
      src={src}
      alt={alt}
      className={
        isFullScreen
          ? "max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
          : "max-w-full cursor-pointer"
      }
      onDoubleClick={
        isFullScreen || !onOpenFullScreen
          ? undefined
          : () => onOpenFullScreen()
      }
    />
  );

  if (!canShowContextMenu || isFullScreen) {
    return imageNode;
  }

  return (
    <OutputContextMenu
      cellIndex={cellIndex}
      outputIndex={outputIndex}
      onClearOutput={onClearOutput}
      onCopyOutput={onCopyOutput}
      onHideOutput={onHideOutput}
      onMentionOutput={onMentionOutput}
      onToggleAppView={onToggleOutputAppView}
      isInAppView={!!isInAppView}
      businessMode={businessMode}
      onOpenFullScreen={onOpenFullScreen}
      presentationMenu={actions.presentationMenu ?? undefined}
    >
      {imageNode}
    </OutputContextMenu>
  );
}

/**
 * Render raster image outputs from base64 payloads.
 */
export function ImageOutputRenderer({
  mimeType,
  value,
  actions,
}: NotebookMimeRendererProps): JSX.Element {
  const data = toJoinedString(value);
  const src = `data:${mimeType};base64,${data}`;
  return (
    <ImageOutputWrapper
      src={src}
      alt={`${mimeType} output`}
      actions={actions}
    />
  );
}
