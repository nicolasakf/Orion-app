import { basename, isAbsolute, join, relative, resolve, sep } from "path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  powerSaveBlocker,
  shell,
} from "electron";

import { DEFAULT_ORION_PORT } from "../lib/cli/app-server";
import { parseDesktopOptions } from "../lib/desktop/options";
import {
  executeManagedWorkspacePathAction,
  type NativeWorkspacePathAction,
} from "../lib/desktop/workspace-actions";
import { runDesktopSmoke, startDesktopSession, type DesktopSession } from "../lib/desktop/launcher";
import {
  AgentRunPowerManager,
  type AgentRunPowerState,
} from "./agent-run-power-manager";
import { setupDesktopApplicationMenu } from "./menu";
import {
  checkForDesktopUpdates,
  configureDesktopAutoUpdates,
  downloadDesktopUpdate,
  getDesktopUpdateState,
  restartAndInstallDesktopUpdate,
  shouldCheckForDesktopUpdates,
  stopDesktopAutoUpdateSchedule,
  subscribeToDesktopUpdates,
} from "./updater";

let session: DesktopSession | null = null;
let mainWindow: BrowserWindow | null = null;
const appWindows = new Set<BrowserWindow>();
const agentRunPowerManager = new AgentRunPowerManager(powerSaveBlocker);

interface NativeProjectFolderPickerResult {
  absolutePath: string;
  path: string;
  name: string;
}

interface DesktopCaptureRegionRequest {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DesktopCaptureRegionResult {
  data: string;
  width: number;
  height: number;
}

/** Returns true for a renderer-provided agent activity and sleep preference payload. */
function isAgentRunPowerState(value: unknown): value is AgentRunPowerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AgentRunPowerState>;
  return (
    typeof state.active === "boolean" &&
    typeof state.preventSystemSleep === "boolean"
  );
}

/** Returns true for the six-digit hex colors Orion sends from the renderer. */
function isHexWindowBackgroundColor(color: unknown): color is string {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Returns true for a finite, positive, integer compositor-capture rectangle. */
function isDesktopCaptureRegionRequest(value: unknown): value is DesktopCaptureRegionRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<DesktopCaptureRegionRequest>;
  return [request.x, request.y, request.width, request.height].every(Number.isInteger) &&
    (request.x ?? -1) >= 0 &&
    (request.y ?? -1) >= 0 &&
    (request.width ?? 0) > 0 &&
    (request.height ?? 0) > 0;
}

/** Returns the dev server URL for local `npx electron .` runs, or an explicit packaged override. */
function resolveDesktopDevUrl(): string | undefined {
  if (process.env.ORION_DESKTOP_DEV_URL) {
    return process.env.ORION_DESKTOP_DEV_URL;
  }
  return app.isPackaged ? undefined : `http://127.0.0.1:${DEFAULT_ORION_PORT}`;
}

/** Converts a selected native folder into a Jupyter-relative project path. */
function toJupyterRelativePath(rootDirectory: string, absolutePath: string): string | null {
  const root = resolve(rootDirectory);
  const target = resolve(absolutePath);
  const jupyterPath = relative(root, target);

  if (jupyterPath.startsWith("..") || isAbsolute(jupyterPath)) {
    return null;
  }

  return jupyterPath.split(sep).join("/");
}

const OAUTH_POPUP_WINDOW_NAMES = new Set([
  "orion-chatgpt-oauth",
  "orion-cloud-google-oauth",
]);

/** Shared BrowserWindow options for Orion desktop shells. */
function getDesktopBrowserWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    width: 1920,
    height: 1200,
    minWidth: 960,
    minHeight: 640,
    title: "Orion",
    backgroundColor: "#131316",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "preload.js"),
    },
  };
}

/** Parses `window.open` feature strings such as `popup=yes,width=520,height=720`. */
function parsePopupWindowFeatures(features: string): { width: number; height: number } {
  const widthMatch = features.match(/(?:^|,)\s*width=(\d+)/);
  const heightMatch = features.match(/(?:^|,)\s*height=(\d+)/);
  return {
    width: widthMatch ? Number(widthMatch[1]) : 520,
    height: heightMatch ? Number(heightMatch[1]) : 720,
  };
}

