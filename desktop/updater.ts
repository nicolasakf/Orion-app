import { app } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

import type { OrionUpdateState } from "../lib/update/types";

const DEFAULT_UPDATE_URL = "https://github.com/nicolasakf/Orion-app/releases/latest/download";
export const UPDATE_CHECK_DELAY_MS = 4_000;
export const DAILY_UPDATE_CHECK_INTERVAL_MS = 86_400_000;

let configured = false;
let checkInFlight: Promise<unknown> | null = null;
let dailyInterval: NodeJS.Timeout | null = null;
let state: OrionUpdateState = {
  supported: false,
  source: "desktop",
  currentVersion: app.getVersion(),
  status: "unsupported",
};
const listeners = new Set<(nextState: OrionUpdateState) => void>();

/** Publishes immutable updater state to Electron IPC consumers. */
function setState(patch: Partial<OrionUpdateState>): OrionUpdateState {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
  return state;
}

/** Returns the current desktop updater state. */
export function getDesktopUpdateState(): OrionUpdateState {
  return state;
}

/** Subscribes to desktop update state changes. */
export function subscribeToDesktopUpdates(
  listener: (nextState: OrionUpdateState) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns the per-platform update channel published by the desktop release workflow. */
export function resolveDesktopUpdateChannel(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  if (platform === "darwin") return arch === "arm64" ? "latest-arm64" : "latest-x64";
  if (platform === "win32") return "latest-win-x64";
  return "latest";
}

/** Returns whether update checks should run for this desktop process. */
export function shouldCheckForDesktopUpdates(
  packaged: boolean = app.isPackaged,
  env: Partial<NodeJS.ProcessEnv> = process.env
): boolean {
  return packaged && env.ORION_DESKTOP_DISABLE_UPDATES !== "1";
}

/** Checks release metadata and returns the resulting updater state. */
export async function checkForDesktopUpdates(): Promise<OrionUpdateState> {
  if (!shouldCheckForDesktopUpdates()) return getDesktopUpdateState();
  if (checkInFlight) return checkInFlight.then(() => getDesktopUpdateState());

  setState({ status: "checking", error: undefined });
  try {
    checkInFlight = autoUpdater.checkForUpdates();
    const result = await checkInFlight;
    if (
      result &&
      typeof result === "object" &&
      "isUpdateAvailable" in result &&
      !(result as { isUpdateAvailable: boolean }).isUpdateAvailable
    ) {
      setState({ status: "current", latestVersion: app.getVersion() });
    }
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    checkInFlight = null;
  }
  return getDesktopUpdateState();
}

/** Downloads an available signed desktop update. */
export async function downloadDesktopUpdate(): Promise<OrionUpdateState> {
  if (state.status !== "available") return state;
  setState({ status: "downloading", progress: 0, error: undefined });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
  return state;
}

/** Restarts Orion and installs a previously downloaded update. */
export function restartAndInstallDesktopUpdate(): void {
  if (state.status === "downloaded") autoUpdater.quitAndInstall(false, true);
}

/** Stops the daily background update check schedule. */
export function stopDesktopAutoUpdateSchedule(): void {
  if (dailyInterval) clearInterval(dailyInterval);
  dailyInterval = null;
}

/** Configures quiet desktop updates driven entirely by Orion's in-app UI. */
export function configureDesktopAutoUpdates(): void {
  if (!shouldCheckForDesktopUpdates() || configured) return;
  configured = true;
  setState({ supported: true, status: "idle" });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: process.env.ORION_DESKTOP_UPDATE_URL ?? DEFAULT_UPDATE_URL,
    channel: resolveDesktopUpdateChannel(),
  });
  autoUpdater.on("error", (error: Error) => {
    setState({ status: "error", error: error.message });
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    setState({ status: "available", latestVersion: info.version, progress: undefined });
  });
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setState({ status: "downloading", progress: Math.max(0, Math.min(100, progress.percent)) });
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    setState({ status: "downloaded", latestVersion: info.version, progress: 100 });
  });

  setTimeout(() => void checkForDesktopUpdates(), UPDATE_CHECK_DELAY_MS);
  dailyInterval = setInterval(() => void checkForDesktopUpdates(), DAILY_UPDATE_CHECK_INTERVAL_MS);
}
