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

/** Downloads or rebuilds the platform-native better-sqlite3 binary for the app bundle. */
export function rebuildBetterSqlite3(
  appDirectory: string,
  nodeExecutable = process.execPath
): void {
  const npm = resolveNpmExecutable(nodeExecutable);
  const result = spawnSync(
    npm,
    ["rebuild", BETTER_SQLITE3, "--prefix", appDirectory],
    {
      cwd: appDirectory,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to install a platform-native ${BETTER_SQLITE3} binary. ` +
        "Reinstall orion-notebook or ensure npm can rebuild native modules."
    );
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

  if (canLoadBetterSqlite3(appDirectory)) {
    return;
  }

  console.log("Installing platform-native dependencies for Orion...");
  rebuildBetterSqlite3(appDirectory, nodeExecutable);

  if (!canLoadBetterSqlite3(appDirectory)) {
    throw new Error(
      `${BETTER_SQLITE3} still failed to load after rebuilding native modules.`
    );
  }
}
