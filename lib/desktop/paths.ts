import { existsSync } from "fs";
import path from "path";

export interface DesktopResourcePathOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  platform?: NodeJS.Platform;
  resourcesPath?: string;
}

export interface DesktopRuntimePaths {
  resourcesDirectory: string;
  appDirectory: string;
  nodeExecutable: string;
  pythonExecutable: string;
}

export interface DesktopRuntimePresenceOptions {
  requirePython?: boolean;
}

/** Returns the path module for the packaged app's target platform. */
function getPathModule(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Returns whether a path-like value names an absolute executable path. */
function isAbsoluteExecutablePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

/** Returns the default Electron resources directory, with dev/test override support. */
export function resolveDesktopResourcesDirectory(
  options: DesktopResourcePathOptions = {}
): string {
  const env = options.env ?? process.env;
  if (env.ORION_DESKTOP_RESOURCES_DIR) {
    return env.ORION_DESKTOP_RESOURCES_DIR;
  }
  if (options.resourcesPath) {
    return options.resourcesPath;
  }
  return path.resolve(process.cwd(), "dist", "desktop-resources");
}

/** Resolves the bundled Orion app directory copied as an Electron extraResource. */
export function resolveDesktopAppDirectory(
  options: DesktopResourcePathOptions = {}
): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  return (
    env.ORION_APP_DIR ??
    getPathModule(platform).join(resolveDesktopResourcesDirectory(options), "orion-app")
  );
}

/** Resolves the bundled Node executable copied as an Electron extraResource. */
export function resolveDesktopNodeExecutable(
  options: DesktopResourcePathOptions = {}
): string {
  const env = options.env ?? process.env;
  if (env.ORION_DESKTOP_NODE) {
    return env.ORION_DESKTOP_NODE;
  }
  if (env.npm_node_execpath) {
    return env.npm_node_execpath;
  }
  if (env.NODE) {
    return env.NODE;
  }

  const resources = resolveDesktopResourcesDirectory(options);
  const platform = options.platform ?? process.platform;
  const pathModule = getPathModule(platform);
  return platform === "win32"
    ? pathModule.join(resources, "runtime", "node", "node.exe")
    : pathModule.join(resources, "runtime", "node", "bin", "node");
}

/** Resolves the bundled Python executable copied as an Electron extraResource. */
export function resolveDesktopPythonExecutable(
  options: DesktopResourcePathOptions = {}
): string {
  const env = options.env ?? process.env;
  if (env.ORION_DESKTOP_PYTHON) {
    return env.ORION_DESKTOP_PYTHON;
  }

  const resources = resolveDesktopResourcesDirectory(options);
  const platform = options.platform ?? process.platform;
  const pathModule = getPathModule(platform);
  if (platform === "win32") {
    return pathModule.join(resources, "runtime", "python", "python.exe");
  }

  const python3 = pathModule.join(resources, "runtime", "python", "bin", "python3");
  if (existsSync(python3)) {
    return python3;
  }

  const python313 = pathModule.join(resources, "runtime", "python", "bin", "python3.13");
  return existsSync(python313) ? python313 : python3;
}

/** Resolves all desktop runtime paths from Electron's resources directory. */
export function resolveDesktopRuntimePaths(
  options: DesktopResourcePathOptions = {}
): DesktopRuntimePaths {
  const resourcesDirectory = resolveDesktopResourcesDirectory(options);
  return {
    resourcesDirectory,
    appDirectory: resolveDesktopAppDirectory(options),
    nodeExecutable: resolveDesktopNodeExecutable(options),
    pythonExecutable: resolveDesktopPythonExecutable(options),
  };
}

/** Throws an actionable error when packaged desktop resources are incomplete. */
export function assertDesktopRuntimePresent(
  paths: DesktopRuntimePaths,
  options: DesktopRuntimePresenceOptions = {}
): void {
  const checks = [
    [path.join(paths.appDirectory, "server.js"), "Orion app bundle"],
    [paths.nodeExecutable, "bundled Node.js"],
  ];
  if (options.requirePython !== false) {
    checks.push([paths.pythonExecutable, "bundled Python"]);
  }

  const missing = checks.filter(([filePath]) => {
    if (!isAbsoluteExecutablePath(filePath) && !filePath.includes(path.sep)) {
      return false;
    }
    return !existsSync(filePath);
  });

  if (missing.length === 0) {
    return;
  }

  const details = missing.map(([filePath, label]) => `${label}: ${filePath}`).join("\n");
  throw new Error(
    `Orion desktop runtime is incomplete.\n\nMissing:\n${details}\n\nRun diagnostics with Orion --smoke or rebuild the desktop package.`
  );
}
