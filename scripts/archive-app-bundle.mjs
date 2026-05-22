import { readFileSync } from "fs";
import { mkdir, stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const bundleDir = join(root, "dist", "orion-app");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const archivePath = join(root, "dist", `orion-app-${version}.tar.gz`);

/** Creates a gzipped tarball of the Orion app bundle for PyPI first-run download. */
async function main() {
  await stat(join(bundleDir, "server.js")).catch(() => {
    throw new Error(
      `App bundle was not found at ${bundleDir}. Run "npm run prepare:app-bundle" first.`
    );
  });

  await mkdir(join(root, "dist"), { recursive: true });

  if (process.platform === "win32") {
    throw new Error("Archive creation is not supported on Windows in this script yet.");
  }

  await execFileAsync("tar", ["-czf", archivePath, "-C", bundleDir, "."]);
  console.log(`Orion app bundle archived at ${archivePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
