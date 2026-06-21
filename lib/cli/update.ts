import { spawnSync } from "child_process";
import { createInterface } from "readline/promises";

import { z } from "zod";

import { compareStableVersions } from "../update/types";

const NPM_LATEST_URL = "https://registry.npmjs.org/orion-notebook/latest";
const PYPI_LATEST_URL = "https://pypi.org/pypi/orion-notebook/json";
const NpmLatestSchema = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) });
const PypiLatestSchema = z.object({
  info: z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }),
});

/** Fetches the latest stable npm package version with a short timeout. */
export async function checkNpmUpdate(currentVersion: string): Promise<string | null> {
  const response = await fetch(NPM_LATEST_URL, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}.`);
  const { version } = NpmLatestSchema.parse(await response.json());
  return compareStableVersions(version, currentVersion) > 0 ? version : null;
}

/** Checks the registry corresponding to a CLI installation channel. */
export async function checkPackageUpdate(
  currentVersion: string,
  source: "npm" | "pip" | "uv"
): Promise<string | null> {
  if (source === "npm") return checkNpmUpdate(currentVersion);
  const response = await fetch(PYPI_LATEST_URL, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`PyPI returned HTTP ${response.status}.`);
  const { info } = PypiLatestSchema.parse(await response.json());
  return compareStableVersions(info.version, currentVersion) > 0 ? info.version : null;
}

/** Installs the latest npm release globally and throws with package-manager output on failure. */
export function installLatestNpmVersion(): void {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    command,
    ["install", "--global", "orion-notebook@latest", "--legacy-peer-deps"],
    { encoding: "utf8", stdio: "pipe", timeout: 180_000, env: process.env }
  );
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(output || "npm update failed.");
  }
}

/** Asks an interactive yes/no question, defaulting safely to no. */
export async function confirmCliUpdate(message: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    prompt.close();
  }
}

/** Runs the explicit npm updater command. */
export async function runNpmUpdateCommand(currentVersion: string): Promise<boolean> {
  const latestVersion = await checkNpmUpdate(currentVersion);
  if (!latestVersion) {
    console.log(`Orion ${currentVersion} is already up to date.`);
    return false;
  }
  console.log(`Updating Orion ${currentVersion} to ${latestVersion}...`);
  installLatestNpmVersion();
  console.log(`Orion ${latestVersion} installed. Run orion again to start the new version.`);
  return true;
}
