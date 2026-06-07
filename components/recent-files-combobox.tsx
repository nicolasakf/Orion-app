"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  History,
  X,
} from "lucide-react";
import { TooltipPortal } from "@radix-ui/react-tooltip";

import { FileIcon } from "@/components/common/file-icon";
import { PinFileButton } from "@/components/common/pin-file-button";
import { AltOrOption, CmdOrCtrl } from "@/components/common/keyboard-icons";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  isTooltipReopenFromOverlaySuppressed,
} from "@/components/ui/tooltip";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import {
  deriveFileNameFromPinnedPath,
  togglePinnedFilePath,
} from "@/lib/settings/pinned-files";
import { MAX_PINNED_FILE_PATHS } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

export type RecentFilesComboboxFile = {
  name: string;
  path: string;
  openAsText?: boolean;
};

type ComboboxTab = "recent" | "pinned";

interface RecentFilesComboboxProps {
  currentFile: RecentFilesComboboxFile;
  recentFiles: RecentFilesComboboxFile[];
  currentFileOutsideWorkspace: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (file: RecentFilesComboboxFile) => void;
  onCloseFile: (event: React.MouseEvent) => void;
  shouldFocusEditorAfterSelect: (file: RecentFilesComboboxFile) => boolean;
  requestEditorFocus: () => void;
}

/**
 * Recent / pinned file picker in the main toolbar with keyboard shortcuts.
 */
