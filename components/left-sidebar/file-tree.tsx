"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  FilePlusCorner,
  Trash2,
  Pencil,
  FolderSearch,
  FileText,
  SquareArrowOutUpRight,
  AtSign,
  Pin,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useIsDesktopApp } from "@/hooks/use-platform";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { togglePinnedFilePath } from "@/lib/settings/pinned-files";
import { MAX_PINNED_FILE_PATHS } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";
import { CustomIcon } from "@/components/common/custom-icon";
import { FileIcon } from "@/components/common/file-icon";
import { OrionLoader } from "@/components/common/orion-loader";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ContentsManager } from "@jupyterlab/services";

export type FileTreeItem = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeItem[];
  /** true = children have been fetched from server; false/undefined = not yet fetched */
  childrenLoaded?: boolean;
};

export type FileTreeSelection = {
  name: string;
  path: string;
  /** Opens a specialized file type with the generic text editor. */
  openAsText?: boolean;
};

type FileTreeProps = {
  items: FileTreeItem[];
  className?: string;
  defaultCollapsed?: boolean;
  /** Folder paths that should render expanded when their nodes mount. */
  expandedFolderPaths?: readonly string[];
  /** Reports a folder's expanded state after the user toggles it. */
  onFolderExpandedChange?: (path: string, isExpanded: boolean) => void;
  loading?: boolean;
  /** When false, hide entries whose name starts with ".". */
  showHiddenFiles?: boolean;
  /** ContentsManager from the active KernelService — required for file CRUD operations. */
  contentsManager?: ContentsManager | null;
  onFileSelect?: (file: FileTreeSelection) => void;
  /**
   * Called after a successful CRUD operation so the parent can re-scan the affected folder.
   * Receives the path of the folder whose contents changed.
   */
  onTreeChange?: (parentPath: string) => void;
  /**
   * Fetches the immediate children of the given path from the server.
   * Used for lazy-loading folder contents on expand.
   */
  onFetchChildren?: (path: string) => Promise<FileTreeItem[]>;
  /**
   * Called when the user requests "reveal in finder / file explorer".
   * Receives the path of the item to reveal.
   */
  onRevealInFinder?: (path: string) => void;
  /** Called when the user requests a Jupyter-relative path be copied. */
  onCopyPath?: (path: string) => void;
  /** Disabled reveal menu text when the connected workspace is not locally revealable. */
  revealUnavailableLabel?: string;
  /**
   * Called after a successful rename so the app can update the open file and recent list.
   */
  onPathRenamed?: (payload: {
    oldPath: string;
    newPath: string;
    newName: string;
    itemType: "file" | "folder";
  }) => void;
  /**
   * Called after a successful delete so the app can close the editor if needed.
   */
  onPathDeleted?: (payload: {
    path: string;
    itemType: "file" | "folder";
  }) => void;
  /**
   * OS-specific label for the reveal action (e.g. "Reveal in Finder" on macOS,
   * "Reveal in Explorer" on Windows). Defaults to "Reveal in Finder".
   */
  revealLabel?: string;
  /** The active workspace directory (Jupyter-relative). Used to build deep-link URLs. */
  workspaceDirectory?: string | null;
  /** Font size in pixels (defaults to user settings). */
  fontSize?: number;
};

