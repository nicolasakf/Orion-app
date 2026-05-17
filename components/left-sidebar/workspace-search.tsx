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
import { useAssistantChatOptional } from "@/lib/agent/assistant-provider";
import { glob } from "@/lib/shell/system-commands/glob";
import { grep } from "@/lib/shell/system-commands/grep";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { TerminalPool } from "@/lib/shell/terminal-pool";
import type { GlobResult, GrepResult } from "@/lib/shell/types";
import { cn } from "@/lib/utils";

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

/**
 * Strip the leading "./" that shell commands add when cwd is set and the path
 * is relative to that cwd. Also strips a leading workspaceDirectory prefix if
 * the tool returns absolute-style paths.
 */
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
 * It searches both file names and file contents in parallel using the existing
 * glob() and grep() shell commands.
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
  const assistantCtx = useAssistantChatOptional();
  const assistantTerminalPool = assistantCtx?.terminalPool ?? null;
  /**
   * LeftSidebar is rendered outside AssistantProvider, so search needs
   * a local pool fallback for system commands (glob/grep).
   */
  const localTerminalPool = React.useMemo(() => {
    if (!kernelService || assistantTerminalPool) return null;
    return new TerminalPool(kernelService);
  }, [assistantTerminalPool, kernelService]);
  const terminalPool = assistantTerminalPool ?? localTerminalPool;

  useEffect(() => {
    return () => {
      localTerminalPool?.dispose();
    };
  }, [localTerminalPool]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [fileMatches, setFileMatches] = useState<GlobResult | null>(null);
  const [contentMatches, setContentMatches] = useState<GrepResult | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [isFilesSectionOpen, setIsFilesSectionOpen] = useState(true);
  const [isContentSectionOpen, setIsContentSectionOpen] = useState(true);

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

  // ── Execute search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setFileMatches(null);
      setContentMatches(null);
      setSearchError(false);
      return;
    }

    if (workspaceDirectory === null || !terminalPool || !kernelService) {
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(false);

    const cwd = workspaceDirectory === "" ? undefined : workspaceDirectory;
    const escapedPattern = escapeRegex(debouncedQuery);

    Promise.all([
      glob(terminalPool, kernelService, {
        pattern: `*${debouncedQuery}*`,
        cwd,
        caseSensitive,
        maxResults: 50,
      }),
      grep(terminalPool, kernelService, {
        pattern: escapedPattern,
        cwd,
        caseSensitive,
        maxResults: 50,
        maxLineLength: 150,
      }),
    ])
      .then(([globResult, grepResult]) => {
        if (cancelled) return;
        setFileMatches(globResult);
        setContentMatches(grepResult);
        if (!globResult.success && !grepResult.success) {
          setSearchError(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSearchError(true);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, workspaceDirectory, terminalPool, kernelService, caseSensitive]);

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
  const noServer = !kernelService || !terminalPool;
  const hasQuery = query.length > 0;
  const queryTooShort = hasQuery && query.length < 2;
  const hasResults =
    (fileMatches?.files.length ?? 0) > 0 ||
    (contentMatches?.matches.size ?? 0) > 0;

  const fileCount = fileMatches?.files.length ?? 0;
  const contentCount = contentMatches?.total ?? 0;

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
        {!isSearching && fileCount > 0 && (
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
                {fileMatches!.files.map((rawPath) => {
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
                {fileMatches!.truncated && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    Results truncated ({fileMatches!.total}+ matches)
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Content matches ────────────────────────────────────────── */}
        {!isSearching && contentCount > 0 && (
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
                {Array.from(contentMatches!.matches.entries()).map(
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
                {contentMatches!.truncated && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    Results truncated ({contentMatches!.total}+ matches)
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
