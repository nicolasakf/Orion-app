import { app, Menu, type MenuItemConstructorOptions } from "electron";

/** Builds and installs the desktop application menu with a manual update check action. */
export function setupDesktopApplicationMenu(onCheckForUpdates: () => void): void {
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates...",
    click: onCheckForUpdates,
  };

  const template: MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              checkForUpdatesItem,
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
        ]
      : [
          {
            label: "File",
            submenu: [checkForUpdatesItem, { type: "separator" }, { role: "quit" }],
          },
        ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
