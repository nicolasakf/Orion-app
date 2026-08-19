import { cp, mkdir, readdir, rm, stat, writeFile } from "fs/promises";
import { spawnSync } from "child_process";
import { join, relative, sep } from "path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");
const bundleDir = join(root, "dist", "orion-app");

/**
 * Public assets the running app never requests, kept out of the shipped bundle.
 *
 * These exist for the GitHub README and the prompt test suites, and together
 * they dominated the packaged size. Excluding them here leaves the repo's own
 * `public/` untouched, so cloud deploys and the README are unaffected.
 */
const EXCLUDED_PUBLIC_PATHS = ["test-files"];
const EXCLUDED_PUBLIC_PATTERNS = [/^assets\/.*\.gif$/i, /^assets\/Cover Photo.*$/i];

/** Guards against the bundle silently regrowing once it has been trimmed. */
const MAX_BUNDLE_BYTES = 150 * 1024 * 1024;

/** Returns whether a path under `public/` should be copied into the bundle. */
function shouldCopyPublicPath(source) {
  const relativePath = relative(publicDir, source);
  if (!relativePath) {
    return true;
  }

  const normalized = relativePath.split(sep).join("/");
  if (
    EXCLUDED_PUBLIC_PATHS.some(
      (excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`)
    )
  ) {
    return false;
  }
  return !EXCLUDED_PUBLIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Sums the size of every file under a directory. */
async function measureDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await measureDirectory(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

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
async function copyRequiredDirectory(source, destination, label, filter) {
  try {
    await stat(source);
  } catch {
    throw new Error(
      `${label} was not found at ${source}. Run "npm run build" before preparing the app bundle.`
    );
  }

  await cp(source, destination, { recursive: true, filter });
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
  await copyRequiredDirectory(
    publicDir,
    join(bundleDir, "public"),
    "Public assets",
    shouldCopyPublicPath
  );
  await rm(join(bundleDir, "logs"), { recursive: true, force: true });

  await copyEnsureNativeModulesScript();
  smokeCheckEnsureNativeModulesScript();

  const bundleBytes = await measureDirectory(bundleDir);
  const bundleMiB = (bundleBytes / 1024 / 1024).toFixed(1);
  if (bundleBytes > MAX_BUNDLE_BYTES) {
    throw new Error(
      `Orion app bundle is ${bundleMiB} MiB, over the ${MAX_BUNDLE_BYTES / 1024 / 1024} MiB limit. ` +
        "Every desktop download and npm install carries this. Locally the usual cause is a " +
        '.next directory left behind by "npm run dev" — rerun "npm run build" for a clean ' +
        "production build. Otherwise trim the bundle or raise the limit deliberately."
    );
  }

  console.log(
    `Orion app bundle prepared at ${bundleDir} (${bundleMiB} MiB; better-sqlite3 prebuilds download at first run when needed).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
