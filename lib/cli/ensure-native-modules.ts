import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";

const BETTER_SQLITE3 = "better-sqlite3";

/** Returns the bundled better-sqlite3 package directory inside an Orion app bundle. */
export function resolveBetterSqlite3Directory(appDirectory: string): string {
  return join(appDirectory, "node_modules", BETTER_SQLITE3);
}

/** Returns whether stderr indicates a cross-platform native module load failure. */
export function isNativeModuleLoadError(output: string): boolean {
  return (
    output.includes("ERR_DLOPEN_FAILED") ||
    output.includes("is not a valid Win32 application") ||
    output.includes("invalid ELF header") ||
    output.includes("not a valid Mach-O")
  );
}

/** Returns whether npm output indicates missing native build tooling. */
export function isBuildToolchainError(output: string): boolean {
  return (
    output.includes("node-gyp") ||
    output.includes("MSBuild") ||
    output.includes("Visual Studio") ||
    output.includes("Could not find any Visual Studio") ||
    output.includes("Python is not set") ||
    output.includes("gyp ERR!")
  );
}

/** Builds a PATH that includes the active Node binary and npm lifecycle script bins. */
export function buildNativeModuleEnv(
  nodeExecutable: string,
  appDirectory: string
): NodeJS.ProcessEnv {
  const nodeDirectory = dirname(nodeExecutable);
  const sqliteDirectory = resolveBetterSqlite3Directory(appDirectory);
  const pathEntries = [
    nodeDirectory,
    join(appDirectory, "node_modules", ".bin"),
    join(sqliteDirectory, "node_modules", ".bin"),
  ];
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const existingPath = process.env.PATH ?? process.env.Path ?? "";
  const nextPath = [...pathEntries, existingPath].join(pathSeparator);

  return {
    ...process.env,
    PATH: nextPath,
    ...(process.platform === "win32" ? { Path: nextPath } : {}),
  };
}

/** Returns whether the bundled better-sqlite3 native binding loads on this machine. */
export function canLoadBetterSqlite3(appDirectory: string): boolean {
  const modulePath = resolveBetterSqlite3Directory(appDirectory);
  if (!existsSync(modulePath)) {
    return true;
  }

  const probeScript = [
    `const Database = require(${JSON.stringify(modulePath)});`,
    "const db = new Database(':memory:');",
    "db.exec('SELECT 1');",
  ].join("\n");

  const result = spawnSync(process.execPath, ["-e", probeScript], {
    encoding: "utf8",
    timeout: 30_000,
  });

  if (result.status === 0) {
    return true;
  }

  const output = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  if (isNativeModuleLoadError(output)) {
    return false;
  }

  throw new Error(
    `Unexpected error while checking ${BETTER_SQLITE3}: ${output.trim() || "unknown error"}`
  );
}

/** Resolves an npm executable from PATH or next to the active Node binary. */
export function resolveNpmExecutable(nodeExecutable = process.execPath): string {
  const binDirectory = dirname(nodeExecutable);
  if (process.platform === "win32") {
    const npmCmd = join(binDirectory, "npm.cmd");
    if (existsSync(npmCmd)) {
      return npmCmd;
    }
  } else {
    const npm = join(binDirectory, "npm");
    if (existsSync(npm)) {
      return npm;
    }
  }

  return "npm";
}

/** Resolves a prebuild-install entry point for better-sqlite3 when present. */
export function resolvePrebuildInstallScript(appDirectory: string): string | null {
  const sqliteDirectory = resolveBetterSqlite3Directory(appDirectory);
  const candidates = [
    join(sqliteDirectory, "node_modules", "prebuild-install", "bin.js"),
    join(appDirectory, "node_modules", "prebuild-install", "bin.js"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Downloads a platform prebuilt better-sqlite3 binary when one is published. */
export function downloadBetterSqlite3Prebuild(
  appDirectory: string,
  nodeExecutable = process.execPath
): boolean {
  const prebuildScript = resolvePrebuildInstallScript(appDirectory);
  if (!prebuildScript) {
    return false;
  }

  const env = buildNativeModuleEnv(nodeExecutable, appDirectory);
  const result = spawnSync(
    nodeExecutable,
    [prebuildScript],
    {
      cwd: resolveBetterSqlite3Directory(appDirectory),
      stdio: "pipe",
      encoding: "utf8",
      shell: false,
      env,
    }
  );

  return result.status === 0;
}

/** Downloads or rebuilds the platform-native better-sqlite3 binary for the app bundle. */
export function rebuildBetterSqlite3(
  appDirectory: string,
  nodeExecutable = process.execPath
): void {
  const env = buildNativeModuleEnv(nodeExecutable, appDirectory);

  if (downloadBetterSqlite3Prebuild(appDirectory, nodeExecutable)) {
    if (canLoadBetterSqlite3(appDirectory)) {
      return;
    }
  }

  const npm = resolveNpmExecutable(nodeExecutable);
  const result = spawnSync(
    npm,
    ["rebuild", BETTER_SQLITE3, "--prefix", appDirectory],
    {
      cwd: appDirectory,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
    }
  );

  if (result.status === 0) {
    return;
  }

  const output = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  if (isBuildToolchainError(output)) {
    throw new Error(
      `Failed to install a platform-native ${BETTER_SQLITE3} binary because native build tools are missing. ` +
        "Orion will continue without durable chat history. " +
        "Install Node.js 20+ globally, upgrade orion-notebook, or report the issue at " +
        "https://github.com/nicolasakf/Orion-app/issues"
    );
  }

  throw new Error(
    `Failed to install a platform-native ${BETTER_SQLITE3} binary. ` +
      "Reinstall orion-notebook or ensure npm can rebuild native modules."
  );
}

/** Returns whether Node's built-in node:sqlite module is available in this runtime. */
export function isNodeSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures bundled native modules match the host platform before starting Orion.
 * No-op when the app bundle or better-sqlite3 is absent (for example during repo dev installs).
 */
export function ensureBundledNativeModules(
  appDirectory: string,
  nodeExecutable = process.execPath
): void {
  if (!existsSync(join(appDirectory, "server.js"))) {
    return;
  }

  if (!existsSync(resolveBetterSqlite3Directory(appDirectory))) {
    return;
  }

  if (isNodeSqliteAvailable()) {
    return;
  }

  if (canLoadBetterSqlite3(appDirectory)) {
    return;
  }

  console.log("Installing platform-native dependencies for Orion...");
  try {
    rebuildBetterSqlite3(appDirectory, nodeExecutable);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`warning: ${message}`);
    process.env.ORION_CHAT_STORAGE_DEGRADED = "1";
    return;
  }

  if (!canLoadBetterSqlite3(appDirectory)) {
    console.warn(
      `warning: ${BETTER_SQLITE3} still failed to load after rebuilding native modules. ` +
        "Orion will continue without durable chat history."
    );
    process.env.ORION_CHAT_STORAGE_DEGRADED = "1";
  }
}
