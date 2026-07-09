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

interface TestMenuItem {
  accelerator?: string;
  click?: () => void;
  label?: string;
  role?: string;
  submenu?: TestMenuItem[];
  type?: string;
}

function getLatestTemplate(): TestMenuItem[] {
  return buildFromTemplate.mock.calls.at(-1)?.[0] as TestMenuItem[];
}

function expectEditMenuRoles(template: TestMenuItem[]): void {
  const editMenu = template.find((item) => item.label === "Edit");
  const roles = editMenu?.submenu?.map((item) => item.role).filter(Boolean);

  expect(roles).toEqual(
    expect.arrayContaining([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "pasteAndMatchStyle",
      "delete",
      "selectAll",
    ]),
  );
}

describe("desktop application menu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    buildFromTemplate.mockClear();
    setApplicationMenu.mockClear();
  });

  it("adds Check for Updates under the Orion menu on macOS", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const onCheckForUpdates = vi.fn();
    const onOpenSettings = vi.fn();
    const onReload = vi.fn();
    setupDesktopApplicationMenu({ onCheckForUpdates, onOpenSettings, onReload });

    expect(setApplicationMenu).toHaveBeenCalledTimes(1);
    const template = getLatestTemplate();
    expect(template[0]?.label).toBe("Orion");
    const checkItem = template[0]?.submenu?.find((item) => item.label === "Check for Updates...");
    expect(checkItem).toBeDefined();
    checkItem?.click?.();
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
    const settingsItem = template[0]?.submenu?.find((item) => item.label === "Settings...");
    expect(settingsItem).toEqual(
      expect.objectContaining({ accelerator: "Command+," })
    );
    settingsItem?.click?.();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    const viewMenu = template.find((item) => item.label === "View");
    const reloadItem = viewMenu?.submenu?.find((item) => item.label === "Reload");
    expect(reloadItem).toEqual(
      expect.objectContaining({ accelerator: "Command+R" })
    );
    reloadItem?.click?.();
    expect(onReload).toHaveBeenCalledWith({ bypassCache: false });
    const forceReloadItem = viewMenu?.submenu?.find(
      (item) => item.label === "Force Reload"
    );
    expect(forceReloadItem).toEqual(
      expect.objectContaining({ accelerator: "Command+Shift+R" })
    );
    forceReloadItem?.click?.();
    expect(onReload).toHaveBeenLastCalledWith({ bypassCache: true });
    expect(template.find((item) => item.label === "File")?.submenu).toEqual([
      expect.objectContaining({ role: "close" }),
    ]);
    expectEditMenuRoles(template);
    expect(
      template
        .find((item) => item.label === "Edit")
        ?.submenu?.some((item) => item.label === "Speech"),
    ).toBe(true);
    expect(
      template
        .find((item) => item.label === "View")
        ?.submenu?.map((item) => item.role)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining(["resetZoom", "zoomIn", "zoomOut", "togglefullscreen"]),
    );
    expect(
      template
        .find((item) => item.label === "Window")
        ?.submenu?.map((item) => item.role)
        .filter(Boolean),
    ).toEqual(expect.arrayContaining(["minimize", "zoom", "front"]));
  });

  it("adds Settings and Check for Updates under File on Windows", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const onCheckForUpdates = vi.fn();
    const onOpenSettings = vi.fn();
    const onReload = vi.fn();
    setupDesktopApplicationMenu({ onCheckForUpdates, onOpenSettings, onReload });

    const template = getLatestTemplate();
    expect(template[0]?.label).toBe("File");
    expect(
      template[0]?.submenu?.some((item) => item.label === "Check for Updates...")
    ).toBe(true);
    const settingsItem = template[0]?.submenu?.find((item) => item.label === "Settings...");
    expect(settingsItem).toEqual(
      expect.objectContaining({ accelerator: "Control+," })
    );
    const viewMenu = template.find((item) => item.label === "View");
    const reloadItem = viewMenu?.submenu?.find((item) => item.label === "Reload");
    expect(reloadItem).toEqual(
      expect.objectContaining({ accelerator: "Control+R" })
    );
    const forceReloadItem = viewMenu?.submenu?.find(
      (item) => item.label === "Force Reload"
    );
    expect(forceReloadItem).toEqual(
      expect.objectContaining({ accelerator: "Control+Shift+R" })
    );
    expectEditMenuRoles(template);
    expect(
      template
        .find((item) => item.label === "Edit")
        ?.submenu?.some((item) => item.label === "Speech"),
    ).toBe(false);
    expect(
      template
        .find((item) => item.label === "View")
        ?.submenu?.map((item) => item.role)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining(["resetZoom", "zoomIn", "zoomOut", "togglefullscreen"]),
    );
    expect(
      template
        .find((item) => item.label === "Window")
        ?.submenu?.map((item) => item.role)
        .filter(Boolean),
    ).toEqual(expect.arrayContaining(["minimize", "close"]));
  });
});
