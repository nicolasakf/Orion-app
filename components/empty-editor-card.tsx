"use client";

import * as React from "react";
import {
  FilePlusCorner,
  Folder,
  History,
  Pin,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { ContentsManager } from "@jupyterlab/services";

import { CustomIcon } from "@/components/common/custom-icon";
import { FileIcon } from "@/components/common/file-icon";
import {
  ScrollGradientOverlays,
  useScrollEdgeIndicators,
} from "@/components/right-sidebar/scroll-edge-gradient";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { openNativeProjectFolderPicker } from "@/lib/local/project-folder-picker.client";
import type { EmptyEditorCardContent } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";
import { dispatchWorkspaceFilesChanged } from "@/lib/workspace/workspace-events";
import {
  MAX_RECENT_FILE_PATHS,
} from "@/lib/workspace/recent-files";
import {
  MAX_RECENT_PROJECT_PATHS,
} from "@/lib/workspace/recent-projects";

interface EmptyEditorFile {
  name: string;
  path: string;
  openAsText?: boolean;
}

interface EmptyEditorCardProps {
  kernelService?: KernelService | null;
  recentFiles?: EmptyEditorFile[];
  recentProjectPaths?: string[];
  workspaceDirectory?: string | null;
  hasServerConnection?: boolean;
  canPromptForRuntime?: boolean;
  onConnectServer?: () => void;
  onOpenFile?: (file: EmptyEditorFile) => void;
  onWorkspaceChange?: (path: string) => void;
  /** When true, show business-mode empty editor actions. */
  businessMode?: boolean;
  /** Opens the business-mode new-analysis naming dialog. */
  onNewAnalysis?: () => void;
}

type CreateItemKind = "file" | "folder";

interface EmptyEditorCardSectionConfig {
  content: EmptyEditorCardContent;
  title: string;
  emptyMessage: string;
  icon: React.ReactNode;
}

const EMPTY_EDITOR_CARD_SECTIONS: Record<
  EmptyEditorCardContent,
  Omit<EmptyEditorCardSectionConfig, "content">
> = {
  recent_files: {
    title: "Recent files",
    emptyMessage: "No recent files",
    icon: <History className="h-4 w-4 text-muted-foreground" />,
  },
  pinned_files: {
    title: "Pinned files",
    emptyMessage: "No pinned files",
    icon: <Pin className="h-4 w-4 text-muted-foreground" />,
  },
  pinned_workspaces: {
    title: "Pinned workspaces",
    emptyMessage: "No pinned workspaces",
    icon: <Pin className="h-4 w-4 text-muted-foreground" />,
  },
};

/**
 * Returns a compact display label for a Jupyter-relative workspace path.
 */
function workspacePathLabel(path: string): string {
  if (path === "") return "Server root";

  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : path;
}

interface WorkspaceBreadcrumbSegment {
  label: string;
  path: string;
}

/**
 * Builds breadcrumb segments for the active Jupyter workspace directory.
 */
function buildWorkspaceBreadcrumbSegments(
  workspaceRoot: string
): WorkspaceBreadcrumbSegment[] {
  const parts = workspaceRoot.split("/").filter(Boolean);

  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

interface WorkspaceBreadcrumbProps {
  workspaceRoot: string;
  onWorkspaceChange?: (path: string) => void;
}

/**
 * Renders the current workspace as a breadcrumb with navigable parent segments.
 */
function WorkspaceBreadcrumb({
  workspaceRoot,
  onWorkspaceChange,
}: WorkspaceBreadcrumbProps) {
  const segments = React.useMemo(
    () => buildWorkspaceBreadcrumbSegments(workspaceRoot),
    [workspaceRoot]
  );

  if (segments.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="ml-2">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <React.Fragment key={segment.path}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      className="font-normal"
                      onClick={() => onWorkspaceChange?.(segment.path)}
                    >
                      {segment.label}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
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

/** Returns the folder containing a Jupyter-relative file path. */
function parentWorkspacePath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex === -1 ? "" : path.slice(0, slashIndex);
}

/** Builds a de-duplicated recent project list from recently opened files. */
function deriveRecentProjectPaths(recentFiles: EmptyEditorFile[]): string[] {
  const paths: string[] = [];
  for (const file of recentFiles) {
    const projectPath = parentWorkspacePath(file.path);
    if (!paths.includes(projectPath)) {
      paths.push(projectPath);
    }
  }
  return paths;
}

interface EmptyEditorShortcutCardProps {
  section: EmptyEditorCardSectionConfig;
  recentFiles: EmptyEditorFile[];
  pinnedFilePaths: string[];
  pinnedWorkspacePaths: string[];
  /** How many shortcut rows are visible before the list scrolls. */
  visibleItemCount: number;
  onOpenFile?: (file: EmptyEditorFile) => void;
  onWorkspaceChange?: (path: string) => void;
}

/** Approximate row height for empty-editor shortcut buttons (px). */
const SHORTCUT_ITEM_HEIGHT_PX = 48;

/** Gap between shortcut rows (matches `space-y-1`). */
const SHORTCUT_ITEM_GAP_PX = 4;

/** Max scroll viewport height for a given number of visible shortcut rows. */
function shortcutListMaxHeight(visibleItemCount: number): number {
  return (
    visibleItemCount * SHORTCUT_ITEM_HEIGHT_PX +
    Math.max(0, visibleItemCount - 1) * SHORTCUT_ITEM_GAP_PX
  );
}

interface ShortcutScrollListProps {
  itemCount: number;
  visibleItemCount: number;
  emptyMessage: string;
  children: React.ReactNode;
}

/** Scrollable shortcut list with hidden scrollbar and edge gradients. */
function ShortcutScrollList({
  itemCount,
  visibleItemCount,
  emptyMessage,
  children,
}: ShortcutScrollListProps) {
  const { scrollRef, scrollEdges } = useScrollEdgeIndicators({
    active: itemCount > 0,
    contentKey: itemCount,
  });
  const listMaxHeight = shortcutListMaxHeight(visibleItemCount);

  if (itemCount === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="relative min-h-0">
      <div
        ref={scrollRef}
        className="scrollbar-hide space-y-1 overflow-y-auto"
        style={{ maxHeight: listMaxHeight }}
      >
        {children}
      </div>
      <ScrollGradientOverlays edges={scrollEdges} />
    </div>
  );
}

/**
 * Renders one configurable shortcut list in the empty-editor card grid.
 */
function EmptyEditorShortcutCard({
  section,
  recentFiles,
  pinnedFilePaths,
  pinnedWorkspacePaths,
  visibleItemCount,
  onOpenFile,
  onWorkspaceChange,
}: EmptyEditorShortcutCardProps) {
  if (section.content === "recent_files") {
    const files = recentFiles.slice(0, MAX_RECENT_FILE_PATHS);

    return (
      <section className="corner-squircle min-w-0 rounded-md border border-sidebar-border bg-transparent p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {section.icon}
          {section.title}
        </div>
        <ShortcutScrollList
          itemCount={files.length}
          visibleItemCount={visibleItemCount}
          emptyMessage={section.emptyMessage}
        >
          {files.map((file) => (
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
                <span className="block truncate font-medium">{file.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {file.path}
                </span>
              </span>
            </button>
          ))}
        </ShortcutScrollList>
      </section>
    );
  }

  if (section.content === "pinned_files") {
    const files = pinnedFilePaths.map((path) => ({
      name: path.split("/").pop() ?? path,
      path,
    }));

    return (
      <section className="corner-squircle min-w-0 rounded-md border border-sidebar-border bg-transparent p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {section.icon}
          {section.title}
        </div>
        <ShortcutScrollList
          itemCount={files.length}
          visibleItemCount={visibleItemCount}
          emptyMessage={section.emptyMessage}
        >
          {files.map((file) => (
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
                <span className="block truncate font-medium">{file.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {file.path}
                </span>
              </span>
            </button>
          ))}
        </ShortcutScrollList>
      </section>
    );
  }

  return (
    <section className="corner-squircle min-w-0 rounded-md border border-sidebar-border bg-transparent p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {section.icon}
        {section.title}
      </div>
      <ShortcutScrollList
        itemCount={pinnedWorkspacePaths.length}
        visibleItemCount={visibleItemCount}
        emptyMessage={section.emptyMessage}
      >
        {pinnedWorkspacePaths.map((path) => (
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
      </ShortcutScrollList>
    </section>
  );
}

interface ProjectShortcutCardProps {
  title: string;
  emptyMessage: string;
  projectPaths: string[];
  /** How many project rows are visible before the list scrolls. */
  visibleItemCount: number;
  onWorkspaceChange?: (path: string) => void;
  headerIcon?: React.ReactNode;
}

/** Renders one no-project shortcut list for recently used or pinned projects. */
function ProjectShortcutCard({
  title,
  emptyMessage,
  projectPaths,
  visibleItemCount,
  onWorkspaceChange,
  headerIcon = <Folder className="h-4 w-4 text-muted-foreground" />,
}: ProjectShortcutCardProps) {
  return (
    <section className="corner-squircle min-w-0 rounded-md border border-sidebar-border bg-transparent p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {headerIcon}
        {title}
      </div>
      <ShortcutScrollList
        itemCount={projectPaths.length}
        visibleItemCount={visibleItemCount}
        emptyMessage={emptyMessage}
      >
        {projectPaths.map((path) => (
          <button
            key={path}
            type="button"
            className={cn(
              "corner-squircle flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            title={path || "Server root"}
            onClick={() => onWorkspaceChange?.(path)}
          >
            <Folder className="h-4 w-4 shrink-0 fill-[#ff4800] text-black/60" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {workspacePathLabel(path)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {path || "Server root"}
              </span>
            </span>
          </button>
        ))}
      </ShortcutScrollList>
    </section>
  );
}

/**
 * Shows connected workspace shortcuts when the editor has no active file.
 */
export function EmptyEditorCard({
  kernelService,
  recentFiles = [],
  recentProjectPaths: recentProjectPathsProp,
  workspaceDirectory,
  hasServerConnection = false,
  canPromptForRuntime = true,
  onConnectServer,
  onOpenFile,
  onWorkspaceChange,
  businessMode = false,
  onNewAnalysis,
}: EmptyEditorCardProps) {
  const { effectiveSettings } = useOrionSettings();
  const [createKind, setCreateKind] = React.useState<CreateItemKind>("file");
  const [createName, setCreateName] = React.useState("untitled.ipynb");
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const promptedForRuntimeRef = React.useRef(false);

  const hasProjectOpen =
    workspaceDirectory !== null && workspaceDirectory !== undefined;
  const workspaceRoot = hasProjectOpen ? workspaceDirectory ?? "" : "";
  const emptyEditorSettings = effectiveSettings.editor.emptyEditor;
  /** Server root (`""`) is never pinned. */
  const pinnedWorkspacePaths = React.useMemo(
    () =>
      effectiveSettings.workspace.pinnedDirectoryPaths.filter((path) => path !== ""),
    [effectiveSettings.workspace.pinnedDirectoryPaths]
  );
  const cardSections = React.useMemo<EmptyEditorCardSectionConfig[]>(
    () =>
      [emptyEditorSettings.leftCard, emptyEditorSettings.rightCard].map(
        (content) => ({
          content,
          ...EMPTY_EDITOR_CARD_SECTIONS[content],
        })
      ),
    [emptyEditorSettings.leftCard, emptyEditorSettings.rightCard]
  );
  const recentProjectPaths = React.useMemo(
    () => recentProjectPathsProp ?? deriveRecentProjectPaths(recentFiles),
    [recentFiles, recentProjectPathsProp]
  );

  React.useEffect(() => {
    if (!createDialogOpen) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [createDialogOpen]);

  React.useEffect(() => {
    if (
      !canPromptForRuntime ||
      hasServerConnection ||
      kernelService ||
      promptedForRuntimeRef.current
    ) {
      return;
    }
    promptedForRuntimeRef.current = true;
    onConnectServer?.();
  }, [canPromptForRuntime, hasServerConnection, kernelService, onConnectServer]);

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

  /** Opens the native project folder picker, connecting the runtime first when needed. */
  const handleNewProject = React.useCallback(async () => {
    if (!kernelService) {
      onConnectServer?.();
      return;
    }

    try {
      const selection = await openNativeProjectFolderPicker();
      if (!selection) return;
      onWorkspaceChange?.(selection.path);
    } catch (error) {
      console.error("Failed to open native project picker:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to open the native project picker."
      );
    }
  }, [kernelService, onConnectServer, onWorkspaceChange]);

  const createDialogTitle =
    createKind === "file" ? "Create New File" : "Create New Folder";
  const createDialogDescription =
    workspaceRoot === ""
      ? "Create it at the Jupyter server root."
      : `Create it in "${workspaceRoot}".`;

  if (!hasProjectOpen) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sidebar p-6">
        <div className="flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-start justify-end gap-3">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void handleNewProject()}
            >
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <ProjectShortcutCard
              title="Recent projects"
              emptyMessage="No recent projects"
              projectPaths={recentProjectPaths.slice(0, MAX_RECENT_PROJECT_PATHS)}
              visibleItemCount={emptyEditorSettings.maxItems}
              onWorkspaceChange={onWorkspaceChange}
            />
            <ProjectShortcutCard
              title="Pinned projects"
              emptyMessage="No pinned projects"
              projectPaths={pinnedWorkspacePaths}
              visibleItemCount={emptyEditorSettings.maxItems}
              onWorkspaceChange={onWorkspaceChange}
              headerIcon={<Pin className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sidebar p-6">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <WorkspaceBreadcrumb
              workspaceRoot={workspaceRoot}
              onWorkspaceChange={onWorkspaceChange}
            />
          </div>

          {businessMode ? (
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onNewAnalysis?.()}
            >
              <Plus className="h-4 w-4" />
              New notebook
            </Button>
          ) : (
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
                  <CustomIcon filename="folder-plus-corner" className="mr-2 h-4 w-4" />
                  New folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {cardSections.map((section, index) => (
            <EmptyEditorShortcutCard
              key={`${section.content}-${index}`}
              section={section}
              recentFiles={recentFiles}
              pinnedFilePaths={effectiveSettings.workspace.pinnedFilePaths}
              pinnedWorkspacePaths={pinnedWorkspacePaths}
              visibleItemCount={emptyEditorSettings.maxItems}
              onOpenFile={onOpenFile}
              onWorkspaceChange={onWorkspaceChange}
            />
          ))}
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
