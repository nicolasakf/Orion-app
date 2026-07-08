import { app, Menu, type MenuItemConstructorOptions } from "electron";

interface DesktopApplicationMenuHandlers {
  onCheckForUpdates: () => void;
  onOpenSettings: () => void;
}

/** Builds and installs the desktop application menu with settings and update actions. */
export function setupDesktopApplicationMenu({
  onCheckForUpdates,
  onOpenSettings,
}: DesktopApplicationMenuHandlers): void {
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates...",
    click: onCheckForUpdates,
  };
  const openSettingsItem: MenuItemConstructorOptions = {
    label: "Settings...",
    accelerator: process.platform === "darwin" ? "Command+," : "Control+,",
    click: onOpenSettings,
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
      ]
      : [
        {
          label: "File",
          submenu: [
            openSettingsItem,
            checkForUpdatesItem,
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
