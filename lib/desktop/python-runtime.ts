import { execFile as execFileCallback } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

import { z } from "zod";

import {
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
  resolveOrionRuntimeDirectory,
} from "../cli/paths";

const execFile = promisify(execFileCallback);

/**
 * Prints the interpreter's `major.minor` version.
 *
 * Only the minor version matters: a venv built on CPython 3.13 keeps working
 * across patch releases but breaks when the base moves to 3.14.
 */
const VERSION_SCRIPT = "import sys; print('%d.%d' % sys.version_info[:2])";

/** Packages `python -m venv` provisions itself; restoring them would fight pip's own bootstrap. */
const BOOTSTRAP_PACKAGES = new Set(["pip", "setuptools", "wheel"]);

export type ExecFileLike = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

const venvPackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

const venvStateSchema = z.object({
  schema: z.literal(1),
  basePythonPath: z.string().min(1),
  basePythonVersion: z.string().min(1),
  createdAt: z.string().min(1),
  packages: z.array(venvPackageSchema),
});

const pipListSchema = z.array(
  z
    .object({ name: z.string().min(1), version: z.string().min(1) })
    .passthrough()
);

export type DesktopVenvPackage = z.infer<typeof venvPackageSchema>;
export type DesktopVenvState = z.infer<typeof venvStateSchema>;

export interface DesktopVenvResult {
  /** Python executable Jupyter should run. */
  pythonPath: string;
  /** Whether the environment was rebuilt during this call. */
  created: boolean;
  /** Package names reinstalled after a rebuild. */
  restoredPackages: string[];
  /** Package names that could not be reinstalled after a rebuild. */
  failedPackages: string[];
}

/** Resolves the state file recording which base interpreter the managed venv was built on. */
export function resolveDesktopVenvStatePath(): string {
  return path.join(resolveOrionRuntimeDirectory(), "venv-state.json");
}

