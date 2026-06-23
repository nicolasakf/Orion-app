import type { OrionUpdateState } from "@/lib/update/types";

interface OrionDesktopUpdaterBridge {
  getState: () => Promise<OrionUpdateState>;
  check: () => Promise<OrionUpdateState>;
  download: () => Promise<OrionUpdateState>;
  restartAndInstall: () => Promise<OrionUpdateState>;
  onStateChange: (listener: (state: OrionUpdateState) => void) => () => void;
  onManualCheck: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    orionDesktopUpdater?: OrionDesktopUpdaterBridge;
  }
}

export {};
