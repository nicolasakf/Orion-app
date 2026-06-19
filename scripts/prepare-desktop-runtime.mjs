import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { cp, lstat, mkdir, readdir, rm, stat, symlink, writeFile } from "fs/promises";
import { execFile as execFileCallback } from "child_process";
import { basename, dirname, join, resolve } from "path";
import { promisify } from "util";
import { pipeline as pipelineCallback } from "stream";
import { createReadStream, existsSync, readFileSync } from "fs";

const execFileAsync = promisify(execFileCallback);
const pipeline = promisify(pipelineCallback);

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const runtimeDir = join(root, "dist", "desktop-runtime");
const downloadsDir = join(runtimeDir, "downloads");

const NODE_VERSION = "v24.11.0";
const PYTHON_RELEASE = "20260610";
const PYTHON_VERSION = "3.13.14";

const TARGETS = {
  "darwin-arm64": {
    node: {
      url: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz`,
      sha256: "0be2ab2816a4fa02d1acff014a434f29f56d8d956f5af6a98b70ced6c5f4d201",
      archive: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
    },
    python: {
      url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-aarch64-apple-darwin-install_only.tar.gz`,
      sha256: "0e255968ed96255df59b6bc9504545260c11de3171e48f7640668d88154945ba",
      archive: `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-aarch64-apple-darwin-install_only.tar.gz`,
    },
  },
  "darwin-x64": {
    node: {
      url: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-x64.tar.gz`,
      sha256: "3884671e87f46f773832d98a0a6cabcc5ec4f637084f0f3515b69e66ea27f2f1",
      archive: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
    },
    python: {
      url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-x86_64-apple-darwin-install_only.tar.gz`,
      sha256: "592d3d807a493e4e21dbc972f81d1b2ece6381a7e687bcf0da68555a1282d49a",
      archive: `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-x86_64-apple-darwin-install_only.tar.gz`,
    },
  },
  "win32-x64": {
    node: {
      url: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`,
      sha256: "1054540bce22b54ec7e50ebc078ec5d090700a77657607a58f6a64df21f49fdd",
      archive: `node-${NODE_VERSION}-win-x64.zip`,
    },
    python: {
      url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
      sha256: "9a77f87ec431f16e79fc7e90d9115edf187d18b64100b6f6c27189f419fd79be",
      archive: `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
    },
  },
};

/** Returns the desktop packaging target for this run. */
function resolveTarget() {
  const explicit = process.env.ORION_DESKTOP_TARGET ?? process.argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  const target = explicit ?? `${process.platform}-${process.arch}`;
  if (!(target in TARGETS)) {
    throw new Error(
      `Unsupported desktop runtime target '${target}'. Supported targets: ${Object.keys(TARGETS).join(", ")}.`
    );
  }
  return target;
}

/** Streams a URL to disk. */
async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${url} returned ${response.status}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}

/** Returns a file's SHA256 hex digest. */
async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** Downloads and verifies one pinned runtime archive. */
async function ensureArchive(asset) {
  const destination = join(downloadsDir, asset.archive);
  try {
    await stat(destination);
  } catch {
    console.log(`Downloading ${asset.url}`);
    await download(asset.url, destination);
  }

  const actual = await sha256(destination);
  if (actual !== asset.sha256) {
    await rm(destination, { force: true });
    throw new Error(
      `Checksum mismatch for ${asset.archive}. Expected ${asset.sha256}, got ${actual}.`
    );
  }
  return destination;
}

/** Extracts an archive using the system tar implementation available on macOS, Linux, and Windows runners. */
async function extractArchive(archive, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await execFileAsync("tar", ["-xf", archive, "-C", destination]);
}

/** Returns the single extracted child directory, or a named directory when present. */
async function findExtractedRoot(extractDir, preferredName) {
  const preferred = join(extractDir, preferredName);
  try {
    await stat(preferred);
    return preferred;
  } catch {
    const entries = await readdir(extractDir);
    if (entries.length !== 1) {
      throw new Error(`Expected one extracted directory in ${extractDir}, found ${entries.length}.`);
    }
    return join(extractDir, entries[0]);
  }
}

