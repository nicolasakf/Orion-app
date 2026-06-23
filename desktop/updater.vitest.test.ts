import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoUpdaterMock, checkForUpdates, updateHandlers } = vi.hoisted(() => {
  type UpdateHandler = (...args: unknown[]) => void;
  const updateHandlers = new Map<string, UpdateHandler>();
  const checkForUpdates = vi.fn();
  const autoUpdaterMock = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    setFeedURL: vi.fn(),
    checkForUpdates,
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, handler: UpdateHandler) => {
      updateHandlers.set(event, handler);
    }),
  };

  return { autoUpdaterMock, checkForUpdates, updateHandlers };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getVersion: () => "0.10.1",
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

import {
  checkForDesktopUpdates,
  configureDesktopAutoUpdates,
  DAILY_UPDATE_CHECK_INTERVAL_MS,
  restartAndInstallDesktopUpdate,
  resolveDesktopUpdateChannel,
  shouldCheckForDesktopUpdates,
  stopDesktopAutoUpdateSchedule,
} from "./updater";

describe("desktop updater policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    autoUpdaterMock.autoDownload = true;
    autoUpdaterMock.autoInstallOnAppQuit = false;
    autoUpdaterMock.quitAndInstall.mockClear();
    updateHandlers.clear();
    checkForUpdates.mockReset();
    checkForUpdates.mockResolvedValue({ isUpdateAvailable: false });
  });

  afterEach(() => {
    stopDesktopAutoUpdateSchedule();
    vi.useRealTimers();
  });

  it("uses separate macOS channels for Apple Silicon and Intel builds", () => {
    expect(resolveDesktopUpdateChannel("darwin", "arm64")).toBe("latest-arm64");
    expect(resolveDesktopUpdateChannel("darwin", "x64")).toBe("latest-x64");
  });

  it("uses the signed Windows x64 update channel", () => {
    expect(resolveDesktopUpdateChannel("win32", "x64")).toBe("latest-win-x64");
  });

  it("only checks for updates in packaged builds unless disabled", () => {
    expect(shouldCheckForDesktopUpdates(true, {})).toBe(true);
    expect(shouldCheckForDesktopUpdates(false, {})).toBe(false);
    expect(shouldCheckForDesktopUpdates(true, { ORION_DESKTOP_DISABLE_UPDATES: "1" })).toBe(false);
  });

  it("checks once on startup and again every 24 hours", async () => {
    configureDesktopAutoUpdates();
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true);
    expect(checkForUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DAILY_UPDATE_CHECK_INTERVAL_MS);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    updateHandlers.get("update-downloaded")?.({ version: "0.11.0" });
    expect(restartAndInstallDesktopUpdate()).toEqual(
      expect.objectContaining({ status: "installing", latestVersion: "0.11.0" })
    );
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("publishes an up-to-date state when no update exists", async () => {
    const state = await checkForDesktopUpdates();
    expect(state).toEqual(expect.objectContaining({ status: "current", latestVersion: "0.10.1" }));
  });

  it("publishes an error state when a check fails", async () => {
    checkForUpdates.mockRejectedValueOnce(new Error("network offline"));
    const state = await checkForDesktopUpdates();
    expect(state).toEqual(expect.objectContaining({ status: "error", error: "network offline" }));
  });
});
