const { existsSync, statSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const compiledMain = join(root, "dist", "desktop", "desktop", "main.js");
const sourceRoots = [
  join(root, "desktop", "main.ts"),
  join(root, "lib", "desktop"),
  join(root, "lib", "cli"),
  join(root, "lib", "kernel", "launcher-connection.ts"),
  join(root, "tsconfig.desktop.json"),
];

/** Returns the newest mtime for one file or a shallow directory tree. */
function newestMtimeMs(filePath) {
  if (!existsSync(filePath)) {
    return 0;
  }

  const stat = statSync(filePath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  const { readdirSync } = require("fs");
  return readdirSync(filePath, { withFileTypes: true }).reduce((latest, entry) => {
    const childPath = join(filePath, entry.name);
    return Math.max(latest, newestMtimeMs(childPath));
  }, stat.mtimeMs);
}

/** Returns whether local TypeScript sources are newer than the compiled Electron main. */
function needsRebuild() {
  if (!existsSync(compiledMain)) {
    return true;
  }

  const compiledAt = statSync(compiledMain).mtimeMs;
  return sourceRoots.some((sourcePath) => newestMtimeMs(sourcePath) > compiledAt);
}

/** Builds the desktop main process on demand for local `npx electron .` runs. */
function ensureCompiledMain() {
  if (!needsRebuild()) {
    return;
  }

  const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) {
    throw new Error(
      "Desktop main process is not built. Run `npm install --legacy-peer-deps`, then `npm run build:desktop-main`."
    );
  }

  const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.desktop.json"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error("Failed to build the Electron desktop main process.");
  }
}

ensureCompiledMain();
require(compiledMain);
