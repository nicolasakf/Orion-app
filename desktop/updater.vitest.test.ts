import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: true },
  dialog: { showMessageBox: vi.fn() },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
}));

import { resolveDesktopUpdateChannel, shouldCheckForDesktopUpdates } from "./updater";

describe("desktop updater policy", () => {
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
});
