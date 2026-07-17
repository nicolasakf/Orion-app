"use client";

import * as React from "react";

import { ToolbarButton } from "@/components/common/toolbar-button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  WorkspaceSearch,
  type WorkspaceSearchHandle,
} from "@/components/left-sidebar/workspace-search";
import type { KernelService } from "@/lib/kernel/kernel-service";

interface SearchableBusinessFile {
  name: string;
  path: string;
}

interface BusinessWorkspaceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceDirectory: string | null;
  kernelService: KernelService | null;
  onFileSelect: (file: SearchableBusinessFile) => void;
  onNavigateToLine: (file: SearchableBusinessFile, line: number) => void;
}

/** Returns true for Orion's unmodified primary-modifier workspace search shortcut. */
export function isWorkspaceSearchShortcut(event: {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    !event.isComposing &&
    event.metaKey !== event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

/** Centered Business View search surface backed by Orion's shared workspace search. */
export function BusinessWorkspaceSearchDialog({
  open,
  onOpenChange,
  workspaceDirectory,
  kernelService,
  onFileSelect,
  onNavigateToLine,
}: BusinessWorkspaceSearchDialogProps) {
  const searchRef = React.useRef<WorkspaceSearchHandle>(null);
  const [caseSensitive, setCaseSensitive] = React.useState(false);

  /** Closes search before handing a file selection back to the editor shell. */
  const handleFileSelect = React.useCallback(
    (file: SearchableBusinessFile) => {
      onOpenChange(false);
      onFileSelect(file);
    },
    [onFileSelect, onOpenChange],
  );

  /** Closes search before opening and navigating a matching content line. */
  const handleNavigateToLine = React.useCallback(
    (file: SearchableBusinessFile, line: number) => {
      onOpenChange(false);
      onNavigateToLine(file, line);
    },
    [onNavigateToLine, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(70vh,560px)] w-[min(92vw,720px)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        hideCloseButton
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Search workspace</DialogTitle>

        <WorkspaceSearch
          ref={searchRef}
          workspaceDirectory={workspaceDirectory}
          kernelService={kernelService}
          caseSensitive={caseSensitive}
          keyboardNavigation
          onFileSelect={handleFileSelect}
          onNavigateToLine={handleNavigateToLine}
          className="min-h-0 flex-1 px-3 pb-3 pt-3"
          inputClassName="h-11 pl-9 pr-3 text-base"
          inputTrailingAction={
            <ToolbarButton
              type="button"
              toolTipLabel={
                caseSensitive
                  ? "Turn off case-sensitive search"
                  : "Turn on case-sensitive search"
              }
              aria-label="Toggle case-sensitive search"
              aria-pressed={caseSensitive}
              className={
                caseSensitive
                  ? "h-11 w-11 bg-accent text-foreground"
                  : "h-11 w-11"
              }
              onClick={() => setCaseSensitive((current) => !current)}
            >
              <span className="text-[9px] font-semibold tracking-wide">Aa</span>
            </ToolbarButton>
          }
          resultsClassName="min-h-0 flex-1 overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
}
