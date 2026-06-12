import { cp, mkdir, rm, stat, writeFile } from "fs/promises";
import { spawnSync } from "child_process";
import { join } from "path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");
const bundleDir = join(root, "dist", "orion-app");

const ensureNativeModulesLib = join(
  root,
  "dist",
  "cli",
  "lib",
  "cli",
  "ensure-native-modules.js"
);

const ensureNativeModulesShim = `const { ensureBundledNativeModules } = require("./lib/ensure-native-modules.js");
ensureBundledNativeModules(process.env.ORION_APP_DIR || __dirname);
`;

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

/** Copies the self-contained native-module helper into the app bundle. */
async function copyEnsureNativeModulesScript() {
  try {
    await stat(ensureNativeModulesLib);
  } catch {
    throw new Error(
      `Compiled ensure-native-modules.js was not found at ${ensureNativeModulesLib}. ` +
        'Run "npm run build:cli" before preparing the app bundle.'
    );
  }

  const libDir = join(bundleDir, "lib");
  await mkdir(libDir, { recursive: true });
  await cp(ensureNativeModulesLib, join(libDir, "ensure-native-modules.js"));
  await writeFile(join(bundleDir, "ensure-native-modules.js"), ensureNativeModulesShim, "utf8");
}

/** Verifies the bundle shim can be required without missing-module errors. */
function smokeCheckEnsureNativeModulesScript() {
  const script = join(bundleDir, "ensure-native-modules.js");
  const result = spawnSync(process.execPath, [script], {
    cwd: bundleDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
    throw new Error(
      `ensure-native-modules.js smoke check failed in ${bundleDir}. ${output || "unknown error"}`
    );
  }
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

  await copyEnsureNativeModulesScript();
  smokeCheckEnsureNativeModulesScript();

  console.log(`Orion app bundle prepared at ${bundleDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
