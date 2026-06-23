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
