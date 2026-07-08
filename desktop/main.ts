import { basename, isAbsolute, join, relative, resolve, sep } from "path";

import { app, BrowserWindow, dialog, ipcMain } from "electron";

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

/** Creates Orion's main desktop browser window. */
async function createWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
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
  });

  await mainWindow.loadURL(url);
}

/** Registers shell appearance controls exposed by the sandboxed preload. */
function setupShellIpc(): void {
  ipcMain.handle("orion:shell:set-background-color", (_event, color: unknown) => {
    if (!isHexWindowBackgroundColor(color)) {
      throw new Error("Invalid Electron window background color.");
    }
    mainWindow?.setBackgroundColor(color);
  });
  ipcMain.handle(
    "orion:shell:show-project-folder-picker",
    async (): Promise<NativeProjectFolderPickerResult | null> => {
      const activeSession = session;
      if (!activeSession?.jupyter) {
        throw new Error("Connect Orion's runtime before opening a project.");
      }

      const dialogOptions: Electron.OpenDialogOptions = {
        title: "Choose a project folder",
        defaultPath: activeSession.jupyterRootDirectory,
        properties: ["openDirectory"],
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
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
  ipcMain.handle("orion:update:get-state", () => getDesktopUpdateState());
  ipcMain.handle("orion:update:check", () => checkForDesktopUpdates());
  ipcMain.handle("orion:update:download", () => downloadDesktopUpdate());
  ipcMain.handle("orion:update:restart", () => restartAndInstallDesktopUpdate());
  subscribeToDesktopUpdates((nextState) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("orion:update:state", nextState);
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
      mainWindow?.webContents.send("orion:update:manual-check");
    },
    onOpenSettings: () => {
      mainWindow?.webContents.send("orion:settings:open");
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
