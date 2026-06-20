import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

const DEFAULT_UPDATE_URL = "https://github.com/nicolasakf/Orion-app/releases/latest/download";
export const UPDATE_CHECK_DELAY_MS = 4_000;
export const DAILY_UPDATE_CHECK_INTERVAL_MS = 86_400_000;

let configured = false;
let checkInFlight: Promise<unknown> | null = null;
let dailyInterval: NodeJS.Timeout | null = null;

/** Returns the per-platform update channel published by the desktop release workflow. */
export function resolveDesktopUpdateChannel(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  if (platform === "darwin") {
    return arch === "arm64" ? "latest-arm64" : "latest-x64";
  }
  if (platform === "win32") {
    return "latest-win-x64";
  }
  return "latest";
}

/** Returns whether update checks should run for this desktop process. */
export function shouldCheckForDesktopUpdates(
  packaged: boolean = app.isPackaged,
  env: Partial<NodeJS.ProcessEnv> = process.env
): boolean {
  return packaged && env.ORION_DESKTOP_DISABLE_UPDATES !== "1";
}

/** Checks GitHub release metadata for a newer Orion desktop build. */
export async function checkForDesktopUpdates(options: { manual?: boolean } = {}): Promise<void> {
  if (!shouldCheckForDesktopUpdates()) {
    return;
  }

  if (checkInFlight) {
    if (options.manual) {
      await dialog.showMessageBox({
        type: "info",
        title: "Checking for updates",
        message: "An update check is already in progress.",
        buttons: ["OK"],
      });
    }
    return;
  }

  try {
    checkInFlight = autoUpdater.checkForUpdates();
    const result = await checkInFlight;
    if (
      options.manual &&
      result &&
      typeof result === "object" &&
      "isUpdateAvailable" in result &&
      !(result as { isUpdateAvailable: boolean }).isUpdateAvailable
    ) {
      await dialog.showMessageBox({
        type: "info",
        title: "No updates",
        message: "You're up to date.",
        detail: `Orion ${app.getVersion()} is the latest version.`,
        buttons: ["OK"],
      });
    }
  } catch (error) {
    if (options.manual) {
      const message = error instanceof Error ? error.message : String(error);
      await dialog.showMessageBox({
        type: "error",
        title: "Update check failed",
        message: "Could not check for updates.",
        detail: message,
        buttons: ["OK"],
      });
    } else {
      console.warn("Orion desktop update check failed:", error);
    }
  } finally {
    checkInFlight = null;
  }
}

/** Stops the daily background update check schedule. */
export function stopDesktopAutoUpdateSchedule(): void {
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
}

/** Configures a quiet, user-confirmed update flow for packaged desktop builds. */
export function configureDesktopAutoUpdates(): void {
  if (!shouldCheckForDesktopUpdates() || configured) {
    return;
  }
  configured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: process.env.ORION_DESKTOP_UPDATE_URL ?? DEFAULT_UPDATE_URL,
    channel: resolveDesktopUpdateChannel(),
  });

  autoUpdater.on("error", (error) => {
    console.warn("Orion desktop update check failed:", error);
  });

  autoUpdater.on("update-available", (info) => {
    void dialog
      .showMessageBox({
        type: "info",
        title: "Orion update available",
        message: `Orion ${info.version} is available.`,
        detail: "Download it now and keep working. Orion will ask before restarting.",
        buttons: ["Download update", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          void autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox({
        type: "info",
        title: "Ready to update Orion",
        message: `Orion ${info.version} has been downloaded.`,
        detail: "Restart Orion when you are ready. Any running notebook servers will close during the restart.",
        buttons: ["Restart and update", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  setTimeout(() => {
    void checkForDesktopUpdates();
  }, UPDATE_CHECK_DELAY_MS);

  dailyInterval = setInterval(() => {
    void checkForDesktopUpdates();
  }, DAILY_UPDATE_CHECK_INTERVAL_MS);
}
