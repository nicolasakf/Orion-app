"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Orbit,
  Pin,
  RefreshCw,
  Server,
} from "lucide-react";

import { useOrionSettings } from "@/hooks/use-orion-settings";
import { MAX_PINNED_WORKSPACE_DIRECTORY_PATHS } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";
import type { ContentsManager } from "@jupyterlab/services";
import type { FileTreeItem } from "./file-tree";

interface WorkspacePickerProps {
  /** ContentsManager used to fetch folder listings. */
  contentsManager: ContentsManager;
  /** Called with the Jupyter-relative path when the user selects a workspace folder. */
  onSelectWorkspace: (path: string) => void;
  /**
   * Cached fetch function from the parent sidebar.
   * Returns only the immediate children of a given path.
   */
  onFetchChildren: (path: string) => Promise<FileTreeItem[]>;
}

/** Human-readable label for a Jupyter workspace path (tooltip shows full path). */
function workspacePathLabel(path: string): string {
  if (path === "") return "Server root";
  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : path;
}

/** Pin / unpin control; stops propagation so row expand does not run. */
function PinDirectoryButton({
  path,
  isPinned,
  atPinLimit,
  onTogglePin,
}: {
  path: string;
  isPinned: boolean;
  atPinLimit: boolean;
  onTogglePin: (path: string) => void;
}) {
  const disablePin = !isPinned && atPinLimit;

  return (
    <button
      type="button"
      className={cn(
        "corner-squircle shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
        "opacity-0 group-hover:opacity-100",
        "hover:bg-primary/10 hover:text-primary",
        isPinned && "opacity-100 text-primary"
      )}
      disabled={disablePin}
      aria-label={isPinned ? "Unpin folder" : "Pin folder"}
      aria-pressed={isPinned}
      title={
        disablePin
          ? "Pin limit reached (50). Unpin a folder first."
          : isPinned
            ? "Unpin from shortcuts"
            : "Pin to shortcuts"
      }
      onClick={(e) => {
        e.stopPropagation();
        if (!disablePin) onTogglePin(path);
      }}
    >
      <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} strokeWidth={isPinned ? 2.5 : 2} />
    </button>
  );
}