/** Returns compact popup options for OAuth and other auxiliary windows. */
function getOAuthPopupBrowserWindowOptions(
  features: string
): Electron.BrowserWindowConstructorOptions {
  const { width, height } = parsePopupWindowFeatures(features);
  return {
    ...getDesktopBrowserWindowOptions(),
    width,
    height,
    minWidth: width,
    minHeight: height,
  };
}

/** Returns true when a renderer `window.open` target should stay inside Orion. */
function isOrionAppUrl(url: string, appBaseUrl: string): boolean {
  if (url === "" || url === "about:blank") {
    return true;
  }

  try {
    return new URL(url).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}

/** Tracks app windows so secondary windows stay alive until they are closed. */
function registerAppWindow(appWindow: BrowserWindow): void {
  appWindows.add(appWindow);
  const rendererId = appWindow.webContents.id;
  appWindow.webContents.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) {
      agentRunPowerManager.removeRenderer(rendererId);
    }
  });
  appWindow.webContents.on("render-process-gone", () => {
    agentRunPowerManager.removeRenderer(rendererId);
  });
  appWindow.on("closed", () => {
    agentRunPowerManager.removeRenderer(rendererId);
    appWindows.delete(appWindow);
    if (mainWindow === appWindow) {
      mainWindow = appWindows.values().next().value ?? null;
    }
  });
}

/** Returns the focused Orion window, falling back to the primary window. */
function getActiveAppWindow(): BrowserWindow | null {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && appWindows.has(focusedWindow)) {
    return focusedWindow;
  }
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** Returns whether a registered window is presently serving Orion's local origin. */
function isTrustedAppWindow(appWindow: BrowserWindow | null): appWindow is BrowserWindow {
  if (!appWindow || appWindow.isDestroyed() || !appWindows.has(appWindow) || !session) {
    return false;
  }

  try {
    return new URL(appWindow.webContents.getURL()).origin === new URL(session.url).origin;
  } catch {
    return false;
  }
}

/** Resolves a trusted Orion app window that sent a shell IPC request. */
function getShellIpcWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  return isTrustedAppWindow(senderWindow) ? senderWindow : null;
}

/** Throws when an IPC request does not come from a tracked Orion app window. */
function requireShellIpcWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const senderWindow = getShellIpcWindow(event);
  if (!senderWindow) {
    throw new Error("Only Orion app windows can use desktop shell actions.");
  }
  return senderWindow;
}

/** Runs a guarded native file action for the Jupyter runtime that this desktop app launched. */
async function handleWorkspacePathAction(
  event: Electron.IpcMainInvokeEvent,
  value: unknown,
  action: NativeWorkspacePathAction
): Promise<void> {
  requireShellIpcWindow(event);
  await executeManagedWorkspacePathAction(action, session, value, shell);
}

/** Keeps top-level Orion windows from navigating to external websites in-place. */
function setupExternalNavigationHandler(
  window: BrowserWindow,
  appBaseUrl: string
): void {
  window.webContents.on("will-navigate", (event, url) => {
    if (isOrionAppUrl(url, appBaseUrl)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });
}

/** Routes renderer-initiated window opens to matching Electron window chrome. */
function setupWindowOpenHandler(window: BrowserWindow, appBaseUrl: string): void {
  if (appWindows.has(window)) {
    setupExternalNavigationHandler(window, appBaseUrl);
  }

  window.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    const isNamedOAuthPopup = OAUTH_POPUP_WINDOW_NAMES.has(frameName);
    const isPopupRequest = features.includes("popup=yes") || isNamedOAuthPopup;

    if (isOrionAppUrl(url, appBaseUrl)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: isPopupRequest
          ? getOAuthPopupBrowserWindowOptions(features)
          : getDesktopBrowserWindowOptions(),
      };
    }

    if (isPopupRequest || url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: getOAuthPopupBrowserWindowOptions(features),
      };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("did-create-window", (childWindow, details) => {
    if (
      details.url !== "" &&
      details.url !== "about:blank" &&
      isOrionAppUrl(details.url, appBaseUrl) &&
      !OAUTH_POPUP_WINDOW_NAMES.has(details.frameName)
    ) {
      registerAppWindow(childWindow);
    }
    setupWindowOpenHandler(childWindow, appBaseUrl);
  });
}

