"use client";

import type { NotebookOutputType } from "@/lib/types";
import ansiToHtml from "ansi-to-html";
import { useTheme } from "next-themes";
import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { OutputContextMenu } from "./output-context-menu";
import { OutputFullScreenDialog } from "./output-full-screen-dialog";
import { cn } from "@/lib/utils";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import {
  getDefaultMimeRegistry,
  getOutputMimeBundle,
} from "@/lib/notebook/mime-registry";
import { MIME_RENDERERS } from "@/components/notebook/renderers";
import {
  getOutputPresentationMimes,
  resolveOutputForPresentation,
} from "@/components/notebook/output-presentation";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import type {
  OrionTableCommResponse,
  OrionTableOutputMetadata,
  OrionTableRequest,
} from "@/components/notebook/orion-ui-table/types";

const COLLAPSED_HEIGHT_DEFAULT = 192; // px — matches Tailwind h-48
const COLLAPSED_HEIGHT_MIN = 64; // px

/**
 * Wraps text-based output content with a collapsible container.
 * When collapsed, content is height-limited and uses edge gradients to hint overflow.
 * A drag handle at the bottom allows resizing the collapsed height.
 * A toggle button is shown only when the content exceeds the collapsed height.
 */
function CollapsibleOutputWrapper({
  children,
  isCollapsed,
  onToggleCollapse,
  onCollapsibleChange,
  scrollToEndWhenCollapsed = false,
  className,
  ...divProps
}: React.HTMLAttributes<HTMLDivElement> & {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCollapsibleChange?: (isCollapsible: boolean) => void;
  /** When collapsed, scroll the viewport to the bottom (e.g. long error tracebacks). */
  scrollToEndWhenCollapsed?: boolean;
}) {
  const [collapsedHeight, setCollapsedHeight] = useState(
    COLLAPSED_HEIGHT_DEFAULT,
  );
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [scrollEdges, setScrollEdges] = useState({ top: false, bottom: false });

  /**
   * Checks whether output content is taller than the default collapsed height.
   */
  const updateIsCollapsible = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canCollapse = el.scrollHeight > COLLAPSED_HEIGHT_DEFAULT + 1;
    setIsCollapsible((prev) => (prev === canCollapse ? prev : canCollapse));
  }, []);

  /**
   * Tracks visible vertical scroll edges for gradient affordances.
   */
  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setScrollEdges({
      top: scrollTop > 0,
      bottom: scrollTop + clientHeight < scrollHeight - 1,
    });
  }, []);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      startY.current = e.clientY;
      startHeight.current = collapsedHeight;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = ev.clientY - startY.current;
        setCollapsedHeight(
          Math.max(COLLAPSED_HEIGHT_MIN, startHeight.current + delta),
        );
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [collapsedHeight],
  );

  const shouldCollapse = isCollapsed && isCollapsible;

  // Reset height when transitioning from expanded back to collapsed
  const prevIsCollapsed = useRef(isCollapsed);
  useEffect(() => {
    if (!prevIsCollapsed.current && isCollapsed) {
      setCollapsedHeight(COLLAPSED_HEIGHT_DEFAULT);
    }
    prevIsCollapsed.current = isCollapsed;
  }, [isCollapsed]);

  useEffect(() => {
    onCollapsibleChange?.(isCollapsible);
  }, [isCollapsible, onCollapsibleChange]);

  useEffect(() => {
    if (!isCollapsible && isCollapsed) {
      onToggleCollapse();
    }
  }, [isCollapsible, isCollapsed, onToggleCollapse]);

  /**
   * Long auto-collapsed errors show the traceback end (message) instead of the top of the stack.
   */
  useEffect(() => {
    if (!shouldCollapse || !scrollToEndWhenCollapsed) return;
    const el = scrollRef.current;
    if (!el) return;

    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight;
      updateScrollEdges();
    };

    scrollToEnd();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToEnd);
    });
    return () => cancelAnimationFrame(raf);
  }, [
    shouldCollapse,
    scrollToEndWhenCollapsed,
    children,
    collapsedHeight,
    updateScrollEdges,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      updateIsCollapsible();
      if (shouldCollapse) {
        updateScrollEdges();
      } else {
        setScrollEdges({ top: false, bottom: false });
      }
    };

    sync();
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(el);
    el.addEventListener("scroll", updateScrollEdges);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("scroll", updateScrollEdges);
    };
  }, [
    children,
    collapsedHeight,
    shouldCollapse,
    updateIsCollapsible,
    updateScrollEdges,
  ]);

  return (
    <div className={cn("relative group/collapse", className)} {...divProps}>
      <div className="relative">
        <div
          ref={scrollRef}
          className={cn(shouldCollapse && "overflow-y-auto")}
          style={
            shouldCollapse
              ? {
                  height: `${collapsedHeight}px`,
                }
              : {}
          }
        >
          {children}
        </div>
        {shouldCollapse && scrollEdges.top && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-background to-transparent"
            aria-hidden
          />
        )}
        {shouldCollapse && scrollEdges.bottom && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-background to-transparent"
            aria-hidden
          />
        )}
      </div>

      {/* Resize handle — only visible when collapsed */}
      {shouldCollapse && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 flex items-center justify-center cursor-ns-resize group/resize z-20"
          onMouseDown={handleResizeMouseDown}
          title="Drag to resize"
        >
          <div className="w-10 h-0.5 rounded-full bg-muted-foreground/30 group-hover/resize:bg-muted-foreground/60 transition-colors" />
        </div>
      )}

      {/* Collapse / expand toggle button */}
      {isCollapsible && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className={cn(
            "absolute top-1 right-1 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity z-20",
            shouldCollapse
              ? "opacity-70 hover:opacity-100"
              : "opacity-0 group-hover/collapse:opacity-70 hover:opacity-100",
          )}
          title={shouldCollapse ? "Expand output" : "Collapse output"}
        >
          {shouldCollapse ? (
            <ChevronsUpDown className="h-3 w-3" />
          ) : (
            <ChevronsDownUp className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}

interface OutputRendererProps {
  output: NotebookOutputType;
  notebookMetadata?: Record<string, unknown>;
  cellIndex?: number;
  outputIndex?: number;
  onClearOutput?: (cellIndex: number, outputIndex: number) => void;
  onCopyOutput?: (cellIndex: number, outputIndex: number) => void;
  onHideOutput?: (cellIndex: number, outputIndex: number) => void;
  onMentionOutput?: (cellIndex: number, outputIndex: number) => void;
  onToggleOutputAppView?: (cellIndex: number, outputIndex: number) => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
  onOrionUiTableRequest?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  onOrionUiTableMetadataChange?: (
    cellIndex: number,
    outputIndex: number,
    metadata: OrionTableOutputMetadata,
  ) => void;
  isInAppView?: boolean;
  /** When true, App View toggle labels are shortened for Business View. */
  businessMode?: boolean;
  /** Whether this output is collapsed (for text-based outputs) */
  isCollapsed?: boolean;
  /** Callback to toggle the collapsed state (only provided for text-based outputs) */
  onToggleCollapse?: () => void;
  /**
   * When true with collapsed large error output, the collapsed viewport scrolls to the bottom
   * so the final error lines are visible (matches auto-collapse for long tracebacks).
   */
  scrollCollapsedToEnd?: boolean;
}

export function OutputRenderer({
  output,
  notebookMetadata,
  cellIndex = 0,
  outputIndex = 0,
  onClearOutput,
  onCopyOutput,
  onHideOutput,
  onMentionOutput,
  onToggleOutputAppView,
  onOrionUiStateChange,
  onOrionUiAction,
  onOrionUiTableRequest,
  onOrionUiTableMetadataChange,
  isInAppView,
  businessMode = false,
  isCollapsed,
  onToggleCollapse,
  scrollCollapsedToEnd,
}: OutputRendererProps) {
  const { theme } = useTheme();
  const [isOutputCollapsible, setIsOutputCollapsible] = useState(false);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const openFullScreen = useCallback(() => setIsFullScreenOpen(true), []);
  const mimeRegistry = useMemo(() => getDefaultMimeRegistry(), []);

  // Create theme-aware ANSI converter
  const ansiConverter = useMemo(() => {
    if (theme === "light") {
      // For light themes, use darker colors to ensure visibility
      return new ansiToHtml({
        fg: "#000000", // Default foreground color (black)
        bg: "#ffffff", // Default background color (white)
        escapeXML: true,
        colors: {
          0: "#000000", // black -> black
          1: "#800000", // red -> dark red
          2: "#008000", // green -> dark green
          3: "#808000", // yellow -> dark yellow/brown
          4: "#000080", // blue -> dark blue
          5: "#800080", // magenta -> dark magenta
          6: "#008080", // cyan -> dark cyan
          7: "#7a7785", // white -> dark gray
          8: "#808080", // bright black -> gray
          9: "#ff0000", // bright red -> red
          10: "#00ff00", // bright green -> green
          11: "#ffff00", // bright yellow -> yellow
          12: "#0000ff", // bright blue -> blue
          13: "#ff00ff", // bright magenta -> magenta
          14: "#00ffff", // bright cyan -> cyan
          15: "#7a7785", // bright white -> black
        },
      });
    } else {
      return new ansiToHtml({
        escapeXML: true,
        colors: {
          4: "#3C3CFF", // blue -> dark blue
        },
      });
    }
  }, [theme]);

  /**
   * Placeholder sanitizer hook; trusted outputs currently pass through unchanged.
   */
  const sanitize = useCallback((html: string) => html, []);

  const trusted = output.metadata?.trusted !== false;

  const outputMimeBundle = useMemo(() => getOutputMimeBundle(output), [output]);
  const outputBundleSignature = useMemo(() => {
    return Object.keys(outputMimeBundle)
      .filter((k) => outputMimeBundle[k] !== undefined)
      .sort()
      .join("\0");
  }, [outputMimeBundle]);
  const isSuppressedOutput =
    Object.keys(output.data ?? {}).length > 0 && Object.keys(outputMimeBundle).length === 0;

  const [presentationMimeOverride, setPresentationMimeOverride] = useState<
    string | null
  >(null);
  const prevBundleSigRef = useRef(outputBundleSignature);
  useEffect(() => {
    if (prevBundleSigRef.current !== outputBundleSignature) {
      setPresentationMimeOverride(null);
      prevBundleSigRef.current = outputBundleSignature;
    }
  }, [outputBundleSignature]);

  const effectiveResolved = useMemo(
    () =>
      resolveOutputForPresentation(
        mimeRegistry,
        output,
        trusted,
        presentationMimeOverride,
      ),
    [mimeRegistry, output, trusted, presentationMimeOverride],
  );

  const presentationMimes = useMemo(
    () => getOutputPresentationMimes(mimeRegistry, output, trusted),
    [mimeRegistry, output, trusted],
  );

  const sharedPresentationMenu = useMemo(() => {
    if (presentationMimes.length <= 1 || !effectiveResolved) {
      return null;
    }
    return {
      options: presentationMimes.map(({ mimeType, label }) => ({
        mimeType,
        label,
      })),
      value: effectiveResolved.mimeType,
      onValueChange: (mime: string) => {
        setPresentationMimeOverride(mime);
      },
    };
  }, [presentationMimes, effectiveResolved]);

  /**
   * Wraps content with the output context menu.
   * Pass `collapsible=true` to include the collapse/expand option in the menu.
   */
  const wrapWithContextMenu = useCallback(
    (content: React.ReactNode, collapsible = false) => {
      if (
        onClearOutput ||
        onCopyOutput ||
        onHideOutput ||
        onMentionOutput ||
        onToggleOutputAppView
      ) {
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
            onOpenFullScreen={openFullScreen}
            isCollapsed={isCollapsed}
            onToggleCollapse={
              collapsible && isOutputCollapsible ? onToggleCollapse : undefined
            }
            presentationMenu={sharedPresentationMenu ?? undefined}
          >
            <div className="orion-output-context-menu-trigger min-w-0 w-full">
              {content}
            </div>
          </OutputContextMenu>
        );
      }
      return content;
    },
    [
      onClearOutput,
      onCopyOutput,
      onHideOutput,
      onMentionOutput,
      onToggleOutputAppView,
      isInAppView,
      businessMode,
      cellIndex,
      outputIndex,
      openFullScreen,
      isCollapsed,
      onToggleCollapse,
      isOutputCollapsible,
      sharedPresentationMenu,
    ],
  );

  const sharedActions = useMemo(
    () => ({
      cellIndex,
      outputIndex,
      onClearOutput,
      onCopyOutput,
      onHideOutput,
      onMentionOutput,
      onToggleOutputAppView,
      onOrionUiStateChange,
      onOrionUiAction,
      onOrionUiTableRequest,
      onOrionUiTableMetadataChange,
      isInAppView: !!isInAppView,
      businessMode,
      onOpenFullScreen: openFullScreen,
      presentationMenu: sharedPresentationMenu,
    }),
    [
      cellIndex,
      outputIndex,
      onClearOutput,
      onCopyOutput,
      onHideOutput,
      onMentionOutput,
      onToggleOutputAppView,
      onOrionUiStateChange,
      onOrionUiAction,
      onOrionUiTableRequest,
      onOrionUiTableMetadataChange,
      isInAppView,
      businessMode,
      openFullScreen,
      sharedPresentationMenu,
    ],
  );

  /**
   * Renders the resolved MIME output body, optionally for the full-screen dialog.
   */
  const renderMimeBody = useCallback(
    (opts?: { fullScreen?: boolean }) => {
      if (!effectiveResolved) {
        return null;
      }

      const Renderer = MIME_RENDERERS[effectiveResolved.mimeType];
      if (!Renderer) {
        return null;
      }

      let body: React.ReactNode = (
        <Renderer
          output={output}
          notebookMetadata={notebookMetadata}
          mimeType={effectiveResolved.mimeType}
          value={effectiveResolved.value}
          theme={theme === "light" ? "light" : "dark"}
          trusted={trusted}
          ansiConverter={ansiConverter}
          sanitize={sanitize}
          actions={{
            ...sharedActions,
            isFullScreen: opts?.fullScreen,
          }}
        />
      );

      if (
        effectiveResolved.factory.collapsible &&
        !opts?.fullScreen &&
        onToggleCollapse
      ) {
        body = (
          <CollapsibleOutputWrapper
            isCollapsed={!!isCollapsed}
            onToggleCollapse={onToggleCollapse}
            onCollapsibleChange={setIsOutputCollapsible}
            scrollToEndWhenCollapsed={!!scrollCollapsedToEnd}
          >
            {body}
          </CollapsibleOutputWrapper>
        );
      }

      return body;
    },
    [
      effectiveResolved,
      output,
      notebookMetadata,
      theme,
      trusted,
      ansiConverter,
      sanitize,
      sharedActions,
      onToggleCollapse,
      isCollapsed,
      scrollCollapsedToEnd,
    ],
  );

  const wrapWithFullScreenDialog = useCallback(
    (content: React.ReactNode) => (
      <>
        {content}
        <OutputFullScreenDialog
          open={isFullScreenOpen}
          onOpenChange={setIsFullScreenOpen}
        >
          {renderMimeBody({ fullScreen: true })}
        </OutputFullScreenDialog>
      </>
    ),
    [isFullScreenOpen, renderMimeBody],
  );

  // Check if output is hidden
  const isHidden = output.metadata?.orion?.hidden === true;

  // If hidden, render a minimal placeholder
  if (isHidden) {
    return (
      <div
        className="text-xs text-muted-foreground p-2 cursor-pointer hover:bg-accent rounded"
        onClick={() => {
          if (onHideOutput) {
            onHideOutput(cellIndex, outputIndex);
          }
        }}
      >
        Output hidden (click to show)
      </div>
    );
  }

  // Plotly's loader-only HTML is intentionally removed from the MIME bundle.
  // Do not turn that internal bootstrap output into an unsupported-MIME warning.
  if (isSuppressedOutput) {
    return null;
  }

  if (!effectiveResolved) {
    const unsupportedMimes = Object.keys(output.data || {});
    const fallbackMessage =
      unsupportedMimes.length === 0
        ? "No renderable output (empty data bundle)."
        : `Orion cannot render this output yet. Unsupported MIME type${unsupportedMimes.length > 1 ? "s" : ""}: ${unsupportedMimes.join(", ")}`;

    return wrapWithContextMenu(
      <div className="text-sm text-muted-foreground p-3">
        {fallbackMessage}
      </div>,
    );
  }

  const Renderer = MIME_RENDERERS[effectiveResolved.mimeType];
  if (!Renderer) {
    return wrapWithContextMenu(
      <div className="text-sm text-muted-foreground p-3">
        Orion does not have a renderer for MIME type{" "}
        <code>{effectiveResolved.mimeType}</code> yet.
      </div>,
    );
  }

  let content: React.ReactNode = renderMimeBody();

  if (!effectiveResolved.factory.disableContextMenu) {
    content = wrapWithContextMenu(
      content,
      !!effectiveResolved.factory.collapsible,
    );
  }

  return wrapWithFullScreenDialog(content);
}