export function FileTree({
  items,
  className,
  defaultCollapsed = false,
  expandedFolderPaths,
  onFolderExpandedChange,
  loading = false,
  showHiddenFiles = true,
  contentsManager,
  onFileSelect,
  onTreeChange,
  onFetchChildren,
  onRevealInFinder,
  onCopyPath,
  revealUnavailableLabel,
  onPathRenamed,
  onPathDeleted,
  revealLabel = "Reveal in Finder",
  workspaceDirectory,
  fontSize = DEFAULT_SETTINGS.fileTree.fontSize,
}: FileTreeProps) {
  return (
    <div
      className={cn("select-none", className)}
      style={{ fontSize }}
    >
      {loading ? (
        <div className="flex h-[80vh] items-center justify-center">
          <OrionLoader className="h-16 w-16" aria-hidden />
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <FileTreeNode
              key={item.path}
              item={item}
              defaultCollapsed={defaultCollapsed}
              expandedFolderPaths={expandedFolderPaths}
              onFolderExpandedChange={onFolderExpandedChange}
              showHiddenFiles={showHiddenFiles}
              contentsManager={contentsManager}
              onFileSelect={onFileSelect}
              onTreeChange={onTreeChange}
              onFetchChildren={onFetchChildren}
              onRevealInFinder={onRevealInFinder}
              onCopyPath={onCopyPath}
              revealUnavailableLabel={revealUnavailableLabel}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
              revealLabel={revealLabel}
              workspaceDirectory={workspaceDirectory}
              isTopLevel={true}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileTreeNode({
  item,
  defaultCollapsed,
  expandedFolderPaths,
  onFolderExpandedChange,
  showHiddenFiles,
  contentsManager,
  onFileSelect,
  onTreeChange,
  onFetchChildren,
  onRevealInFinder,
  onCopyPath,
  revealUnavailableLabel,
  onPathRenamed,
  onPathDeleted,
  revealLabel = "Reveal in Finder",
  workspaceDirectory,
  isTopLevel = false,
}: {
  item: FileTreeItem;
  defaultCollapsed?: boolean;
  expandedFolderPaths?: readonly string[];
  onFolderExpandedChange?: FileTreeProps["onFolderExpandedChange"];
  showHiddenFiles?: boolean;
  contentsManager?: ContentsManager | null;
  onFileSelect?: (file: FileTreeSelection) => void;
  onTreeChange?: (parentPath: string) => void;
  onFetchChildren?: (path: string) => Promise<FileTreeItem[]>;
  onRevealInFinder?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  revealUnavailableLabel?: string;
  onPathRenamed?: FileTreeProps["onPathRenamed"];
  onPathDeleted?: FileTreeProps["onPathDeleted"];
  revealLabel?: string;
  workspaceDirectory?: string | null;
  isTopLevel?: boolean;
}) {
  // Top-level folders always start expanded; nested nodes restore any saved state.
  const initialExpanded = isTopLevel
    ? true
    : expandedFolderPaths?.includes(item.path) ?? !defaultCollapsed;

  const [isExpanded, setIsExpanded] = React.useState(initialExpanded);
  const [children, setChildren] = React.useState<FileTreeItem[]>(item.children ?? []);
  const [localChildrenLoaded, setLocalChildrenLoaded] = React.useState(
    item.childrenLoaded ?? false
  );
  const [isLoadingChildren, setIsLoadingChildren] = React.useState(false);
  const isLoadingChildrenRef = React.useRef(false);
  const shouldShowDotfiles = showHiddenFiles ?? true;

  // Sync local children state when the parent provides updated items (e.g. after a tree refresh)
  React.useEffect(() => {
    setChildren(item.children ?? []);
    setLocalChildrenLoaded(item.childrenLoaded ?? false);
  }, [item.children, item.childrenLoaded]);

  const [showFileDialog, setShowFileDialog] = React.useState(false);
  const [showFolderDialog, setShowFolderDialog] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [newItemName, setNewItemName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);
  /** Prevents double-commit when Enter fires before blur. */
  const renameCommittedRef = React.useRef(false);
  /** Absorbs the first blur caused by the context menu restoring focus to its trigger. */
  const ignoreNextBlurRef = React.useRef(false);

  const isDesktopApp = useIsDesktopApp();
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const isFolder = item.type === "folder";
  const isNotebookFile =
    item.type === "file" && item.name.toLowerCase().endsWith(".ipynb");
  const isPinnedFile =
    item.type === "file" &&
    effectiveSettings.workspace.pinnedFilePaths.includes(item.path);
  const atPinnedFileLimit =
    effectiveSettings.workspace.pinnedFilePaths.length >= MAX_PINNED_FILE_PATHS;
  // CRUD operations require a ContentsManager
  const canCreateFile = isFolder && !!contentsManager;

  const handleTogglePinFile = React.useCallback(async () => {
    if (item.type !== "file") return;
    await setUserSettings((current) => ({
      ...current,
      workspace: {
        ...current.workspace,
        pinnedFilePaths: togglePinnedFilePath(
          current.workspace.pinnedFilePaths,
          item.path,
        ),
      },
    }));
  }, [item.path, item.type, setUserSettings]);

  // Focus input when create dialogs open
  React.useEffect(() => {
    if ((showFileDialog || showFolderDialog) && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [showFileDialog, showFolderDialog]);

  // Focus inline rename input and select only the filename stem (not extension).
  React.useEffect(() => {
    if (!isRenaming) return;
    const timer = setTimeout(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      const dotIndex = item.name.lastIndexOf(".");
      const selEnd = dotIndex > 0 ? dotIndex : item.name.length;
      input.setSelectionRange(0, selEnd);
    }, 150);
    return () => clearTimeout(timer);
  }, [isRenaming, item.name]);

  /** Fetches children when an expanded folder has not yet been loaded. */
  const loadChildren = React.useCallback(async () => {
    if (localChildrenLoaded || !onFetchChildren || isLoadingChildrenRef.current) return;

    isLoadingChildrenRef.current = true;
    setIsLoadingChildren(true);
    try {
      const fetched = await onFetchChildren(item.path);
      setChildren(fetched);
      setLocalChildrenLoaded(true);
    } catch (error) {
      console.error("Error fetching folder contents:", error);
    } finally {
      isLoadingChildrenRef.current = false;
      setIsLoadingChildren(false);
    }
  }, [item.path, localChildrenLoaded, onFetchChildren]);

  // Re-fetch nested folders when their persisted expanded state restores on mount.
  React.useEffect(() => {
    if (isFolder && isExpanded && !localChildrenLoaded) {
      void loadChildren();
    }
  }, [isExpanded, isFolder, loadChildren, localChildrenLoaded]);

  /** Handles a node click and records folder expansion for state restoration. */
  const handleClick = React.useCallback(() => {
    if (isFolder) {
      const nextExpanded = !isExpanded;
      setIsExpanded(nextExpanded);
      onFolderExpandedChange?.(item.path, nextExpanded);
      return;
    }

    onFileSelect?.({ name: item.name, path: item.path });
  }, [isExpanded, isFolder, item.name, item.path, onFileSelect, onFolderExpandedChange]);

  const handleCreateFile = async () => {
    const name = newItemName.trim();
    if (!name || !contentsManager) return;
    if (item.type !== "folder") return;
    if (name.includes("/")) {
      alert("File name cannot contain '/'. Please choose a different name.");
      return;
    }

    try {
      const newPath = item.path ? `${item.path}/${name}` : name;
      const isNotebook = name.toLowerCase().endsWith(".ipynb");
      if (isNotebook) {
        const created = await contentsManager.newUntitled({
          path: item.path,
          type: "notebook",
        });
        if (created.path !== newPath) {
          await contentsManager.rename(created.path, newPath);
        }
      } else {
        await contentsManager.save(newPath, {
          type: "file",
          format: "text",
          content: "",
        });
      }

      const newFileItem: FileTreeItem = { name, path: newPath, type: "file" };
      setChildren((prev) => {
        const existingIndex = prev.findIndex((c) => c.type === "file" && c.name === name);
        const updated = existingIndex >= 0
          ? prev.map((c, i) => (i === existingIndex ? newFileItem : c))
          : [...prev, newFileItem];
        return updated.sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      });

      if (onFileSelect) onFileSelect({ name, path: newPath });
      if (!isExpanded) {
        setIsExpanded(true);
        onFolderExpandedChange?.(item.path, true);
      }

      setShowFileDialog(false);
      setNewItemName("");
      onTreeChange?.(item.path);
    } catch (error) {
      console.error("Error creating file:", error);
      alert("Failed to create file. See console for details.");
    }
  };

  const handleCreateFolder = async () => {
    const name = newItemName.trim();
    if (!name || !contentsManager) return;
    if (item.type !== "folder") return;
    if (name.includes("/")) {
      alert("Folder name cannot contain '/'. Please choose a different name.");
      return;
    }

    try {
      const newPath = item.path ? `${item.path}/${name}` : name;
      await contentsManager.save(newPath, { type: "directory", format: "json", content: [] });

      const newFolderItem: FileTreeItem = {
        name,
        path: newPath,
        type: "folder",
        children: [],
        childrenLoaded: true,
      };
      setChildren((prev) => {
        const existingIndex = prev.findIndex((c) => c.type === "folder" && c.name === name);
        const updated = existingIndex >= 0
          ? prev.map((c, i) =>
            i === existingIndex ? { ...newFolderItem, children: c.children ?? [] } : c
          )
          : [...prev, newFolderItem];
        return updated.sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      });

      if (!isExpanded) {
        setIsExpanded(true);
        onFolderExpandedChange?.(item.path, true);
      }
      setShowFolderDialog(false);
      setNewItemName("");
      onTreeChange?.(item.path);
    } catch (error) {
      console.error("Error creating folder:", error);
      alert("Failed to create folder. See console for details.");
    }
  };

  const handleRename = async () => {
    if (renameCommittedRef.current) return;
    renameCommittedRef.current = true;

    const newName = newItemName.trim();
    if (!newName || newName === item.name) {
      setIsRenaming(false);
      setNewItemName("");
      renameCommittedRef.current = false;
      return;
    }
    if (newName.includes("/")) {
      alert("Name cannot contain '/'. Please choose a different name.");
      renameCommittedRef.current = false;
      return;
    }
    if (!contentsManager) {
      alert("Cannot rename: no server connection.");
      setIsRenaming(false);
      setNewItemName("");
      return;
    }

    try {
      const parentPath = item.path.includes("/")
        ? item.path.substring(0, item.path.lastIndexOf("/"))
        : "";
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      await contentsManager.rename(item.path, newPath);
      setIsRenaming(false);
      setNewItemName("");
      onPathRenamed?.({
        oldPath: item.path,
        newPath,
        newName,
        itemType: item.type,
      });
      onTreeChange?.(parentPath);
      renameCommittedRef.current = false;
    } catch (error) {
      console.error("Error renaming item:", error);
      alert("Failed to rename. See console for details.");
      setIsRenaming(false);
      setNewItemName("");
      renameCommittedRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!contentsManager) {
      toast.error("Cannot delete: no server connection.");
      return;
    }

    const parentPath = item.path.includes("/")
      ? item.path.substring(0, item.path.lastIndexOf("/"))
      : "";

    try {
      let savedModel: any = null;
      if (item.type === "file") {
        try {
          savedModel = await contentsManager.get(item.path, { content: true });
        } catch {
          // proceed without undo capability
        }
      }

      await contentsManager.delete(item.path);
      onPathDeleted?.({ path: item.path, itemType: item.type });
      onTreeChange?.(parentPath);

      const label = item.type === "folder" ? "Folder" : "File";
      if (item.type === "file" && savedModel !== null) {
        const capturedModel = savedModel;
        toast(`${label} "${item.name}" deleted`, {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await contentsManager.save(item.path, {
                  type: capturedModel.type,
                  format: capturedModel.format,
                  content: capturedModel.content,
                });
                onTreeChange?.(parentPath);
                toast.success(`"${item.name}" restored`);
              } catch (err) {
                console.error("Error undoing delete:", err);
                toast.error("Could not restore the file.");
              }
            },
          },
        });
      } else {
        toast(`${label} "${item.name}" deleted`);
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete. See console for details.");
    }
  };

  const handleOpenInNewTab = React.useCallback(() => {
    const params = new URLSearchParams();
    params.set("file", item.path);
    if (workspaceDirectory !== null && workspaceDirectory !== undefined) {
      params.set("workspace", workspaceDirectory);
    }
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [item.path, workspaceDirectory]);

  /** Opens notebook JSON through the generic Monaco file editor. */
  const handleOpenNotebookAsText = React.useCallback(() => {
    onFileSelect?.({ name: item.name, path: item.path, openAsText: true });
  }, [item.name, item.path, onFileSelect]);

  /** Requests that the chat composer attach this file or folder as a mention. */
  const handleMentionInChat = React.useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("orion:mention-workspace-path", {
        detail: {
          path: item.path,
          itemType: item.type,
          name: item.name,
        },
      }),
    );
  }, [item.name, item.path, item.type]);

  const visibleChildren = shouldShowDotfiles
    ? children
    : children.filter((child) => !child.name.startsWith("."));
  const hasLoadedChildren =
    isFolder && localChildrenLoaded && visibleChildren.length > 0;

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "corner-squircle group/tree-node relative flex items-center gap-2 rounded-md py-1 pr-2 pl-6",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "outline-none focus-visible:outline-none focus-visible:ring-0",
              "cursor-pointer"
            )}
            onClick={() => void handleClick()}
            onDoubleClick={(e) => {
              if (isTopLevel) return;
              e.stopPropagation();
              renameCommittedRef.current = false;
              ignoreNextBlurRef.current = false;
              setNewItemName(item.name);
              setIsRenaming(true);
            }}
          >
            {/* Chevron sits left of the icon column so folder icons align with file icons */}
            {isFolder ? (
              <div
                className="absolute left-0 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center"
                aria-hidden
              >
                {isLoadingChildren ? (
                  <OrionLoader className="h-3 w-3" />
                ) : isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            ) : null}

            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-black/60 fill-[#ff4800]" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-black/60 fill-[#ff4800]" />
              )
            ) : (
              <FileIcon filename={item.name} />
            )}

            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="corner-squircle select-text flex-1 min-w-0 bg-background border border-border rounded px-1 text-inherit outline-none focus:ring-1 focus:ring-ring"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleRename(); }
                  if (e.key === "Escape") { setIsRenaming(false); setNewItemName(""); }
                }}
                onBlur={() => {
                  if (ignoreNextBlurRef.current) {
                    ignoreNextBlurRef.current = false;
                    return;
                  }
                  void handleRename();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{item.name}</span>
            )}

            {canCreateFile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="corner-squircle ml-auto inline-flex items-center justify-center rounded px-1 py-0.5 text-xs text-muted-foreground opacity-0 pointer-events-none transition-opacity group-hover/tree-node:opacity-100 group-hover/tree-node:pointer-events-auto group-focus-within/tree-node:opacity-100 group-focus-within/tree-node:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    title="Create new item in this folder"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setNewItemName("untitled.ipynb");
                      setShowFileDialog(true);
                    }}
                  >
                    <FilePlusCorner className="mr-2 h-4 w-4" />
                    New file
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setNewItemName("New Folder");
                      setShowFolderDialog(true);
                    }}
                  >
                    <CustomIcon filename="folder-plus-corner" className="mr-2 h-4 w-4" />
                    New folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0">
          {item.type === "folder" && canCreateFile && (
            <>
              <ContextMenuItem
                className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                onSelect={(event) => {
                  event.preventDefault();
                  setNewItemName("untitled.ipynb");
                  setShowFileDialog(true);
                }}
              >
                <FilePlusCorner className="mr-2 h-4 w-4" />
                New file
              </ContextMenuItem>
              <ContextMenuItem
                className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                onSelect={(event) => {
                  event.preventDefault();
                  setNewItemName("New Folder");
                  setShowFolderDialog(true);
                }}
              >
                <CustomIcon filename="folder-plus-corner" className="mr-2 h-4 w-4" />
                New folder
              </ContextMenuItem>
            </>
          )}

          {onRevealInFinder && (
            <>
              {item.type === "folder" && canCreateFile && <ContextMenuSeparator />}
              <ContextMenuItem
                className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                onSelect={() => onRevealInFinder(item.path)}
              >
                <FolderSearch className="mr-2 h-4 w-4" />
                {revealLabel}
              </ContextMenuItem>
            </>
          )}

          {!onRevealInFinder && revealUnavailableLabel && (
            <>
              {item.type === "folder" && canCreateFile && <ContextMenuSeparator />}
              <ContextMenuItem disabled>
                <FolderSearch className="mr-2 h-4 w-4" />
                {revealUnavailableLabel}
              </ContextMenuItem>
            </>
          )}

          {onCopyPath && (
            <ContextMenuItem
              className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
              onSelect={() => onCopyPath(item.path)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy path
            </ContextMenuItem>
          )}

          {item.type === "file" && (onRevealInFinder || onCopyPath) && (
            <ContextMenuSeparator />
          )}

          {item.type === "file" && (
            <ContextMenuItem
              className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
              onSelect={handleOpenInNewTab}
            >
              <SquareArrowOutUpRight className="mr-2 h-4 w-4" />
              {isDesktopApp ? "Open in new window" : "Open in new tab"}
            </ContextMenuItem>
          )}

          {isNotebookFile && onFileSelect && (
            <ContextMenuItem
              className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
              onSelect={handleOpenNotebookAsText}
            >
              <FileText className="mr-2 h-4 w-4" />
              Open with text editor
            </ContextMenuItem>
          )}

          {item.type === "file" && (
            <ContextMenuItem
              className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
              disabled={!isPinnedFile && atPinnedFileLimit}
              onSelect={() => {
                void handleTogglePinFile();
              }}
            >
              <Pin
                className={cn("mr-2 h-4 w-4", isPinnedFile && "fill-current")}
                strokeWidth={isPinnedFile ? 2.5 : 2}
              />
              {isPinnedFile ? "Unpin file" : "Pin file"}
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />
          <ContextMenuItem
            className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
            onSelect={handleMentionInChat}
          >
            <AtSign className="mr-2 h-4 w-4" />
            Mention in chat
          </ContextMenuItem>

          {!isTopLevel && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                onSelect={() => {
                  renameCommittedRef.current = false;
                  ignoreNextBlurRef.current = true;
                  setNewItemName(item.name);
                  setIsRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                className="outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Children list — shown when expanded */}
      {isFolder && isExpanded && hasLoadedChildren && (
        <ul className="ml-4 mt-1 space-y-1">
          {visibleChildren.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              defaultCollapsed={defaultCollapsed}
              expandedFolderPaths={expandedFolderPaths}
              onFolderExpandedChange={onFolderExpandedChange}
              showHiddenFiles={showHiddenFiles}
              contentsManager={contentsManager}
              onFileSelect={onFileSelect}
              onTreeChange={onTreeChange}
              onFetchChildren={onFetchChildren}
              onRevealInFinder={onRevealInFinder}
              onCopyPath={onCopyPath}
              revealUnavailableLabel={revealUnavailableLabel}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
              revealLabel={revealLabel}
              workspaceDirectory={workspaceDirectory}
              isTopLevel={false}
            />
          ))}
        </ul>
      )}

      {/* Empty folder indicator */}
      {isFolder && isExpanded && localChildrenLoaded && visibleChildren.length === 0 && (
        <div className="ml-6 py-1 text-xs text-muted-foreground italic">
          Empty folder
        </div>
      )}

      {/* New File Dialog */}
      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              Enter a name for the new file in &quot;{item.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="filename">File name</Label>
              <Input
                id="filename"
                ref={inputRef}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleCreateFile(); }
                }}
                placeholder="untitled.ipynb"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFileDialog(false); setNewItemName(""); }}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFile()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder in &quot;{item.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="foldername">Folder name</Label>
              <Input
                id="foldername"
                ref={inputRef}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleCreateFolder(); }
                }}
                placeholder="New Folder"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFolderDialog(false); setNewItemName(""); }}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFolder()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
