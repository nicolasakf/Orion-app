import { app, BrowserWindow, dialog } from "electron";

import { parseDesktopOptions } from "../lib/desktop/options";
import { runDesktopSmoke, startDesktopSession, type DesktopSession } from "../lib/desktop/launcher";
import { configureDesktopAutoUpdates } from "./updater";

let session: DesktopSession | null = null;
let mainWindow: BrowserWindow | null = null;

/** Returns the dev server URL for local `npx electron .` runs, or an explicit packaged override. */
function resolveDesktopDevUrl(): string | undefined {
  if (process.env.ORION_DESKTOP_DEV_URL) {
    return process.env.ORION_DESKTOP_DEV_URL;
  }
  return app.isPackaged ? undefined : "http://127.0.0.1:3001";
}

/** Creates Orion's main desktop browser window. */
async function createWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    title: "Orion",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await mainWindow.loadURL(url);
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
  configureDesktopAutoUpdates();
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
  void boot().catch((error) => {
    reportStartupError(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  session?.dispose();
  session = null;
});
