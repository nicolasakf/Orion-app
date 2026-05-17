"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Boxes, RefreshCw } from "lucide-react";

import { useKernelVariables } from "@/hooks/use-kernel-variables";
import { VariableDetailDialog } from "./variable-detail-dialog";
import { StickyAccordionHeaderWithToolbar } from "./sticky-accordion-header-with-toolbar";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { AccordionContent, AccordionItem } from "@/components/ui/accordion";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import type { KernelService } from "@/lib/kernel/kernel-service";
import type { VariableSummary } from "@/lib/agent/kernel-sidecar";
import {
  cn,
  scheduleAfterMinDuration,
  MIN_REFRESH_SPIN_MS,
} from "@/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

/** Accordion header actions: match kernels tab button sizing. */
const SIDEBAR_ACCORDION_TOOLBAR_BTN =
  "text-muted-foreground hover:text-foreground hover:bg-transparent h-5 w-5 px-0 p-0 min-w-0 shrink-0 [&_svg]:size-3.5";

/** Extracts the short class name from a fully-qualified type string. */
function shortType(fullType: string): string {
  const parts = fullType.split(".");
  return parts[parts.length - 1] ?? fullType;
}

/** Formats shape/length into a compact hint string. */
function shapeHint(shape?: number[], length?: number): string | null {
  if (shape && shape.length > 0) return `[${shape.join(", ")}]`;
  if (length != null) return `[${length}]`;
  return null;
}

// ============================================================================
// Component
// ============================================================================

interface VariablesAccordionItemProps {
  kernelService: KernelService | null;
  /** Switches the sidebar to the Kernels tab when the user clicks the connected notebook name. */
  onOpenKernelsTab?: () => void;
}

/**
 * Variables sidebar section: list of kernel variables with refresh in the
 * accordion header (same pattern as the Kernels section).
 */
export function VariablesAccordionItem({
  kernelService,
  onOpenKernelsTab,
}: VariablesAccordionItemProps) {
  const { variables, loading, refresh, inspect } = useKernelVariables(kernelService);

  /** Notebook file backing the active kernel (basename), synced when sessions / active path change. */
  const [connectedNotebookName, setConnectedNotebookName] = useState<string | null>(null);

  useEffect(() => {
    if (!kernelService) {
      setConnectedNotebookName(null);
      return;
    }

    const sync = () => {
      setConnectedNotebookName(kernelService.getActiveNotebookFileName());
    };
    sync();
    return kernelService.onSessionsChanged(sync);
  }, [kernelService]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<VariableSummary | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [isRefreshingVariables, setIsRefreshingVariables] = useState(false);

  const handleVariableClick = useCallback(
    async (name: string) => {
      setSelectedSummary(null);
      setInspecting(true);
      setDialogOpen(true);
      try {
        const summary = await inspect(name);
        setSelectedSummary(summary);
      } finally {
        setInspecting(false);
      }
    },
    [inspect]
  );

  const handleRefreshVariables = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!kernelService) return;
      setIsRefreshingVariables(true);
      const start = Date.now();
      try {
        await refresh();
      } finally {
        scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
          setIsRefreshingVariables(false)
        );
      }
    },
    [kernelService, refresh]
  );

  return (
    <AccordionItem value="vars" className="border-0">
      <StickyAccordionHeaderWithToolbar
        triggerClassName="py-2 px-2 hover:no-underline data-[state=open]:border-b data-[state=open]:border-border"
        toolbar={
          <div className="flex items-center gap-1">
            <ToolbarButton
              onClick={handleRefreshVariables}
              toolTipLabel="Refresh variables"
              className={SIDEBAR_ACCORDION_TOOLBAR_BTN}
              disabled={!kernelService}
              aria-label="Refresh variables"
            >
              <RefreshCw
                className={cn(isRefreshingVariables && "animate-spin")}
              />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-4" />
          </div>
        }
      >
        <div className="flex items-center">
          <Boxes className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">Variables</span>
          {kernelService && variables.length > 0 && (
            <span className="text-xs text-muted-foreground px-2">
              {variables.length}
            </span>
          )}
        </div>
      </StickyAccordionHeaderWithToolbar>
      <AccordionContent className="pb-0">
        {!kernelService ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No kernel connected
          </div>
        ) : (
          <>
            {connectedNotebookName && (
              <button
                type="button"
                className="corner-squircle group w-full text-left px-3 pt-2 pb-1.5 text-xs truncate rounded-md bg-transparent hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title={`${kernelService.getActivePath() ?? connectedNotebookName} — Open Kernels`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenKernelsTab?.();
                }}
              >
                <span className="text-muted-foreground/80">Kernel: </span>
                <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {connectedNotebookName}
                </span>
              </button>
            )}
            {loading && variables.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
            ) : variables.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No variables</div>
            ) : (
              <ul className="list-none p-0 m-0 py-1 px-2">
                {variables.map((v) => {
                  const hint = shapeHint(v.shape, v.length);
                  const reprBody = v.repr?.trim() || null;
                  return (
                    <li key={v.name}>
                      <HoverCard openDelay={0} closeDelay={0}>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            className="corner-squircle w-full text-left px-3 py-1.5 flex items-baseline justify-between gap-2 hover:bg-accent rounded-md text-xs"
                            onClick={() => handleVariableClick(v.name)}
                          >
                            <span className="font-mono text-[11px] truncate shrink-0 max-w-[75%]">
                              {v.name}
                            </span>
                            <span className="flex items-baseline gap-1.5 min-w-0 justify-end">
                              {hint && (
                                <span className="text-xs text-muted-foreground/70 font-mono shrink-0">
                                  {hint}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground truncate">
                                {shortType(v.type)}
                              </span>
                            </span>
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          sideOffset={8}
                          className={cn(
                            "corner-squircle w-52 max-h-[min(40vh,20rem)] overflow-y-auto overscroll-contain",
                            "border-border/50 px-2.5 py-2 shadow-sm text-inherit"
                          )}
                        >
                          {/* Slash-command-style title + detail (chat-textbox popover helper) */}
                          {reprBody ? (
                            <p className="font-mono text-xs text-foreground leading-snug whitespace-pre-wrap break-all">
                              {reprBody}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground leading-snug">
                              {hint
                                ? `${shortType(v.type)} ${hint}`
                                : shortType(v.type)}
                            </p>
                          )}
                        </HoverCardContent>
                      </HoverCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <VariableDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          summary={selectedSummary}
          loading={inspecting}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
