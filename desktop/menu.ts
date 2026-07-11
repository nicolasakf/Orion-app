import { app, Menu, type MenuItemConstructorOptions } from "electron";

interface DesktopApplicationMenuHandlers {
  onCheckForUpdates: () => void;
  onNewWindow: () => void;
  onOpenSettings: () => void;
  onReload: (options?: { bypassCache?: boolean }) => void;
}

/** Returns the platform accelerator for opening another Orion window. */
function getNewWindowAccelerator(): string {
  return process.platform === "darwin" ? "Command+Shift+N" : "Control+Shift+N";
}

/** Builds the native Edit menu so standard text shortcuts keep working. */
function buildEditMenu(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "pasteAndMatchStyle" },
    { role: "delete" },
    { role: "selectAll" },
  ];

  if (process.platform === "darwin") {
    submenu.push(
      { type: "separator" },
      {
        label: "Speech",
        submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
      },
    );
  }

  return { label: "Edit", submenu };
}

/** Builds the View menu with Orion's reload confirmation plus standard view commands. */
function buildViewMenu({
  onReload,
}: Pick<DesktopApplicationMenuHandlers, "onReload">): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      {
        label: "Reload",
        accelerator: process.platform === "darwin" ? "Command+R" : "Control+R",
        click: () => onReload({ bypassCache: false }),
      },
      {
        label: "Force Reload",
        accelerator:
          process.platform === "darwin" ? "Command+Shift+R" : "Control+Shift+R",
        click: () => onReload({ bypassCache: true }),
      },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };
}

/** Builds the native Window menu so platform window shortcuts remain available. */
function buildWindowMenu(): MenuItemConstructorOptions {
  return process.platform === "darwin"
    ? {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    }
    : {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    };
}

/** Builds and installs the desktop application menu with settings and update actions. */
export function setupDesktopApplicationMenu({
  onCheckForUpdates,
  onNewWindow,
  onOpenSettings,
  onReload,
}: DesktopApplicationMenuHandlers): void {
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates...",
    click: onCheckForUpdates,
  };
  const newWindowItem: MenuItemConstructorOptions = {
    label: "New Window",
    accelerator: getNewWindowAccelerator(),
    click: onNewWindow,
  };
  const openSettingsItem: MenuItemConstructorOptions = {
    label: "Settings...",
    accelerator: process.platform === "darwin" ? "Command+," : "Control+,",
    click: onOpenSettings,
  };
  const editMenu = buildEditMenu();
  const viewMenu = buildViewMenu({ onReload });
  const windowMenu = buildWindowMenu();

  const template: MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            checkForUpdatesItem,
            openSettingsItem,
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "File",
          submenu: [
            newWindowItem,
            { type: "separator" },
            { role: "close" },
          ],
        },
        editMenu,
        viewMenu,
        windowMenu,
      ]
      : [
        {
          label: "File",
          submenu: [
            newWindowItem,
            { type: "separator" },
            openSettingsItem,
            checkForUpdatesItem,
            { type: "separator" },
            { role: "quit" },
          ],
        },
        editMenu,
        viewMenu,
        windowMenu,
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
