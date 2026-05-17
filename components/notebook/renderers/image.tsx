"use client";

import { useState, type JSX } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const {
    cellIndex,
    outputIndex,
    onClearOutput,
    onCopyOutput,
    onHideOutput,
    onToggleOutputAppView,
    isInAppView,
  } = actions;

  const canShowContextMenu = !!(onClearOutput && onCopyOutput && onHideOutput);
  const imageNode = (
    <img
      src={src}
      alt={alt}
      className="max-w-full cursor-pointer"
      onDoubleClick={() => setIsFullScreenOpen(true)}
    />
  );

  return (
    <>
      {canShowContextMenu ? (
        <OutputContextMenu
          cellIndex={cellIndex}
          outputIndex={outputIndex}
          onClearOutput={onClearOutput!}
          onCopyOutput={onCopyOutput!}
          onHideOutput={onHideOutput!}
          onToggleAppView={onToggleOutputAppView}
          isInAppView={!!isInAppView}
          onOpenFullScreen={() => setIsFullScreenOpen(true)}
          presentationMenu={actions.presentationMenu ?? undefined}
        >
          {imageNode}
        </OutputContextMenu>
      ) : (
        imageNode
      )}
      <Dialog open={isFullScreenOpen} onOpenChange={setIsFullScreenOpen}>
        <DialogContent
          hideCloseButton
          className="max-w-[98vw] max-h-[98vh] w-fit p-2 overflow-auto border-0"
        >
          <img
            src={src}
            alt={alt}
            className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
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
