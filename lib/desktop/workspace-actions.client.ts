import { jupyterBaseUrlsMatch } from "./workspace-url";

/** The small KernelService surface needed to identify the active Jupyter server. */
export interface WorkspacePathServerSettingsProvider {
  getServerSettings: () => { baseUrl: string };
}

/** Input accepted by the client-side workspace action helpers. */
export interface WorkspacePathActionOptions {
  path: string;
  jupyterBaseUrl?: string | null;
  kernelService?: WorkspacePathServerSettingsProvider | null;
}

/** Explains whether the renderer can request a native workspace action. */
export type WorkspacePathActionAvailability =
  | { available: true; jupyterBaseUrl: string }
  | { available: false; message: string };

/** Result returned instead of throwing so UI callers can offer Copy path on failure. */
export type WorkspacePathActionResult =
  | { ok: true }
  | { ok: false; message: string };

/** The native workspace subset of Electron's preload bridge. */
interface DesktopWorkspaceBridge {
  getManagedJupyterBaseUrl: () => Promise<string | null>;
  revealWorkspacePath: (request: { path: string; jupyterBaseUrl: string }) => Promise<void>;
  openWorkspacePath: (request: { path: string; jupyterBaseUrl: string }) => Promise<void>;
}

const DESKTOP_ACTION_UNAVAILABLE =
  "This workspace action is available only in the Orion desktop app.";
const JUPYTER_CONNECTION_UNAVAILABLE =
  "Connect to a Jupyter server before opening this workspace item.";
const MANAGED_RUNTIME_UNAVAILABLE =
  "This workspace action is available only for the local Jupyter runtime launched by Orion.";

/** Returns the active server URL, preferring an explicit current connection when supplied. */
function getJupyterBaseUrl(options: WorkspacePathActionOptions): string | null {
  const explicitBaseUrl = options.jupyterBaseUrl?.trim();
  if (explicitBaseUrl) return explicitBaseUrl;

  const serviceBaseUrl = options.kernelService?.getServerSettings().baseUrl.trim();
  return serviceBaseUrl || null;
}

/** Returns the complete desktop bridge only when this renderer is inside Electron. */
function getDesktopWorkspaceBridge(): DesktopWorkspaceBridge | undefined {
  if (typeof window === "undefined") return undefined;

  const bridge = (window as Window & { orionDesktopShell?: DesktopWorkspaceBridge })
    .orionDesktopShell;
  if (
    !bridge?.getManagedJupyterBaseUrl ||
    !bridge.revealWorkspacePath ||
    !bridge.openWorkspacePath
  ) {
    return undefined;
  }
  return bridge;
}

/** Reports whether this renderer can ask the desktop host to act on a workspace path. */
export async function getWorkspacePathActionAvailability(
  options: WorkspacePathActionOptions
): Promise<WorkspacePathActionAvailability> {
  const jupyterBaseUrl = getJupyterBaseUrl(options);
  if (!jupyterBaseUrl) {
    return { available: false, message: JUPYTER_CONNECTION_UNAVAILABLE };
  }
  const desktopBridge = getDesktopWorkspaceBridge();
  if (!desktopBridge) {
    return { available: false, message: DESKTOP_ACTION_UNAVAILABLE };
  }

  try {
    const managedJupyterBaseUrl = await desktopBridge.getManagedJupyterBaseUrl();
    if (!managedJupyterBaseUrl || !jupyterBaseUrlsMatch(jupyterBaseUrl, managedJupyterBaseUrl)) {
      return { available: false, message: MANAGED_RUNTIME_UNAVAILABLE };
    }
  } catch {
    return { available: false, message: MANAGED_RUNTIME_UNAVAILABLE };
  }

  return { available: true, jupyterBaseUrl };
}

/** Invokes a native reveal or open action and returns a UI-safe result. */
export async function invokeWorkspacePathAction(
  action: "open" | "reveal",
  options: WorkspacePathActionOptions
): Promise<WorkspacePathActionResult> {
  const availability = await getWorkspacePathActionAvailability(options);
  if (!availability.available) {
    return { ok: false, message: availability.message };
  }

  try {
    const desktopBridge = getDesktopWorkspaceBridge();
    if (!desktopBridge) {
      return { ok: false, message: DESKTOP_ACTION_UNAVAILABLE };
    }
    const request = {
      path: options.path,
      jupyterBaseUrl: availability.jupyterBaseUrl,
    };
    if (action === "reveal") {
      await desktopBridge.revealWorkspacePath(request);
    } else {
      await desktopBridge.openWorkspacePath(request);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The desktop app could not open the selected workspace item.",
    };
  }
}

/** Reveals a workspace path in Finder or Explorer when the local desktop runtime owns it. */
export async function revealWorkspacePath(
  options: WorkspacePathActionOptions
): Promise<WorkspacePathActionResult> {
  return invokeWorkspacePathAction("reveal", options);
}

/** Opens a workspace file or folder with the operating system's default application. */
export async function openWorkspacePath(
  options: WorkspacePathActionOptions
): Promise<WorkspacePathActionResult> {
  return invokeWorkspacePathAction("open", options);
}
