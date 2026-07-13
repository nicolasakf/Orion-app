import { basename, isAbsolute, join, relative, resolve, sep } from "path";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { parseDesktopOptions } from "../lib/desktop/options";
import { runDesktopSmoke, startDesktopSession, type DesktopSession } from "../lib/desktop/launcher";
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

interface NativeProjectFolderPickerResult {
  absolutePath: string;
  path: string;
  name: string;
}

/** Returns true for the six-digit hex colors Orion sends from the renderer. */
function isHexWindowBackgroundColor(color: unknown): color is string {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Returns the dev server URL for local `npx electron .` runs, or an explicit packaged override. */
function resolveDesktopDevUrl(): string | undefined {
  if (process.env.ORION_DESKTOP_DEV_URL) {
    return process.env.ORION_DESKTOP_DEV_URL;
  }
  return app.isPackaged ? undefined : "http://127.0.0.1:3001";
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
  appWindow.on("closed", () => {
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

/** Routes renderer-initiated window opens to matching Electron window chrome. */
function setupWindowOpenHandler(window: BrowserWindow, appBaseUrl: string): void {
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

/** Reports a startup error through both stderr and a native desktop dialog. */
function reportStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
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
  setupShellIpc();
  setupUpdaterIpc();
  void boot().catch((error) => {
    reportStartupError(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  stopDesktopAutoUpdateSchedule();
  session?.dispose();
  session = null;
});
