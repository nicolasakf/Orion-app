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

interface OrionDesktopShellBridge {
  setWindowBackgroundColor: (color: string) => Promise<void>;
  showProjectFolderPicker: () => Promise<
    OrionDesktopProjectFolderPickerResult | null
  >;
  onOpenSettings: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    orionDesktopUpdater?: OrionDesktopUpdaterBridge;
    orionDesktopShell?: OrionDesktopShellBridge;
  }
}

export {};