/** A single expandable folder row in the workspace picker. */
function PickerNode({
  item,
  depth,
  onSelectWorkspace,
  onFetchChildren,
  pinnedPathSet,
  atPinLimit,
  onTogglePin,
}: {
  item: FileTreeItem;
  depth: number;
  onSelectWorkspace: (path: string) => void;
  onFetchChildren: (path: string) => Promise<FileTreeItem[]>;
  pinnedPathSet: ReadonlySet<string>;
  atPinLimit: boolean;
  onTogglePin: (path: string) => void;
}) {
  const isPinned = pinnedPathSet.has(item.path);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [subFolders, setSubFolders] = React.useState<FileTreeItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const toggleExpand = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    if (!loaded) {
      setIsLoading(true);
      try {
        const children = await onFetchChildren(item.path);
        setSubFolders(children.filter((c) => c.type === "folder"));
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load sub-folders:", err);
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(true);
  };

  /** Stops bubbling so nested picker rows / parents do not receive the activation. */
  const activateExpand = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    void toggleExpand();
  };

  return (
    <li>
      <div
        className={cn(
          "corner-squircle group flex items-center gap-1.5 rounded-md py-1 pr-2 text-inherit",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
        )}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        onClick={activateExpand}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={activateExpand}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isLoading ? (
            <Orbit className="h-3 w-3 animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-black/60 fill-[#ff4800]" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-black/60 fill-[#ff4800]" />
        )}

        <span className="flex-1 truncate" title={item.path}>
          {item.name}
        </span>

        <PinDirectoryButton
          path={item.path}
          isPinned={isPinned}
          atPinLimit={atPinLimit}
          onTogglePin={onTogglePin}
        />

        {/* "Open as workspace" button — visible on hover */}
        <button
          type="button"
          className="corner-squircle shrink-0 rounded-md px-1.5 py-0.5 text-inherit font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-opacity"
          onClick={(e) => { e.stopPropagation(); onSelectWorkspace(item.path); }}
          title={`Open "${item.name}" as workspace`}
        >
          Open
        </button>
      </div>

      {isExpanded && loaded && (
        <ul>
          {subFolders.length === 0 ? (
            <li className="py-1 text-inherit text-muted-foreground italic" style={{ paddingLeft: `${1.5 + depth * 1}rem` }}>
              No sub-folders
            </li>
          ) : (
            subFolders.map((sub) => (
              <PickerNode
                key={sub.path}
                item={sub}
                depth={depth + 1}
                onSelectWorkspace={onSelectWorkspace}
                onFetchChildren={onFetchChildren}
                pinnedPathSet={pinnedPathSet}
                atPinLimit={atPinLimit}
                onTogglePin={onTogglePin}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/** Max number of fetch attempts before surfacing an error to the user. */
const MAX_LOAD_ATTEMPTS = 3;
/** Base delay between retries in ms — doubles each attempt (1 s, 2 s). */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * A lazy-loading folder browser shown in the sidebar when no workspace is selected.
 * Users can browse the Jupyter server's folder tree and open any folder as their workspace.
 */

export function WorkspacePicker({
  onSelectWorkspace,
  onFetchChildren,
}: WorkspacePickerProps) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const fileTreeFontSize = effectiveSettings.fileTree.fontSize;
  const [rootFolders, setRootFolders] = React.useState<FileTreeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  /** Pinned paths shown in UI (server root `""` is never pinned). */
  const pinnedPaths = React.useMemo(
    () => effectiveSettings.workspace.pinnedDirectoryPaths.filter((p) => p !== ""),
    [effectiveSettings.workspace.pinnedDirectoryPaths]
  );
  const pinnedPathSet = React.useMemo(() => new Set(pinnedPaths), [pinnedPaths]);
  const atPinLimit = pinnedPaths.length >= MAX_PINNED_WORKSPACE_DIRECTORY_PATHS;

  const togglePinPath = React.useCallback(
    async (path: string) => {
      if (path === "") return;

      await setUserSettings((current) => {
        const list = [...current.workspace.pinnedDirectoryPaths];
        const idx = list.indexOf(path);
        if (idx >= 0) {
          list.splice(idx, 1);
        } else if (list.length < MAX_PINNED_WORKSPACE_DIRECTORY_PATHS && !list.includes(path)) {
          list.push(path);
        }
        return {
          ...current,
          workspace: {
            ...current.workspace,
            pinnedDirectoryPaths: list,
          },
        };
      });
    },
    [setUserSettings]
  );

  React.useEffect(() => {
    let cancelled = false;

    const loadWithRetry = async () => {
      setLoading(true);
      setError(null);

      let lastErr: unknown = null;

      for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
        if (cancelled) return;

        try {
          const children = await onFetchChildren("");
          if (!cancelled) {
            setRootFolders(children.filter((c) => c.type === "folder"));
            setLoading(false);
          }
          return;
        } catch (err) {
          lastErr = err;
          if (cancelled) return;

          if (attempt < MAX_LOAD_ATTEMPTS - 1) {
            // Exponential backoff: 1 s, 2 s, …
            await new Promise<void>((resolve) =>
              setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1))
            );
          }
        }
      }

      if (!cancelled) {
        setError("Failed to load server root.");
        setLoading(false);
        console.error("WorkspacePicker: all fetch attempts failed:", lastErr);
      }
    };

    void loadWithRetry();
    return () => { cancelled = true; };
  }, [onFetchChildren, retryKey]);

  return (
    <div
      className="select-none px-2 pt-2 pb-4"
      style={{ fontSize: fileTreeFontSize }}
    >
      <p className="mb-3 px-1 text-inherit text-muted-foreground">
        Select a workspace folder
      </p>

      {pinnedPaths.length > 0 && (
        <div className="mb-3 mt-2">
          <p className="mb-1.5 px-1 text-inherit font-medium tracking-wide text-muted-foreground">
            Pinned
          </p>
          <ul className="space-y-0.5">
            {pinnedPaths.map((path) => (
              <li key={path}>
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "corner-squircle group flex items-center gap-1.5 rounded-md py-1 pr-2 pl-2 text-inherit",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                  onClick={() => onSelectWorkspace(path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectWorkspace(path);
                    }
                  }}
                  aria-label={`Open ${workspacePathLabel(path)} as workspace`}
                >
                  <Folder className="h-4 w-4 shrink-0 text-black/60 fill-[#ff4800]" />
                  <span className="flex-1 truncate text-foreground" title={path}>
                    {workspacePathLabel(path)}
                  </span>
                  <PinDirectoryButton
                    path={path}
                    isPinned
                    atPinLimit={false}
                    onTogglePin={togglePinPath}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="my-2 border-t border-border" />

      {/* Use server root option */}
      <div
        className="corner-squircle group flex items-center gap-2 rounded-md px-2 py-1 text-inherit hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-default mb-1"
      >
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-muted-foreground" title="Jupyter server root">
          Server root
        </span>
        <button
          type="button"
          className="corner-squircle shrink-0 rounded-md px-1.5 py-0.5 text-inherit font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-opacity"
          onClick={() => onSelectWorkspace("")}
          title="Use the full Jupyter server root as workspace"
        >
          Open
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Orbit className="h-6 w-6 animate-spin text-muted-foreground" strokeWidth={1.5} />
        </div>
      ) : error ? (
        <div className="flex flex-col gap-2 px-2">
          <p className="text-inherit text-destructive">{error}</p>
          <button
            type="button"
            className="flex items-center gap-1.5 text-inherit text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : rootFolders.length === 0 ? (
        <p className="px-2 text-inherit text-muted-foreground italic">No folders found at server root.</p>
      ) : (
        <ul className="space-y-0.5">
          {rootFolders.map((folder) => (
            <PickerNode
              key={folder.path}
              item={folder}
              depth={0}
              onSelectWorkspace={onSelectWorkspace}
              onFetchChildren={onFetchChildren}
              pinnedPathSet={pinnedPathSet}
              atPinLimit={atPinLimit}
              onTogglePin={togglePinPath}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