/** Reads the managed venv state, treating missing or malformed files as absent. */
export async function readVenvState(): Promise<DesktopVenvState | null> {
  let raw: string;
  try {
    raw = await readFile(resolveDesktopVenvStatePath(), "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = venvStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes the managed venv state, creating the runtime directory when needed. */
export async function writeVenvState(state: DesktopVenvState): Promise<void> {
  await mkdir(resolveOrionRuntimeDirectory(), { recursive: true });
  await writeFile(
    resolveDesktopVenvStatePath(),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

/** Reads an interpreter's `major.minor` version, or null when it cannot run. */
export async function probePythonMinorVersion(
  pythonPath: string,
  execFileImpl: ExecFileLike = execFile
): Promise<string | null> {
  if (!existsSync(pythonPath)) {
    return null;
  }

  try {
    const { stdout } = await execFileImpl(pythonPath, ["-c", VERSION_SCRIPT]);
    const version = stdout.trim();
    return /^\d+\.\d+$/.test(version) ? version : null;
  } catch {
    return null;
  }
}

/**
 * Lists packages installed into the venv itself.
 *
 * `--local` excludes everything inherited from the bundled base interpreter, so
 * the result is exactly what the user installed and what a rebuild must restore.
 */
export async function snapshotVenvPackages(
  venvPython: string,
  execFileImpl: ExecFileLike = execFile
): Promise<DesktopVenvPackage[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileImpl(venvPython, [
      "-m",
      "pip",
      "list",
      "--local",
      "--format=json",
    ]));
  } catch {
    return [];
  }

  try {
    const parsed = pipListSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) {
      return [];
    }
    return parsed.data
      .filter((entry) => !BOOTSTRAP_PACKAGES.has(entry.name.toLowerCase()))
      .map((entry) => ({ name: entry.name, version: entry.version }));
  } catch {
    return [];
  }
}

/** Builds the pip command that reinstalls a recorded package set into a rebuilt venv. */
export function buildRestorePackagesCommand(
  venvPython: string,
  packages: DesktopVenvPackage[]
): { command: string; args: string[] } {
  return {
    command: venvPython,
    args: [
      "-m",
      "pip",
      "install",
      ...packages.map((entry) => `${entry.name}==${entry.version}`),
    ],
  };
}

/**
 * Reinstalls recorded packages after a rebuild without letting one bad package
 * lose the rest: a failed batch install is retried package by package.
 */
async function restorePackages(
  venvPython: string,
  packages: DesktopVenvPackage[],
  execFileImpl: ExecFileLike
): Promise<{ restored: string[]; failed: string[] }> {
  const restorable = packages.filter(
    (entry) => !BOOTSTRAP_PACKAGES.has(entry.name.toLowerCase())
  );
  if (restorable.length === 0) {
    return { restored: [], failed: [] };
  }

  const batch = buildRestorePackagesCommand(venvPython, restorable);
  try {
    await execFileImpl(batch.command, batch.args);
    return { restored: restorable.map((entry) => entry.name), failed: [] };
  } catch {
    const restored: string[] = [];
    const failed: string[] = [];
    for (const entry of restorable) {
      const single = buildRestorePackagesCommand(venvPython, [entry]);
      try {
        await execFileImpl(single.command, single.args);
        restored.push(entry.name);
      } catch {
        failed.push(entry.name);
      }
    }
    return { restored, failed };
  }
}

/**
 * Ensures a persistent Python environment exists outside the application bundle.
 *
 * The venv is created with `--system-site-packages` on top of the bundled
 * standalone interpreter, so Orion's preinstalled Jupyter stack stays visible
 * while `%pip install` writes into `~/.orion/runtime/venv` instead of the
 * signed app bundle. Health is decided by probing the venv interpreter rather
 * than by trusting the recorded state: an app update replaces the bundle at the
 * same path, which the venv survives, whereas a relocated app or a Python minor
 * bump leaves the venv unable to start and triggers a rebuild.
 */
export async function ensureDesktopManagedVenv(
  basePythonPath: string,
  execFileImpl: ExecFileLike = execFile
): Promise<DesktopVenvResult> {
  const runtimeDirectory = resolveOrionRuntimeDirectory();
  await mkdir(runtimeDirectory, { recursive: true });

  const baseVersion = await probePythonMinorVersion(basePythonPath, execFileImpl);
  if (!baseVersion) {
    throw new Error(
      `Bundled Python at ${basePythonPath} did not report a usable version.`
    );
  }

  const venvDirectory = resolveManagedVenvDirectory();
  const venvPython = resolveManagedVenvPythonPath(venvDirectory);
  const state = await readVenvState();
  const venvVersion = await probePythonMinorVersion(venvPython, execFileImpl);

  if (venvVersion === baseVersion) {
    if (
      !state ||
      state.basePythonPath !== basePythonPath ||
      state.basePythonVersion !== baseVersion
    ) {
      await writeVenvState({
        schema: 1,
        basePythonPath,
        basePythonVersion: baseVersion,
        createdAt: state?.createdAt ?? new Date().toISOString(),
        packages: state?.packages ?? [],
      });
    }
    return {
      pythonPath: venvPython,
      created: false,
      restoredPackages: [],
      failedPackages: [],
    };
  }

  await rm(venvDirectory, { recursive: true, force: true });
  await execFileImpl(basePythonPath, [
    "-m",
    "venv",
    "--system-site-packages",
    venvDirectory,
  ]);

  const { restored, failed } = await restorePackages(
    venvPython,
    state?.packages ?? [],
    execFileImpl
  );

  await writeVenvState({
    schema: 1,
    basePythonPath,
    basePythonVersion: baseVersion,
    createdAt: new Date().toISOString(),
    packages: state?.packages ?? [],
  });

  return {
    pythonPath: venvPython,
    created: true,
    restoredPackages: restored,
    failedPackages: failed,
  };
}

/**
 * Refreshes the recorded package list from the live environment.
 *
 * Called after a successful launch so a later rebuild knows what to restore.
 * Failures are irrelevant to the running session and are swallowed by callers.
 */
export async function recordVenvPackageSnapshot(
  venvPython: string,
  execFileImpl: ExecFileLike = execFile
): Promise<void> {
  const state = await readVenvState();
  if (!state) {
    return;
  }

  const packages = await snapshotVenvPackages(venvPython, execFileImpl);
  await writeVenvState({ ...state, packages });
}
