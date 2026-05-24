// @vitest-environment node

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  resolveAppBundleArchivePath,
  runUninstall,
} from "@/lib/cli/uninstall";
import {
  resolveCachedAppDirectory,
  resolveOrionHomeDirectory,
} from "@/lib/cli/paths";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await runUninstall({ version: "0.5.1", yes: true, all: true, pathOptions: { env: { ORION_HOME_DIR: root } } }).catch(() => undefined);
  }
});

/** Creates an isolated Orion home directory for uninstall tests. */
async function createTempOrionHome(): Promise<string> {
  const root = join(
    process.cwd(),
    ".tmp-orion-uninstall",
    `test-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  tempRoots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

describe("CLI uninstall", () => {
  it("removes the cached app bundle and download archive for a version", async () => {
    const home = await createTempOrionHome();
    const pathOptions = { env: { ORION_HOME_DIR: home } };
    const appDirectory = resolveCachedAppDirectory("0.5.1", pathOptions);
    const archivePath = resolveAppBundleArchivePath("0.5.1", pathOptions);

    await mkdir(appDirectory, { recursive: true });
    await writeFile(join(appDirectory, "server.js"), "console.log('ok');");
    await mkdir(join(archivePath, ".."), { recursive: true });
    await writeFile(archivePath, "archive");

    const result = await runUninstall({
      version: "0.5.1",
      yes: true,
      pathOptions,
    });

    expect(result.removed).toEqual([appDirectory, archivePath]);
    expect(result.skipped).toEqual([]);
  });

  it("removes the entire Orion home directory with --all", async () => {
    const home = await createTempOrionHome();
    const pathOptions = { env: { ORION_HOME_DIR: home } };
    await mkdir(join(home, "runtime", "venv"), { recursive: true });

    const result = await runUninstall({
      version: "0.5.1",
      yes: true,
      all: true,
      pathOptions,
    });

    expect(result.removed).toEqual([resolveOrionHomeDirectory(pathOptions)]);
    expect(result.skipped).toEqual([]);
  });
});
