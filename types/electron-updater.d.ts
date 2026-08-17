import type { OrionUpdateState } from "@/lib/update/types";

interface OrionDesktopUpdaterBridge {
  getState: () => Promise<OrionUpdateState>;
  check: () => Promise<OrionUpdateState>;
  download: () => Promise<OrionUpdateState>;
  restartAndInstall: () => Promise<OrionUpdateState>;
  onStateChange: (listener: (state: OrionUpdateState) => void) => () => void;
  onManualCheck: (listener: () => void) => () => void;
}

interface OrionDesktopProjectFolderPickerResult {
  absolutePath: string;
  path: string;
  name: string;
}

interface OrionDesktopWorkspacePathRequest {
  path: string;
  jupyterBaseUrl: string;
}

interface OrionDesktopShellBridge {
  setWindowBackgroundColor: (color: string) => Promise<void>;
  showProjectFolderPicker: () => Promise<
    OrionDesktopProjectFolderPickerResult | null
  >;
  getManagedJupyterBaseUrl: () => Promise<string | null>;
  revealWorkspacePath: (request: OrionDesktopWorkspacePathRequest) => Promise<void>;
  openWorkspacePath: (request: OrionDesktopWorkspacePathRequest) => Promise<void>;
  reloadIgnoringCache: () => Promise<void>;
  onOpenSettings: (listener: () => void) => () => void;
  onReloadRequested: (
    listener: (options?: { bypassCache?: boolean }) => void
  ) => () => void;
  isWindowFocused: () => Promise<boolean>;
  showNotification: (request: { title: string; body: string }) => Promise<boolean>;
}

declare global {
  interface Window {
    orionDesktopUpdater?: OrionDesktopUpdaterBridge;
    orionDesktopShell?: OrionDesktopShellBridge;
  }
}

export {};
