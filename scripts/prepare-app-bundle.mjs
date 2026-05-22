import { cp, mkdir, rm, stat } from "fs/promises";
import { join } from "path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");
const bundleDir = join(root, "dist", "orion-app");

/** Copies a directory when it exists, otherwise throws a helpful error. */
async function copyRequiredDirectory(source, destination, label) {
  try {
    await stat(source);
  } catch {
    throw new Error(
      `${label} was not found at ${source}. Run "npm run build" before preparing the app bundle.`
    );
  }

  await cp(source, destination, { recursive: true });
}

/** Builds the packaged Next standalone app bundle consumed by the Orion CLI. */
async function main() {
  await stat(join(standaloneDir, "server.js")).catch(() => {
    throw new Error(
      `Standalone build was not found at ${standaloneDir}. Run "npm run build" first.`
    );
  });

  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  await copyRequiredDirectory(standaloneDir, bundleDir, "Standalone build");
  await copyRequiredDirectory(staticDir, join(bundleDir, ".next", "static"), "Static assets");
  await copyRequiredDirectory(publicDir, join(bundleDir, "public"), "Public assets");
  await rm(join(bundleDir, "logs"), { recursive: true, force: true });

  console.log(`Orion app bundle prepared at ${bundleDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
