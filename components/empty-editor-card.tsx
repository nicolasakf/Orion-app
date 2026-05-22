"use client";

import * as React from "react";
import {
  FilePlusCorner,
  Folder,
  FolderPlus,
  History,
  Pin,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { ContentsManager } from "@jupyterlab/services";

import { FileIcon } from "@/components/common/file-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { cn } from "@/lib/utils";
import { dispatchWorkspaceFilesChanged } from "@/lib/workspace/workspace-events";

interface EmptyEditorFile {
  name: string;
  path: string;
  openAsText?: boolean;
}

interface EmptyEditorCardProps {
  kernelService?: KernelService | null;
  recentFiles?: EmptyEditorFile[];
  workspaceDirectory?: string | null;
  onOpenFile?: (file: EmptyEditorFile) => void;
  onWorkspaceChange?: (path: string) => void;
}

type CreateItemKind = "file" | "folder";

const RECENT_FILE_LIMIT = 5;
const PINNED_WORKSPACE_LIMIT = 5;

/**
 * Returns a compact display label for a Jupyter-relative workspace path.
 */
function workspacePathLabel(path: string): string {
  if (path === "") return "Server root";

  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : path;
}

/**
 * Builds a child path under the current workspace root.
 */
function joinWorkspacePath(workspaceDirectory: string, name: string): string {
  return workspaceDirectory ? `${workspaceDirectory}/${name}` : name;
}

/**
 * Creates a file at the selected workspace root using Jupyter contents APIs.
 */
async function createWorkspaceRootFile(
  contentsManager: ContentsManager,
  workspaceDirectory: string,
  name: string
): Promise<EmptyEditorFile> {
  const newPath = joinWorkspacePath(workspaceDirectory, name);
  const isNotebook = name.toLowerCase().endsWith(".ipynb");

  if (isNotebook) {
    const created = await contentsManager.newUntitled({
      path: workspaceDirectory,
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

  return { name, path: newPath };
}

/**
 * Creates a folder at the selected workspace root using Jupyter contents APIs.
 */
async function createWorkspaceRootFolder(
  contentsManager: ContentsManager,
  workspaceDirectory: string,
  name: string
): Promise<void> {
  const newPath = joinWorkspacePath(workspaceDirectory, name);
  await contentsManager.save(newPath, {
    type: "directory",
    format: "json",
    content: [],
  });
}

/**
 * Shows connected workspace shortcuts when the editor has no active file.
 */
export function EmptyEditorCard({
  kernelService,
  recentFiles = [],
  workspaceDirectory,
  onOpenFile,
  onWorkspaceChange,
}: EmptyEditorCardProps) {
  const { effectiveSettings } = useOrionSettings();
  const [createKind, setCreateKind] = React.useState<CreateItemKind>("file");
  const [createName, setCreateName] = React.useState("untitled.ipynb");
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const workspaceRoot =
    workspaceDirectory !== null && workspaceDirectory !== undefined
      ? workspaceDirectory
      : "";
  const pinnedWorkspaces = effectiveSettings.workspace.pinnedDirectoryPaths.slice(
    0,
    PINNED_WORKSPACE_LIMIT
  );
  const topRecentFiles = recentFiles.slice(0, RECENT_FILE_LIMIT);

  React.useEffect(() => {
    if (!createDialogOpen) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [createDialogOpen]);

  /**
   * Opens the create dialog with sensible defaults for the requested item type.
   */
  const openCreateDialog = React.useCallback((kind: CreateItemKind) => {
    setCreateKind(kind);
    setCreateName(kind === "file" ? "untitled.ipynb" : "New Folder");
    setCreateDialogOpen(true);
  }, []);

  /**
   * Creates the selected file or folder and refreshes workspace file listings.
   */
  const handleCreateItem = React.useCallback(async () => {
    const name = createName.trim();

    if (!name || !kernelService) return;

    if (name.includes("/")) {
      toast.error("Name cannot contain '/'.");
      return;
    }

    setIsCreating(true);

    try {
      const contentsManager = kernelService.getContentsManager();

      if (createKind === "file") {
        const createdFile = await createWorkspaceRootFile(
          contentsManager,
          workspaceRoot,
          name
        );
        onOpenFile?.(createdFile);
      } else {
        await createWorkspaceRootFolder(contentsManager, workspaceRoot, name);
      }

      dispatchWorkspaceFilesChanged(workspaceRoot);
      setCreateDialogOpen(false);
      setCreateName("");
    } catch (error) {
      console.error("Error creating workspace item:", error);
      toast.error(`Failed to create ${createKind}. See console for details.`);
    } finally {
      setIsCreating(false);
    }
  }, [createKind, createName, kernelService, onOpenFile, workspaceRoot]);

  const createDialogTitle =
    createKind === "file" ? "Create New File" : "Create New Folder";
  const createDialogDescription =
    workspaceRoot === ""
      ? "Create it at the Jupyter server root."
      : `Create it in "${workspaceRoot}".`;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sidebar p-6">
      <div className="corner-squircle w-full max-w-xl rounded-lg border bg-background p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6">Current Workspace</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {workspaceRoot === "" ? "Workspace: Server root" : workspaceRoot}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openCreateDialog("file")}>
                <FilePlusCorner className="mr-2 h-4 w-4" />
                New file
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreateDialog("folder")}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <section className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" />
              Recent files
            </div>
            {topRecentFiles.length > 0 ? (
              <div className="space-y-1">
                {topRecentFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className={cn(
                      "corner-squircle flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                    onClick={() => onOpenFile?.(file)}
                  >
                    <FileIcon filename={file.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {file.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {file.path}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No recent files
              </p>
            )}
          </section>

          <section className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Pin className="h-4 w-4 text-muted-foreground" />
              Pinned workspaces
            </div>
            {pinnedWorkspaces.length > 0 ? (
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {pinnedWorkspaces.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={cn(
                      "corner-squircle flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                    title={path}
                    onClick={() => onWorkspaceChange?.(path)}
                  >
                    <Folder className="h-4 w-4 shrink-0 fill-[#ff4800] text-black/60" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {workspacePathLabel(path)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {path}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No pinned workspaces
              </p>
            )}
          </section>
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createDialogTitle}</DialogTitle>
            <DialogDescription>{createDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="empty-editor-create-name">
              {createKind === "file" ? "File name" : "Folder name"}
            </Label>
            <Input
              id="empty-editor-create-name"
              ref={inputRef}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateItem();
                }
              }}
              placeholder={
                createKind === "file" ? "untitled.ipynb" : "New Folder"
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateItem()}
              disabled={isCreating || createName.trim().length === 0}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
