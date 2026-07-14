import { realpath, stat } from "fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "path";

import { jupyterBaseUrlsMatch } from "./workspace-url";

export { jupyterBaseUrlsMatch, normalizeJupyterBaseUrl } from "./workspace-url";

/** Request data accepted by Electron's native workspace-path IPC handlers. */
export interface WorkspacePathActionRequest {
  /** A POSIX-style path relative to the managed Jupyter root. */
  path: string;
  /** The Jupyter server URL currently used by the renderer. */
  jupyterBaseUrl: string;
}

/** A filesystem item that has passed the managed-workspace containment checks. */
export interface ResolvedWorkspacePath {
  absolutePath: string;
  isDirectory: boolean;
}

/** The desktop-session fields required to authorize a native workspace action. */
export interface ManagedWorkspaceSession {
  jupyter: { baseUrl: string } | null;
  jupyterRootDirectory: string;
}

/** The limited native-shell surface needed for workspace actions. */
export interface NativeWorkspaceShell {
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => void;
}

/** The two native actions Orion can perform for a workspace item. */
export type NativeWorkspacePathAction = "open" | "reveal";

/**
 * Parses IPC data before it reaches filesystem APIs. The preload type is only
 * a convenience for trusted renderer code; this parser is the main-process
 * security boundary.
 */
export function parseWorkspacePathActionRequest(
  value: unknown
): WorkspacePathActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid workspace path request.");
  }

  const { path, jupyterBaseUrl } = value as Record<string, unknown>;
  if (typeof path !== "string" || typeof jupyterBaseUrl !== "string") {
    throw new Error("Invalid workspace path request.");
  }

  return { path, jupyterBaseUrl };
}

/**
 * Converts a Jupyter-relative path into safe path segments. Rejecting rather
 * than normalizing traversal keeps malformed renderer requests unambiguous.
 */
function getSafeWorkspacePathSegments(workspacePath: string): string[] {
  if (
    workspacePath.includes("\0") ||
    workspacePath.includes("\\") ||
    workspacePath.startsWith("/") ||
    isAbsolute(workspacePath) ||
    win32.isAbsolute(workspacePath) ||
    /^[a-zA-Z]:/.test(workspacePath)
  ) {
    throw new Error("Workspace paths must be relative to the active Jupyter root.");
  }

  const segments = workspacePath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("Workspace paths cannot leave the active Jupyter root.");
  }

  return segments.filter((segment) => segment !== ".");
}

/** Returns true when a resolved target is inside, or is equal to, a resolved root. */
function isPathInsideRoot(rootDirectory: string, targetPath: string): boolean {
  const pathFromRoot = relative(rootDirectory, targetPath);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

/**
 * Resolves a workspace path while ensuring both lexical and symlink-resolved
 * paths remain under the managed Jupyter root.
 */
export async function resolveWorkspacePath(
  rootDirectory: string,
  workspacePath: string
): Promise<ResolvedWorkspacePath> {
  const segments = getSafeWorkspacePathSegments(workspacePath);

  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(rootDirectory);
  } catch {
    throw new Error("The managed Jupyter workspace is unavailable.");
  }

  const lexicalTarget = resolve(resolvedRoot, ...segments);
  if (!isPathInsideRoot(resolvedRoot, lexicalTarget)) {
    throw new Error("Workspace paths cannot leave the active Jupyter root.");
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await realpath(lexicalTarget);
  } catch {
    throw new Error("The selected file or folder no longer exists.");
  }

  if (!isPathInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new Error("The selected file or folder resolves outside the active Jupyter root.");
  }

  try {
    const targetStats = await stat(resolvedTarget);
    if (!targetStats.isFile() && !targetStats.isDirectory()) {
      throw new Error("Only files and folders can be opened from the workspace.");
    }

    return {
      absolutePath: resolvedTarget,
      isDirectory: targetStats.isDirectory(),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Only files")) {
      throw error;
    }
    throw new Error("The selected file or folder is unavailable.");
  }
}

/** Opens an item through Electron and turns its string failure result into an Error. */
async function openNativePath(
  nativeShell: NativeWorkspaceShell,
  absolutePath: string
): Promise<void> {
  let failureMessage: string;
  try {
    failureMessage = await nativeShell.openPath(absolutePath);
  } catch {
    throw new Error("The operating system could not open the selected file or folder.");
  }

  if (failureMessage) {
    throw new Error(`The operating system could not open the selected file or folder: ${failureMessage}`);
  }
}

/**
 * Uses native Electron APIs after containment validation. Files are selected
 * in Finder/Explorer for reveal; folders use their regular OS open action.
 */
export async function executeNativeWorkspacePathAction(
  action: NativeWorkspacePathAction,
  rootDirectory: string,
  workspacePath: string,
  nativeShell: NativeWorkspaceShell
): Promise<void> {
  const target = await resolveWorkspacePath(rootDirectory, workspacePath);

  if (action === "reveal" && !target.isDirectory) {
    try {
      nativeShell.showItemInFolder(target.absolutePath);
    } catch {
      throw new Error("The operating system could not reveal the selected file.");
    }
    return;
  }

  await openNativePath(nativeShell, target.absolutePath);
}

/**
 * Authorizes a typed request against the Electron-managed Jupyter session,
 * then performs its native action. The caller remains responsible for first
 * verifying that the IPC sender is a trusted Orion window.
 */
export async function executeManagedWorkspacePathAction(
  action: NativeWorkspacePathAction,
  session: ManagedWorkspaceSession | null,
  value: unknown,
  nativeShell: NativeWorkspaceShell
): Promise<void> {
  if (!session?.jupyter) {
    throw new Error(
      "This workspace action is available only for the local Jupyter runtime launched by Orion."
    );
  }

  const request = parseWorkspacePathActionRequest(value);
  if (!jupyterBaseUrlsMatch(request.jupyterBaseUrl, session.jupyter.baseUrl)) {
    throw new Error(
      "This workspace belongs to a different Jupyter server and cannot be opened by the local desktop runtime."
    );
  }

  await executeNativeWorkspacePathAction(
    action,
    session.jupyterRootDirectory,
    request.path,
    nativeShell
  );
}