/** Copies a downloaded Node runtime into the normalized resource layout. */
async function prepareNode(asset) {
  const archive = await ensureArchive(asset);
  const extractDir = join(runtimeDir, ".extract-node");
  await extractArchive(archive, extractDir);
  const extracted = await findExtractedRoot(extractDir, "node");
  const destination = join(runtimeDir, "node");
  await rm(destination, { recursive: true, force: true });
  await cp(extracted, destination, { recursive: true });
  await rm(extractDir, { recursive: true, force: true });
  return destination;
}

/** Copies a downloaded Python runtime into the normalized resource layout. */
async function preparePython(asset) {
  const archive = await ensureArchive(asset);
  const extractDir = join(runtimeDir, ".extract-python");
  await extractArchive(archive, extractDir);
  const extracted = await findExtractedRoot(extractDir, "python");
  const destination = join(runtimeDir, "python");
  await rm(destination, { recursive: true, force: true });
  await cp(extracted, destination, { recursive: true });
  await normalizePythonLauncherLinks(destination);
  await rm(extractDir, { recursive: true, force: true });
  return destination;
}

/** Rewrites portable Python launcher symlinks so packaged apps do not keep extraction paths. */
async function normalizePythonLauncherLinks(destination) {
  if (process.platform === "win32") {
    return;
  }

  const binDir = join(destination, "bin");
  const versionedPython = join(binDir, `python${PYTHON_VERSION.split(".").slice(0, 2).join(".")}`);
  await stat(versionedPython).catch(() => {
    throw new Error(`Prepared Python executable was not found at ${versionedPython}.`);
  });

  for (const launcher of ["python", "python3"]) {
    const launcherPath = join(binDir, launcher);
    const launcherStat = await lstat(launcherPath).catch(() => null);
    if (!launcherStat?.isSymbolicLink()) {
      continue;
    }
    await rm(launcherPath, { force: true });
    await symlink(`./${basename(versionedPython)}`, launcherPath);
  }
}

/** Resolves the Python executable inside the normalized resource layout. */
function resolvePreparedPython(target) {
  return target.startsWith("win32-")
    ? join(runtimeDir, "python", "python.exe")
    : join(runtimeDir, "python", "bin", "python3");
}

/** Returns the current local or published orion-ui package spec for the bundled runtime. */
function resolveOrionUiPackageSpec() {
  if (process.env.ORION_UI_PACKAGE_SPEC) {
    return process.env.ORION_UI_PACKAGE_SPEC;
  }
  const localWheel = join(root, "python", "orion-ui", "dist", `orion_ui-${version}-py3-none-any.whl`);
  if (existsSync(localWheel)) {
    return localWheel;
  }
  return `orion-ui==${version}`;
}

/** Installs Orion's required Jupyter packages into the bundled Python runtime. */
async function installPythonPackages(target) {
  if (process.env.ORION_DESKTOP_SKIP_PIP === "1") {
    console.log("Skipping bundled Python package installation (ORION_DESKTOP_SKIP_PIP=1).");
    return;
  }

  const python = resolvePreparedPython(target);
  const packages = [
    "jupyter_server>=2,<3",
    "jupyter_server_terminals>=0.4,<1",
    "ipykernel>=6,<7",
    resolveOrionUiPackageSpec(),
  ];
  console.log(`Installing bundled Jupyter runtime packages with ${python}`);
  await execFileAsync(python, ["-m", "pip", "install", "--upgrade", "pip", ...packages], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 16,
  });
}

/** Prepares the normalized desktop runtime resource directory for electron-builder. */
async function main() {
  const target = resolveTarget();
  const manifest = TARGETS[target];
  await mkdir(downloadsDir, { recursive: true });

  if (process.env.ORION_DESKTOP_RUNTIME_SOURCE_DIR) {
    await rm(runtimeDir, { recursive: true, force: true });
    await cp(resolve(process.env.ORION_DESKTOP_RUNTIME_SOURCE_DIR), runtimeDir, {
      recursive: true,
    });
    return;
  }

  await prepareNode(manifest.node);
  await preparePython(manifest.python);
  await installPythonPackages(target);
  await writeFile(
    join(runtimeDir, "manifest.json"),
    `${JSON.stringify(
      {
        target,
        nodeVersion: NODE_VERSION,
        pythonVersion: PYTHON_VERSION,
        pythonBuildStandaloneRelease: PYTHON_RELEASE,
        preparedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`Desktop runtime prepared at ${runtimeDir} for ${target}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