export function RecentFilesCombobox({
  currentFile,
  recentFiles,
  currentFileOutsideWorkspace,
  open,
  onOpenChange,
  onFileSelect,
  onCloseFile,
  shouldFocusEditorAfterSelect,
  requestEditorFocus,
}: RecentFilesComboboxProps) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const [activeTab, setActiveTab] = React.useState<ComboboxTab>("recent");
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const [selectionPath, setSelectionPath] = React.useState("");
  const selectionPathRef = React.useRef("");
  const commandInputRef = React.useRef<HTMLInputElement>(null);
  const shortcutActiveRef = React.useRef(false);
  const shortcutPressCountRef = React.useRef(0);
  const [isFileIconHovered, setIsFileIconHovered] = React.useState(false);

  const pinnedPaths = React.useMemo(
    () => effectiveSettings.workspace.pinnedFilePaths,
    [effectiveSettings.workspace.pinnedFilePaths],
  );
  const pinnedPathSet = React.useMemo(
    () => new Set(pinnedPaths),
    [pinnedPaths],
  );
  const atPinLimit = pinnedPaths.length >= MAX_PINNED_FILE_PATHS;

  const pinnedFiles = React.useMemo<RecentFilesComboboxFile[]>(
    () =>
      pinnedPaths.map((path) => ({
        name: deriveFileNameFromPinnedPath(path),
        path,
      })),
    [pinnedPaths],
  );

  const activeFiles = activeTab === "recent" ? recentFiles : pinnedFiles;
  const hasAnyFiles = recentFiles.length > 0 || pinnedFiles.length > 0;

  const updateSelection = React.useCallback((path: string) => {
    selectionPathRef.current = path;
    setSelectionPath(path);
  }, []);

  const selectFileAtIndex = React.useCallback(
    (index: number, files: RecentFilesComboboxFile[]) => {
      updateSelection(files[index]?.path ?? "");
    },
    [updateSelection],
  );

  const togglePinFile = React.useCallback(
    async (path: string) => {
      await setUserSettings((current) => ({
        ...current,
        workspace: {
          ...current.workspace,
          pinnedFilePaths: togglePinnedFilePath(
            current.workspace.pinnedFilePaths,
            path,
          ),
        },
      }));
    },
    [setUserSettings],
  );

  const handleFileChosen = React.useCallback(
    (file: RecentFilesComboboxFile) => {
      shortcutActiveRef.current = false;
      setTooltipOpen(false);
      onFileSelect(file);
      onOpenChange(false);
      if (shouldFocusEditorAfterSelect(file)) {
        requestEditorFocus();
      }
    },
    [
      onFileSelect,
      onOpenChange,
      requestEditorFocus,
      shouldFocusEditorAfterSelect,
    ],
  );

  const commitSelectedFile = React.useCallback(() => {
    const selectedPath = selectionPathRef.current;
    const selectedFile = activeFiles.find((file) => file.path === selectedPath);
    const shortcutPressCount = shortcutPressCountRef.current;

    shortcutActiveRef.current = false;
    shortcutPressCountRef.current = 0;

    if (!selectedFile) {
      setTooltipOpen(false);
      onOpenChange(false);
      return;
    }

    if (shortcutPressCount <= 1) {
      setTooltipOpen(false);
      window.requestAnimationFrame(() => {
        commandInputRef.current?.focus();
      });
      return;
    }

    if (
      selectedFile.path === currentFile.path &&
      (selectedFile.openAsText ?? false) === (currentFile.openAsText ?? false)
    ) {
      setTooltipOpen(false);
      onOpenChange(false);
      requestEditorFocus();
      return;
    }

    handleFileChosen(selectedFile);
  }, [
    activeFiles,
    currentFile.openAsText,
    currentFile.path,
    handleFileChosen,
    onOpenChange,
    requestEditorFocus,
  ]);

  React.useEffect(() => {
    const isShortcut = (event: KeyboardEvent) =>
      ((event.metaKey && !event.ctrlKey) ||
        (!event.metaKey && event.ctrlKey)) &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === "KeyP";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isShortcut(event)) return;

      event.preventDefault();
      event.stopPropagation();

      let cycleTab = activeTab;
      let cycleFiles = cycleTab === "recent" ? recentFiles : pinnedFiles;
      if (cycleFiles.length === 0) {
        cycleTab = cycleTab === "recent" ? "pinned" : "recent";
        cycleFiles = cycleTab === "recent" ? recentFiles : pinnedFiles;
      }
      if (event.repeat || cycleFiles.length === 0) return;
      if (cycleTab !== activeTab) {
        setActiveTab(cycleTab);
      }

      const selectedIndex = cycleFiles.findIndex(
        (file) => file.path === selectionPathRef.current,
      );
      const isCycling =
        shortcutActiveRef.current || selectionPathRef.current !== "";
      const nextIndex = isCycling
        ? (Math.max(selectedIndex, -1) + 1) % cycleFiles.length
        : 0;

      if (shortcutActiveRef.current) {
        shortcutPressCountRef.current += 1;
      } else {
        shortcutPressCountRef.current = 1;
      }
      shortcutActiveRef.current = true;
      onOpenChange(true);
      selectFileAtIndex(nextIndex, cycleFiles);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!shortcutActiveRef.current) return;
      if (event.metaKey || event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();
      commitSelectedFile();
    };

    const handleWindowBlur = () => {
      shortcutActiveRef.current = false;
      shortcutPressCountRef.current = 0;
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    activeTab,
    commitSelectedFile,
    onOpenChange,
    pinnedFiles,
    recentFiles,
    selectFileAtIndex,
  ]);

  const cycleTab = React.useCallback(
    (direction: 1 | -1) => {
      setActiveTab((current) => {
        const next: ComboboxTab =
          direction === 1
            ? current === "recent"
              ? "pinned"
              : "recent"
            : current === "recent"
              ? "pinned"
              : "recent";
        const nextFiles = next === "recent" ? recentFiles : pinnedFiles;
        if (nextFiles.length > 0) {
          const stillValid = nextFiles.some(
            (file) => file.path === selectionPathRef.current,
          );
          if (!stillValid) {
            updateSelection(nextFiles[0].path);
          }
        } else {
          updateSelection("");
        }
        return next;
      });
    },
    [pinnedFiles, recentFiles, updateSelection],
  );

  const handleComboboxKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      cycleTab(event.shiftKey ? -1 : 1);
    },
    [cycleTab],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (nextOpen) {
        setTooltipOpen(false);
        const defaultTab: ComboboxTab =
          recentFiles.length > 0
            ? "recent"
            : pinnedFiles.length > 0
              ? "pinned"
              : "recent";
        setActiveTab(defaultTab);
        const defaultFiles =
          defaultTab === "recent" ? recentFiles : pinnedFiles;
        if (defaultFiles.length > 0 && !selectionPathRef.current) {
          updateSelection(defaultFiles[0].path);
        }
      } else {
        shortcutActiveRef.current = false;
        shortcutPressCountRef.current = 0;
        updateSelection("");
        setIsFileIconHovered(false);
      }
    },
    [onOpenChange, pinnedFiles, recentFiles, updateSelection],
  );

  if (!currentFile.name && !hasAnyFiles) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={300}>
        <Tooltip
          open={tooltipOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen && isTooltipReopenFromOverlaySuppressed()) {
              return;
            }
            setTooltipOpen(nextOpen);
          }}
        >
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                role="combobox"
                aria-expanded={open}
                aria-label={
                  currentFile.name
                    ? `Current file: ${currentFile.name}. Open recent files`
                    : "Open recent files"
                }
                className={cn(
                  "h-8 max-w-[min(100%,15rem)] min-w-0 shrink px-2 justify-between font-normal",
                  currentFileOutsideWorkspace &&
                    "border bg-amber-50 dark:bg-amber-950/35 border-amber-200/90 dark:border-amber-800/80 hover:bg-amber-100/90 dark:hover:bg-amber-900/45",
                )}
                disabled={!currentFile.name && !hasAnyFiles}
                onMouseEnter={() => setIsFileIconHovered(true)}
                onMouseLeave={() => setIsFileIconHovered(false)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {currentFile.name ? (
                    <>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="corner-squircle flex items-center justify-center w-5 h-5 shrink-0 rounded cursor-pointer hover:bg-muted transition-colors text-red-500/50 hover:text-red-500"
                              onClick={onCloseFile}
                              aria-label="Close file"
                            >
                              {open || isFileIconHovered ? (
                                <X className="h-4 w-4" />
                              ) : (
                                <FileIcon filename={currentFile.name || ""} />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Close file</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span
                        className="min-w-0 flex-1 truncate text-left"
                        title={currentFile.name}
                      >
                        {currentFile.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        Recent files
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent className="z-[100]">
              <div className="flex items-center">
                <p>
                  {currentFile.name ? "Open recent files" : "Recent files"}
                </p>
                <kbd className="pointer-events-none ml-2 inline-flex shrink-0 flex-nowrap h-5 min-h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[12px] font-medium text-muted-foreground opacity-100">
                  <CmdOrCtrl className="h-3 w-3" />
                  P
                </kbd>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-80 p-1"
        onKeyDown={handleComboboxKeyDown}
      >
        <Command value={selectionPath} onValueChange={updateSelection}>
          {currentFileOutsideWorkspace && (
            <div
              className="corner-squircle mx-1 mb-1 flex gap-2 rounded-md border border-amber-300/90 bg-amber-100/90 px-2 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-900/45 dark:text-amber-50"
              role="status"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <p className="leading-snug">
                This file is not inside the workspace folder open in the Files
                sidebar.
              </p>
            </div>
          )}
          <div
            className="mx-1 mb-1 flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-0.5"
            role="tablist"
            aria-label="Recent files tabs"
          >
            {(["recent", "pinned"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={cn(
                  "corner-squircle flex-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setActiveTab(tab);
                  const nextFiles = tab === "recent" ? recentFiles : pinnedFiles;
                  if (
                    nextFiles.length > 0 &&
                    !nextFiles.some((file) => file.path === selectionPath)
                  ) {
                    updateSelection(nextFiles[0].path);
                  }
                }}
              >
                {tab === "recent" ? "Recent" : "Pinned"}
              </button>
            ))}
            <span className="sr-only">Press Tab to switch tabs</span>
          </div>
          <CommandInput
            ref={commandInputRef}
            placeholder={
              activeTab === "recent"
                ? "Search recent files..."
                : "Search pinned files..."
            }
          />
          <CommandEmpty>
            {activeTab === "recent"
              ? "No recent files found."
              : "No pinned files."}
          </CommandEmpty>
          <CommandList>
            <CommandGroup
              heading={activeTab === "recent" ? "Recent Files" : "Pinned Files"}
            >
              {activeFiles.map((file, index) => (
                <CommandItem
                  key={`${file.path}-${index}`}
                  value={file.path}
                  onSelect={() => handleFileChosen(file)}
                  className="group flex items-center gap-2"
                >
                  <FileIcon filename={file.name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {file.path}
                    </span>
                  </div>
                  <PinFileButton
                    path={file.path}
                    isPinned={pinnedPathSet.has(file.path)}
                    atPinLimit={atPinLimit}
                    onTogglePin={togglePinFile}
                  />
                  {currentFile.path === file.path && (
                    <Check className="h-4 w-4 shrink-0 text-green-500" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
