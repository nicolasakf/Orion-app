import { z } from "zod";

import { compareStableVersions, type UpdateSource } from "./types";

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
  source: Exclude<UpdateSource, "desktop">
): Promise<string | null> {
  if (source === "npm") return checkNpmUpdate(currentVersion);
  const response = await fetch(PYPI_LATEST_URL, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`PyPI returned HTTP ${response.status}.`);
  const { info } = PypiLatestSchema.parse(await response.json());
  return compareStableVersions(info.version, currentVersion) > 0 ? info.version : null;
}
