import { existsSync } from "fs";
import { rm } from "fs/promises";
import { join } from "path";

import {
  resolveCachedAppDirectory,
  resolveOrionHomeDirectory,
  resolveOrionRuntimeDirectory,
  type RuntimePathOptions,
} from "./paths";
import { confirmSetup } from "./prompt";

export interface UninstallOptions {
  version: string;
  yes?: boolean;
  all?: boolean;
  pathOptions?: RuntimePathOptions;
}

export interface UninstallResult {
  removed: string[];
  skipped: string[];
}

/** Resolves the cached GitHub app bundle archive for a package version. */
export function resolveAppBundleArchivePath(
  version: string,
  options: RuntimePathOptions = {}
): string {
  return join(
    resolveOrionRuntimeDirectory(options),
    "downloads",
    `orion-app-${version}.tar.gz`
  );
}

/** Deletes a file or directory when it exists. */
async function removeIfExists(target: string): Promise<boolean> {
  if (!existsSync(target)) {
    return false;
  }
  await rm(target, { recursive: true, force: true });
  return true;
}

/**
 * Removes Orion-managed data under `~/.orion`.
 * Default mode clears the pip-downloaded app bundle for the package version.
 */
export async function runUninstall(
  options: UninstallOptions
): Promise<UninstallResult> {
  const pathOptions = options.pathOptions;
  const removed: string[] = [];
  const skipped: string[] = [];

  if (options.all) {
    const home = resolveOrionHomeDirectory(pathOptions);
    if (!existsSync(home)) {
      skipped.push(home);
      return { removed, skipped };
    }

    const accepted = await confirmSetup(
      `Remove all Orion data under ${home}? This deletes cached app bundles, Jupyter venv, and portable Node.`,
      { assumeYes: options.yes }
    );
    if (!accepted) {
      throw new Error("Uninstall declined.");
    }

    await rm(home, { recursive: true, force: true });
    removed.push(home);
    return { removed, skipped };
  }

  const targets = [
    resolveCachedAppDirectory(options.version, pathOptions),
    resolveAppBundleArchivePath(options.version, pathOptions),
  ];
  const existing = targets.filter((target) => existsSync(target));

  if (existing.length === 0) {
    skipped.push(...targets);
    return { removed, skipped };
  }

  const accepted = await confirmSetup(
    `Remove Orion cached data for v${options.version}?\n${existing.map((path) => `  - ${path}`).join("\n")}`,
    { assumeYes: options.yes }
  );
  if (!accepted) {
    throw new Error("Uninstall declined.");
  }

  for (const target of targets) {
    if (await removeIfExists(target)) {
      removed.push(target);
    } else {
      skipped.push(target);
    }
  }

  return { removed, skipped };
}
