import { spawn, spawnSync } from "child_process";

export const ORION_PACKAGE_NAME = "orion-notebook";

export type InstallChannel = "npm" | "pip" | "uv";

export interface PackageUninstallResult {
  removed: InstallChannel[];
  deferred: InstallChannel[];
  notInstalled: InstallChannel[];
  errors: Array<{ channel: InstallChannel; message: string }>;
}

/** Resolves a command path using the host platform's lookup tool. */
function resolveCommandPath(command: string): string | undefined {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.split(/\r?\n/).find(Boolean);
}

/** Runs a shell command after this process exits so self-uninstall can succeed. */
function deferShell(command: string): void {
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const args =
    process.platform === "win32"
      ? ["/c", `timeout /t 2 /nobreak >nul & ${command}`]
      : ["-c", `sleep 2 && ${command}`];
  spawn(shell, args, {
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref();
}

/** Runs a command synchronously and returns whether it succeeded. */
function runSync(
  command: string,
  args: string[]
): { ok: boolean; output: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

/** Returns whether uninstall output indicates the package was not installed. */
function isNotInstalledOutput(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes("not installed") ||
    lower.includes("cannot uninstall") ||
    lower.includes("no such package") ||
    lower.includes("is not installed") ||
    lower.includes("skipping")
  );
}

/**
 * Removes `orion-notebook` from npm, pip, and uv when present.
 * Defers uninstall for the channel currently running this CLI so file locks clear.
 */
export function runPackageUninstall(
  options: { runningFrom?: InstallChannel } = {}
): PackageUninstallResult {
  const result: PackageUninstallResult = {
    removed: [],
    deferred: [],
    notInstalled: [],
    errors: [],
  };
  const { runningFrom } = options;

  const npm = resolveCommandPath("npm");
  if (npm) {
    const args = ["uninstall", "-g", ORION_PACKAGE_NAME];
    if (runningFrom === "npm") {
      deferShell(`npm uninstall -g ${ORION_PACKAGE_NAME}`);
      result.deferred.push("npm");
    } else {
      const { ok, output } = runSync("npm", args);
      if (ok) {
        result.removed.push("npm");
      } else if (isNotInstalledOutput(output)) {
        result.notInstalled.push("npm");
      } else {
        result.errors.push({
          channel: "npm",
          message: output.split(/\r?\n/)[0] || "npm uninstall failed",
        });
      }
    }
  }

  const python =
    resolveCommandPath("python3") ?? resolveCommandPath("python");
  if (python) {
    const args = ["-m", "pip", "uninstall", "-y", ORION_PACKAGE_NAME];
    if (runningFrom === "pip") {
      deferShell(`${python} -m pip uninstall -y ${ORION_PACKAGE_NAME}`);
      result.deferred.push("pip");
    } else {
      const { ok, output } = runSync(python, args);
      if (ok) {
        result.removed.push("pip");
      } else if (isNotInstalledOutput(output)) {
        result.notInstalled.push("pip");
      } else {
        result.errors.push({
          channel: "pip",
          message: output.split(/\r?\n/)[0] || "pip uninstall failed",
        });
      }
    }
  }

  const uv = resolveCommandPath("uv");
  if (uv) {
    const args = ["tool", "uninstall", ORION_PACKAGE_NAME];
    if (runningFrom === "uv") {
      deferShell(`${uv} tool uninstall ${ORION_PACKAGE_NAME}`);
      result.deferred.push("uv");
    } else {
      const { ok, output } = runSync(uv, args);
      if (ok) {
        result.removed.push("uv");
      } else if (isNotInstalledOutput(output)) {
        result.notInstalled.push("uv");
      } else {
        result.errors.push({
          channel: "uv",
          message: output.split(/\r?\n/)[0] || "uv tool uninstall failed",
        });
      }
    }
  }

  return result;
}

/** Prints a concise summary of package uninstall attempts. */
export function printPackageUninstallResult(
  result: PackageUninstallResult
): void {
  for (const channel of result.removed) {
    console.log(`Removed orion-notebook (${channel}).`);
  }
  for (const channel of result.deferred) {
    console.log(`Removing orion-notebook (${channel}) after exit...`);
  }
  for (const { channel, message } of result.errors) {
    console.warn(`Could not remove orion-notebook (${channel}): ${message}`);
  }
  if (
    result.removed.length === 0 &&
    result.deferred.length === 0 &&
    result.errors.length === 0
  ) {
    console.log("No orion-notebook package installation found to remove.");
  }
}
