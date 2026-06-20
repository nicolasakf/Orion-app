import { afterEach, describe, expect, it, vi } from "vitest";

const { buildFromTemplate, setApplicationMenu } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { name: "Orion" },
  Menu: {
    buildFromTemplate,
    setApplicationMenu,
  },
}));

import { setupDesktopApplicationMenu } from "./menu";

describe("desktop application menu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    buildFromTemplate.mockClear();
    setApplicationMenu.mockClear();
  });

  it("adds Check for Updates under the Orion menu on macOS", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const onCheckForUpdates = vi.fn();
    setupDesktopApplicationMenu(onCheckForUpdates);

    expect(setApplicationMenu).toHaveBeenCalledTimes(1);
    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<{
      label: string;
      submenu?: Array<{ label?: string; click?: () => void }>;
    }>;
    expect(template[0]?.label).toBe("Orion");
    const checkItem = template[0]?.submenu?.find((item) => item.label === "Check for Updates...");
    expect(checkItem).toBeDefined();
    checkItem?.click?.();
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it("adds Check for Updates under File on Windows", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const onCheckForUpdates = vi.fn();
    setupDesktopApplicationMenu(onCheckForUpdates);

    const template = buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{
      label: string;
      submenu?: Array<{ label?: string; click?: () => void }>;
    }>;
    expect(template[0]?.label).toBe("File");
    expect(
      template[0]?.submenu?.some((item) => item.label === "Check for Updates...")
    ).toBe(true);
  });
});