/** Opens an Orion desktop browser window with shared shell configuration. */
async function openDesktopAppWindow(url: string): Promise<BrowserWindow> {
  const appWindow = new BrowserWindow(getDesktopBrowserWindowOptions());
  registerAppWindow(appWindow);
  setupWindowOpenHandler(appWindow, url);
  await appWindow.loadURL(url);
  return appWindow;
}

/** Creates Orion's main desktop browser window. */
async function createWindow(url: string): Promise<void> {
  mainWindow = await openDesktopAppWindow(url);
}

/** Returns true for a non-empty notification title/body payload from the renderer. */
function isDesktopNotificationPayload(
  value: unknown
): value is { title: string; body: string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as { title?: unknown; body?: unknown };
  return (
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    typeof payload.body === "string" &&
    payload.body.trim().length > 0
  );
}

/** Registers shell appearance controls exposed by the sandboxed preload. */
function setupShellIpc(): void {
  ipcMain.handle("orion:shell:set-background-color", (event, color: unknown) => {
    if (!isHexWindowBackgroundColor(color)) {
      throw new Error("Invalid Electron window background color.");
    }
    requireShellIpcWindow(event).setBackgroundColor(color);
  });
  ipcMain.handle("orion:shell:reload-ignoring-cache", (event) => {
    requireShellIpcWindow(event).webContents.reloadIgnoringCache();
  });
  ipcMain.handle(
    "orion:shell:capture-page-region",
    async (event, value: unknown): Promise<DesktopCaptureRegionResult> => {
      const appWindow = requireShellIpcWindow(event);
      if (!isDesktopCaptureRegionRequest(value)) {
        throw new Error("Invalid Electron compositor capture rectangle.");
      }
      const contentBounds = appWindow.getContentBounds();
      const x = Math.min(value.x, Math.max(0, contentBounds.width - 1));
      const y = Math.min(value.y, Math.max(0, contentBounds.height - 1));
      const width = Math.min(value.width, contentBounds.width - x);
      const height = Math.min(value.height, contentBounds.height - y);
      if (width <= 0 || height <= 0) {
        throw new Error("Electron compositor capture rectangle is outside the window.");
      }
      const image = await appWindow.webContents.capturePage({ x, y, width, height });
      const size = image.getSize();
      return {
        data: image.toPNG().toString("base64"),
        width: size.width,
        height: size.height,
      };
    }
  );
  ipcMain.handle("orion:shell:get-managed-jupyter-base-url", (event): string | null => {
    requireShellIpcWindow(event);
    return session?.jupyter?.baseUrl ?? null;
  });
  ipcMain.handle("orion:shell:reveal-workspace-path", (event, value: unknown) =>
    handleWorkspacePathAction(event, value, "reveal")
  );
  ipcMain.handle("orion:shell:open-workspace-path", (event, value: unknown) =>
    handleWorkspacePathAction(event, value, "open")
  );
  ipcMain.handle(
    "orion:shell:show-project-folder-picker",
    async (event): Promise<NativeProjectFolderPickerResult | null> => {
      const parentWindow = requireShellIpcWindow(event);
      const activeSession = session;
      if (!activeSession?.jupyter) {
        throw new Error("Connect Orion's runtime before opening a project.");
      }

      const dialogOptions: Electron.OpenDialogOptions = {
        title: "Choose a project folder",
        defaultPath: activeSession.jupyterRootDirectory,
        properties: ["openDirectory", "createDirectory"],
      };
      const result = await dialog.showOpenDialog(parentWindow, dialogOptions);
      const selectedPath = result.filePaths[0];
      if (result.canceled || !selectedPath) return null;

      const projectPath = toJupyterRelativePath(
        activeSession.jupyterRootDirectory,
        selectedPath
      );
      if (projectPath === null) {
        throw new Error(
          "Choose a folder inside the active Jupyter root so Orion can open it."
        );
      }

      return {
        absolutePath: selectedPath,
        path: projectPath,
        name: basename(selectedPath),
      };
    }
  );
  ipcMain.handle("orion:shell:is-window-focused", (event): boolean => {
    const appWindow = getShellIpcWindow(event);
    if (!appWindow) {
      return false;
    }
    return appWindow.isFocused() && !appWindow.isMinimized();
  });
  ipcMain.handle(
    "orion:shell:set-agent-run-power-state",
    (event, value: unknown): void => {
      requireShellIpcWindow(event);
      if (!isAgentRunPowerState(value)) {
        throw new Error("Invalid agent run power state.");
      }
      agentRunPowerManager.setRendererState(event.sender.id, value);
    }
  );
  ipcMain.handle("orion:shell:show-notification", (event, value: unknown): boolean => {
    const appWindow = getShellIpcWindow(event);
    if (!isDesktopNotificationPayload(value) || !Notification.isSupported()) {
      return false;
    }

    const notification = new Notification({
      title: value.title.trim(),
      body: value.body.trim(),
      silent: true,
    });
    notification.on("click", () => {
      if (appWindow && !appWindow.isDestroyed()) {
        if (appWindow.isMinimized()) {
          appWindow.restore();
        }
        appWindow.show();
        appWindow.focus();
      }
    });
    notification.show();
    return true;
  });
}

