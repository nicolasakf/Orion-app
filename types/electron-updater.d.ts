import type { OrionUpdateState } from "@/lib/update/types";

interface OrionDesktopUpdaterBridge {
  getState: () => Promise<OrionUpdateState>;
  check: () => Promise<OrionUpdateState>;
  download: () => Promise<OrionUpdateState>;
  restartAndInstall: () => Promise<OrionUpdateState>;
  onStateChange: (listener: (state: OrionUpdateState) => void) => () => void;
  onManualCheck: (listener: () => void) => () => void;
}

interface OrionDesktopShellBridge {
  setWindowBackgroundColor: (color: string) => Promise<void>;
}

declare global {
  interface Window {
    orionDesktopUpdater?: OrionDesktopUpdaterBridge;
    orionDesktopShell?: OrionDesktopShellBridge;
  }
}

export {};
