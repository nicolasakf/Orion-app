import { spawnSync } from "child_process";
import { createInterface } from "readline/promises";

import { checkNpmUpdate } from "../update/package-registry";

export { checkNpmUpdate, checkPackageUpdate } from "../update/package-registry";

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