/** Registers the narrow updater IPC surface exposed by the sandboxed preload. */
function setupUpdaterIpc(): void {
  ipcMain.handle("orion:update:get-state", (event) => {
    requireShellIpcWindow(event);
    return getDesktopUpdateState();
  });
  ipcMain.handle("orion:update:check", (event) => {
    requireShellIpcWindow(event);
    return checkForDesktopUpdates();
  });
  ipcMain.handle("orion:update:download", (event) => {
    requireShellIpcWindow(event);
    return downloadDesktopUpdate();
  });
  ipcMain.handle("orion:update:restart", (event) => {
    requireShellIpcWindow(event);
    return restartAndInstallDesktopUpdate();
  });
  subscribeToDesktopUpdates((nextState) => {
    for (const appWindow of appWindows) {
      if (!appWindow.isDestroyed()) {
        appWindow.webContents.send("orion:update:state", nextState);
      }
    }
  });
}

/** Reports a startup error through stderr and, for interactive launches, a native dialog. */
function reportStartupError(error: unknown, showDialog = true): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (!showDialog) {
    return;
  }
  dialog.showErrorBox(
    "Orion could not start",
    `${message}\n\nRun diagnostics from a terminal with: Orion --smoke`
  );
}

/** Boots desktop services, then opens the packaged Orion app. */
async function boot(): Promise<void> {
  const argvOptions = parseDesktopOptions(process.argv.slice(1));
  const devUrl = resolveDesktopDevUrl();

  if (argvOptions.smoke) {
    const report = await runDesktopSmoke({
      argvOptions,
      devUrl,
      resourceOptions: { resourcesPath: process.resourcesPath },
    });
    console.log(JSON.stringify(report, null, 2));
    app.quit();
    return;
  }

  session = await startDesktopSession({
    argvOptions,
    devUrl,
    resourceOptions: { resourcesPath: process.resourcesPath },
  });
  await createWindow(session.url);

  setupDesktopApplicationMenu({
    onCheckForUpdates: () => {
      getActiveAppWindow()?.webContents.send("orion:update:manual-check");
    },
    onNewWindow: () => {
      if (!session) {
        return;
      }
      void openDesktopAppWindow(session.url);
    },
    onOpenSettings: () => {
      getActiveAppWindow()?.webContents.send("orion:settings:open");
    },
    onReload: (options) => {
      getActiveAppWindow()?.webContents.send("orion:reload:requested", options);
    },
  });

  if (shouldCheckForDesktopUpdates()) {
    configureDesktopAutoUpdates();
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("ai.orion.notebook");
  }
  setupShellIpc();
  setupUpdaterIpc();
  void boot().catch((error) => {
    const smoke = parseDesktopOptions(process.argv.slice(1)).smoke;
    reportStartupError(error, !smoke);
    if (smoke) {
      app.exit(1);
    } else {
      app.quit();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  stopDesktopAutoUpdateSchedule();
  agentRunPowerManager.dispose();
  session?.dispose();
  session = null;
});
