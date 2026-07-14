import { contextBridge, ipcRenderer } from "electron";

import type { OrionUpdateState } from "../lib/update/types";

contextBridge.exposeInMainWorld("orionDesktopUpdater", {
  getState: (): Promise<OrionUpdateState> => ipcRenderer.invoke("orion:update:get-state"),
  check: (): Promise<OrionUpdateState> => ipcRenderer.invoke("orion:update:check"),
  download: (): Promise<OrionUpdateState> => ipcRenderer.invoke("orion:update:download"),
  restartAndInstall: (): Promise<OrionUpdateState> => ipcRenderer.invoke("orion:update:restart"),
  onStateChange: (listener: (state: OrionUpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: OrionUpdateState) => listener(state);
    ipcRenderer.on("orion:update:state", handler);
    return () => ipcRenderer.removeListener("orion:update:state", handler);
  },
  onManualCheck: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("orion:update:manual-check", handler);
    return () => ipcRenderer.removeListener("orion:update:manual-check", handler);
  },
});

contextBridge.exposeInMainWorld("orionDesktopShell", {
  setWindowBackgroundColor: (color: string): Promise<void> =>
    ipcRenderer.invoke("orion:shell:set-background-color", color),
  showProjectFolderPicker: () =>
    ipcRenderer.invoke("orion:shell:show-project-folder-picker"),
  getManagedJupyterBaseUrl: (): Promise<string | null> =>
    ipcRenderer.invoke("orion:shell:get-managed-jupyter-base-url"),
  revealWorkspacePath: (request: { path: string; jupyterBaseUrl: string }): Promise<void> =>
    ipcRenderer.invoke("orion:shell:reveal-workspace-path", request),
  openWorkspacePath: (request: { path: string; jupyterBaseUrl: string }): Promise<void> =>
    ipcRenderer.invoke("orion:shell:open-workspace-path", request),
  reloadIgnoringCache: (): Promise<void> =>
    ipcRenderer.invoke("orion:shell:reload-ignoring-cache"),
  onOpenSettings: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("orion:settings:open", handler);
    return () => ipcRenderer.removeListener("orion:settings:open", handler);
  },
  onReloadRequested: (listener: (options?: { bypassCache?: boolean }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      options?: { bypassCache?: boolean }
    ) => listener(options);
    ipcRenderer.on("orion:reload:requested", handler);
    return () => ipcRenderer.removeListener("orion:reload:requested", handler);
  },
});
