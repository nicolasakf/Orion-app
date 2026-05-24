import os from "os";
import path from "path";

export interface RuntimePathOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  homedir?: string;
  platform?: NodeJS.Platform;
}

/** Returns the correct path module for a target platform. */
function getPathModule(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

/**
 * Resolves Orion's home directory using the cross-platform `~/.orion` contract.
 * On Windows this intentionally uses USERPROFILE rather than LOCALAPPDATA.
 */
export function resolveOrionHomeDirectory(
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const pathModule = getPathModule(platform);

  if (env.ORION_HOME_DIR) {
    return env.ORION_HOME_DIR;
  }

  const home =
    platform === "win32"
      ? env.USERPROFILE || options.homedir || os.homedir()
      : options.homedir || os.homedir();

  return pathModule.join(home, ".orion");
}

/** Resolves Orion's managed runtime directory. */
export function resolveOrionRuntimeDirectory(
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  return getPathModule(platform).join(resolveOrionHomeDirectory(options), "runtime");
}

/** Resolves Orion's managed app cache directory for a package version. */
export function resolveCachedAppDirectory(
  version: string,
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  return getPathModule(platform).join(
    resolveOrionHomeDirectory(options),
    "app",
    version
  );
}

/** Resolves the CLI handoff file consumed by the Orion app. */
export function resolveJupyterConnectionFilePath(
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  return getPathModule(platform).join(
    resolveOrionRuntimeDirectory(options),
    "jupyter-connection.json"
  );
}

/** Resolves the saved Python preference file for the Orion CLI. */
export function resolvePythonPreferenceFilePath(
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  return getPathModule(platform).join(
    resolveOrionRuntimeDirectory(options),
    "python-preference.json"
  );
}

/** Resolves Orion's managed Python virtual environment directory. */
export function resolveManagedVenvDirectory(
  options: RuntimePathOptions = {}
): string {
  const platform = options.platform ?? process.platform;
  return getPathModule(platform).join(resolveOrionRuntimeDirectory(options), "venv");
}

/** Resolves the Python executable inside Orion's managed virtual environment. */
export function resolveManagedVenvPythonPath(
  venvDirectory: string,
  platform: NodeJS.Platform = process.platform
): string {
  const pathModule = getPathModule(platform);
  return platform === "win32"
    ? pathModule.join(venvDirectory, "Scripts", "python.exe")
    : pathModule.join(venvDirectory, "bin", "python");
}
