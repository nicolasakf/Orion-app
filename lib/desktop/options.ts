export interface DesktopOptions {
  appOnly: boolean;
  here: boolean;
  pickPython: boolean;
  smoke: boolean;
  useBundled: boolean;
}

/** Parses Orion desktop command-line flags. Unknown Electron/Chromium flags are ignored. */
export function parseDesktopOptions(argv: string[]): DesktopOptions {
  return {
    appOnly: argv.includes("--app-only"),
    here: argv.includes("--here"),
    pickPython: argv.includes("--pick-python"),
    smoke: argv.includes("--smoke"),
    useBundled: argv.includes("--use-bundled"),
  };
}

