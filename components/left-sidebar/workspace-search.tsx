"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Search, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { basename } from "path";

import { FileIcon } from "@/components/common/file-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { cn } from "@/lib/utils";
import {
  WorkspaceSearchService,
  type WorkspaceSearchResult,
} from "@/lib/workspace/workspace-search-service";
import {
  getWorkspaceFilesChangedDetail,
  WORKSPACE_FILES_CHANGED_EVENT,
} from "@/lib/workspace/workspace-events";

// ============================================================================
// Types
// ============================================================================

interface WorkspaceSearchProps {
  workspaceDirectory: string | null;
  kernelService: KernelService | null;
  caseSensitive?: boolean;
  onFileSelect?: (file: { name: string; path: string }) => void;
  onNavigateToLine?: (
    file: { name: string; path: string },
    line: number
  ) => void;
}

export interface WorkspaceSearchHandle {
  focus: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Escape all regex metacharacters so a user query is treated as a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips a leading relative-path marker before passing a result to the editor. */
function stripLeadingDotSlash(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

/**
 * Build an absolute Jupyter-root-relative path candidate from a workspace-relative path.
 * This ensures sidebar search results open correctly from nested workspaces.
 */
function buildWorkspaceQualifiedPath(
  workspaceDirectory: string | null,
  path: string
): string {
  const normalizedPath = stripLeadingDotSlash(path);
  if (!workspaceDirectory || workspaceDirectory === "") {
    return normalizedPath;
  }
  if (
    normalizedPath === workspaceDirectory ||
    normalizedPath.startsWith(`${workspaceDirectory}/`)
  ) {
    return normalizedPath;
  }
  return `${workspaceDirectory}/${normalizedPath}`;
}

/** Kernel states that can leave a Contents API cache stale after reconnection. */
const CACHE_INVALIDATING_KERNEL_STATUSES = new Set([
  "unknown",
  "starting",
  "dead",
  "restarting",
  "autorestarting",
]);

// ============================================================================
// Sub-components
// ============================================================================

/** Section header label with a count badge. */
function ResultSectionHeader({
  label,
  count,
  collapsible = false,
  isOpen = true,
  onToggle,
}: {
  label: string;
  count: number;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  if (collapsible && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="corner-squircle flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="corner-squircle rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="corner-squircle rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/** Highlight occurrences of `query` inside `text` using a <mark> element. */
function HighlightedText({
  text,
  query,
  caseSensitive = false,
}: {
  text: string;
  query: string;
  caseSensitive?: boolean;
}) {
  if (!query) return <span>{text}</span>;

  const escapedQuery = escapeRegex(query);
  const flags = caseSensitive ? "g" : "gi";
  const parts = text.split(new RegExp(`(${escapedQuery})`, flags));

  return (
    <span>
      {parts.map((part, i) =>
        (caseSensitive ? part === query : part.toLowerCase() === query.toLowerCase()) ? (
          <mark
            key={i}
            className="corner-squircle bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ============================================================================
// Main component
// ============================================================================

/**
 * WorkspaceSearch renders the search panel inside the left sidebar.
 * It searches file names and file contents through Jupyter's Contents API,
 * without creating a hidden shell session.
 *
 * A ref handle is exposed so the parent can programmatically focus the input
 * (e.g. via the Cmd+K shortcut).
 */
export const WorkspaceSearch = forwardRef<
  WorkspaceSearchHandle,
  WorkspaceSearchProps
>(function WorkspaceSearch(
  {
    workspaceDirectory,
    kernelService,
    caseSensitive = false,
    onFileSelect,
    onNavigateToLine,
  },
  ref
) {
  const { effectiveSettings } = useOrionSettings();
  const ignoredDirectoryNames = effectiveSettings.agent.filesystem.ignoreDirs;
  const binaryExtensions = effectiveSettings.agent.filesystem.binaryExtensions;
  const searchService = React.useMemo(() => {
    if (!kernelService || workspaceDirectory === null) return null;
    return new WorkspaceSearchService(kernelService.getContentsManager(), {
      ignoreDirectoryNames: ignoredDirectoryNames,
      binaryExtensions,
    });
  }, [
    binaryExtensions,
    ignoredDirectoryNames,
    kernelService,
    workspaceDirectory,
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<WorkspaceSearchResult | null>(
    null
  );
  const [searchError, setSearchError] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [isFilesSectionOpen, setIsFilesSectionOpen] = useState(true);
  const [isContentSectionOpen, setIsContentSectionOpen] = useState(true);
  const searchGenerationRef = useRef(0);

  /** Expose a focus() method to the parent via forwardRef. */
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  // ── Debounce query ──────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Re-open sections on each new debounced query for discoverability.
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      setIsFilesSectionOpen(true);
      setIsContentSectionOpen(true);
    }
  }, [debouncedQuery]);

  // Keep cached Contents results aligned with file mutations made elsewhere.
  useEffect(() => {
    if (!searchService) return;

    const handleWorkspaceFilesChanged = (event: Event) => {
      const detail = getWorkspaceFilesChangedDetail(event);
      if (!detail) return;
      searchService.clearPath(detail.folderPath);
      setSearchRevision((current) => current + 1);
    };

    window.addEventListener(
      WORKSPACE_FILES_CHANGED_EVENT,
      handleWorkspaceFilesChanged
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_FILES_CHANGED_EVENT,
        handleWorkspaceFilesChanged
      );
    };
  }, [searchService]);

  // File mutations, session replacement, and reconnects must not reuse stale Contents data.
  useEffect(() => {
    if (!kernelService || !searchService) return;

    const invalidateSearchCache = () => {
      searchService.clear();
      setSearchRevision((current) => current + 1);
    };
    const contentsManager = kernelService.getContentsManager();
    const unsubscribeSessions = kernelService.onSessionsChanged(
      invalidateSearchCache
    );
    const unsubscribeStatus = kernelService.onStatusChanged((status) => {
      if (CACHE_INVALIDATING_KERNEL_STATUSES.has(status)) {
        invalidateSearchCache();
      }
    });
    contentsManager.fileChanged.connect(invalidateSearchCache);

    return () => {
      unsubscribeSessions();
      unsubscribeStatus();
      contentsManager.fileChanged.disconnect(invalidateSearchCache);
    };
  }, [kernelService, searchService]);

  // ── Execute search ──────────────────────────────────────────────────────
  useEffect(() => {
    const requestGeneration = searchGenerationRef.current + 1;
    searchGenerationRef.current = requestGeneration;

    if (debouncedQuery.length < 2) {
      setSearchResult(null);
      setSearchError(false);
      setIsSearching(false);
      return;
    }

    if (workspaceDirectory === null || !searchService) {
      setSearchResult(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(false);

    void searchService
      .searchWorkspace({
        rootPath: workspaceDirectory,
        query: debouncedQuery,
        caseSensitive,
      })
      .then((result) => {
        if (searchGenerationRef.current !== requestGeneration) return;
        setSearchResult(result);
        const hasResult =
          result.fileMatches.length > 0 || result.contentMatchCount > 0;
        setSearchError(result.errors.length > 0 && !hasResult);
      })
      .catch(() => {
        if (searchGenerationRef.current !== requestGeneration) return;
        setSearchResult(null);
        setSearchError(true);
      })
      .finally(() => {
        if (searchGenerationRef.current === requestGeneration) {
          setIsSearching(false);
        }
      });
  }, [
    caseSensitive,
    debouncedQuery,
    searchRevision,
    searchService,
    workspaceDirectory,
  ]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleFileClick = useCallback(
    (path: string) => {
      const resolvedPath = buildWorkspaceQualifiedPath(
        workspaceDirectory,
        path
      );
      const name = basename(resolvedPath);
      onFileSelect?.({ name, path: resolvedPath });
    },
    [onFileSelect, workspaceDirectory]
  );

  const handleMatchClick = useCallback(
    (path: string, line: number) => {
      const resolvedPath = buildWorkspaceQualifiedPath(
        workspaceDirectory,
        path
      );
      const name = basename(resolvedPath);
      onNavigateToLine?.({ name, path: resolvedPath }, line);
    },
    [onNavigateToLine, workspaceDirectory]
  );

  // ── Derived state ────────────────────────────────────────────────────────

  const noWorkspace = workspaceDirectory === null;
  const noServer = !kernelService || !searchService;
  const hasQuery = query.length > 0;
  const queryTooShort = hasQuery && query.length < 2;
  const hasResults =
    (searchResult?.fileMatches.length ?? 0) > 0 ||
    (searchResult?.contentMatchCount ?? 0) > 0;

  const fileCount = searchResult?.fileMatches.length ?? 0;
  const contentCount = searchResult?.contentMatchCount ?? 0;

  // ── Render ───────────────────────────────────────────────────────────────

  const input = (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files and content"
        disabled={noWorkspace || noServer}
        className={cn(
          "corner-squircle w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2 px-2 pb-2 pt-2">
      {/* Search input — wrapped in tooltip when no workspace */}
      {noWorkspace ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{input}</TooltipTrigger>
            <TooltipContent side="right">
              Select a workspace to search
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        input
      )}

      {/* Status / results area */}
      <div className="flex flex-col">
        {/* No server */}
        {!noWorkspace && noServer && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Connect to a Jupyter server to search
          </p>
        )}

        {/* Loading */}
        {isSearching && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching…
          </div>
        )}

        {/* Idle hints */}
        {!noServer && !noWorkspace && !isSearching && (
          <>
            {queryTooShort && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Type at least 2 characters
              </p>
            )}
          </>
        )}

        {/* Search error */}
        {searchError && !isSearching && (
          <p className="px-2 py-4 text-center text-xs text-destructive">
            Search failed. Try again.
          </p>
        )}

        {/* No results */}
        {!isSearching &&
          !searchError &&
          debouncedQuery.length >= 2 &&
          !hasResults && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

        {/* ── File name matches ──────────────────────────────────────── */}
        {!isSearching && searchResult && fileCount > 0 && (
          <div>
            <ResultSectionHeader
              label="Files"
              count={fileCount}
              collapsible={true}
              isOpen={isFilesSectionOpen}
              onToggle={() => setIsFilesSectionOpen((prev) => !prev)}
            />
            {isFilesSectionOpen && (
              <>
                {searchResult.fileMatches.map((rawPath) => {
                  const path = stripLeadingDotSlash(rawPath);
                  const name = basename(path);
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleFileClick(path)}
                      className="corner-squircle flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    >
                      <FileIcon filename={name} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-foreground">{path}</span>
                    </button>
                  );
                })}
                {searchResult.fileMatchesTruncated && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    Results truncated ({fileCount}+ matches)
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Content matches ────────────────────────────────────────── */}
        {!isSearching && searchResult && contentCount > 0 && (
          <div>
            <ResultSectionHeader
              label="Content"
              count={contentCount}
              collapsible={true}
              isOpen={isContentSectionOpen}
              onToggle={() => setIsContentSectionOpen((prev) => !prev)}
            />
            {isContentSectionOpen && (
              <>
                {Array.from(searchResult.contentMatches.entries()).map(
                  ([rawFilePath, lineMatches]) => {
                    const filePath = stripLeadingDotSlash(rawFilePath);
                    const name = basename(filePath);
                    return (
                      <div key={filePath}>
                        {/* File header row */}
                        <button
                          type="button"
                          onClick={() => handleFileClick(filePath)}
                          className="corner-squircle flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          <FileIcon
                            filename={name}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate font-medium text-foreground">
                            {filePath}
                          </span>
                        </button>

                        {/* Match rows */}
                        {lineMatches.map((match) => (
                          <button
                            key={`${filePath}:${match.line}`}
                            type="button"
                            onClick={() => handleMatchClick(filePath, match.line)}
                            className="corner-squircle flex w-full items-start gap-2 rounded-md px-2 py-0.5 pl-6 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                          >
                            <span className="corner-squircle shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {match.line}
                            </span>
                            <span className="truncate text-muted-foreground">
                              <HighlightedText
                                text={match.content.trim()}
                                query={debouncedQuery}
                                caseSensitive={caseSensitive}
                              />
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  }
                )}
                {searchResult.contentMatchesTruncated && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    Results truncated ({contentCount}+ matches)
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
