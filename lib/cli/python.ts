import { execFile as execFileCallback } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { promisify } from "util";

import {
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
  resolveOrionRuntimeDirectory,
} from "./paths";

const execFile = promisify(execFileCallback);
const INSPECT_SCRIPT =
  "import json, sys; print(json.dumps({'executable': sys.executable, 'version': list(sys.version_info[:3])}))";

export interface PythonCandidate {
  label: string;
  command: string;
  argsPrefix: string[];
}

export interface PythonRuntime {
  candidate: PythonCandidate;
  executable: string;
  version: [number, number, number];
  support: "preferred" | "legacy";
}

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface ManagedPackageSet {
  support: PythonRuntime["support"];
  packages: string[];
}

export type PythonInstallStatus = "ready" | "no-jupyter" | "unsupported" | "probe-failed";

export interface PythonInstallation {
  status: PythonInstallStatus;
  label: string;
  candidate?: PythonCandidate;
  runtime?: PythonRuntime;
  executable?: string;
  version?: [number, number, number];
  reason?: string;
  managed?: boolean;
}

export interface PythonInstallationReport {
  ready: PythonInstallation[];
  noJupyter: PythonInstallation[];
  unsupported: PythonInstallation[];
  probeFailed: PythonInstallation[];
  venvCreationRuntime: PythonRuntime | null;
}

type ExecFileLike = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

/** Parses `Python 3.x.y` command output into a comparable tuple. */
export function parsePythonVersion(output: string): [number, number, number] | null {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns Orion's Python support tier for a version tuple. */
export function getPythonSupport(
  version: [number, number, number]
): "preferred" | "legacy" | "unsupported" {
  const [major, minor] = version;
  if (major > 3 || (major === 3 && minor >= 9)) {
    return "preferred";
  }
  if (major === 3 && minor === 8) {
    return "legacy";
  }
  return "unsupported";
}

/** Returns Python commands worth probing on the current platform. */
export function getPythonDiscoveryCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): PythonCandidate[] {
  const candidates: PythonCandidate[] =
    platform === "win32"
      ? [
          { label: "Python Launcher 3", command: "py", argsPrefix: ["-3"] },
          { label: "python", command: "python", argsPrefix: [] },
          { label: "python3", command: "python3", argsPrefix: [] },
        ]
      : [
          { label: "python3", command: "python3", argsPrefix: [] },
          { label: "python", command: "python", argsPrefix: [] },
          {
            label: "Homebrew python3",
            command: "/opt/homebrew/bin/python3",
            argsPrefix: [],
          },
          {
            label: "usr-local python3",
            command: "/usr/local/bin/python3",
            argsPrefix: [],
          },
        ];

  if (env.PYTHON) {
    candidates.unshift({ label: "PYTHON", command: env.PYTHON, argsPrefix: [] });
  }

  if (env.CONDA_PREFIX) {
    const condaPython =
      platform === "win32"
        ? path.join(env.CONDA_PREFIX, "python.exe")
        : path.join(env.CONDA_PREFIX, "bin", "python");
    const insertAt = env.PYTHON ? 1 : 0;
    candidates.splice(insertAt, 0, {
      label: "Conda",
      command: condaPython,
      argsPrefix: [],
    });
  }

  return candidates;
}

/** Inspects one Python executable candidate and returns null when unsupported. */
export async function inspectPythonCandidate(
  candidate: PythonCandidate,
  execFileImpl: ExecFileLike = execFile
): Promise<PythonRuntime | null> {
  try {
    const { stdout } = await execFileImpl(candidate.command, [
      ...candidate.argsPrefix,
      "-c",
      INSPECT_SCRIPT,
    ]);
    const data = JSON.parse(stdout) as {
      executable?: unknown;
      version?: unknown;
    };

    if (
      typeof data.executable !== "string" ||
      !Array.isArray(data.version) ||
      data.version.length < 3
    ) {
      return null;
    }

    const version = data.version.slice(0, 3) as [number, number, number];
    const support = getPythonSupport(version);
    if (support === "unsupported") {
      return null;
    }

    return {
      candidate,
      executable: data.executable,
      version,
      support,
    };
  } catch {
    return null;
  }
}

/** Formats a Python version tuple for CLI output. */
export function formatPythonVersion(version: [number, number, number]): string {
  return version.join(".");
}

/** Probes one Python candidate and classifies the result for CLI reporting. */
export async function probePythonCandidate(
  candidate: PythonCandidate,
  execFileImpl: ExecFileLike = execFile,
  hasJupyter: (
    command: string,
    argsPrefix?: string[]
  ) => Promise<boolean> = async () => false
): Promise<PythonInstallation> {
  try {
    const { stdout } = await execFileImpl(candidate.command, [
      ...candidate.argsPrefix,
      "-c",
      INSPECT_SCRIPT,
    ]);
    const data = JSON.parse(stdout) as {
      executable?: unknown;
      version?: unknown;
    };

    if (
      typeof data.executable !== "string" ||
      !Array.isArray(data.version) ||
      data.version.length < 3
    ) {
      return {
        status: "probe-failed",
        label: candidate.label,
        reason: "Could not inspect Python executable",
      };
    }

    const version = data.version.slice(0, 3) as [number, number, number];
    const support = getPythonSupport(version);
    if (support === "unsupported") {
      return {
        status: "unsupported",
        label: candidate.label,
        candidate,
        executable: data.executable,
        version,
        reason: "Python 3.8+ required",
      };
    }

    const runtime: PythonRuntime = {
      candidate,
      executable: data.executable,
      version,
      support,
    };
    const jupyterReady = await hasJupyter(candidate.command, candidate.argsPrefix);
    if (jupyterReady) {
      return {
        status: "ready",
        label: candidate.label,
        candidate,
        runtime,
        executable: data.executable,
        version,
      };
    }

    return {
      status: "no-jupyter",
      label: candidate.label,
      candidate,
      runtime,
      executable: data.executable,
      version,
      reason: "jupyter_server not installed",
    };
  } catch {
    return {
      status: "probe-failed",
      label: candidate.label,
      candidate,
      reason: "Command failed or Python is not installed",
    };
  }
}

/** Probes managed, candidate, and saved Python installations for CLI selection. */
export async function probePythonInstallations(
  options: {
    candidates?: PythonCandidate[];
    execFileImpl?: ExecFileLike;
    hasJupyter?: (command: string, argsPrefix?: string[]) => Promise<boolean>;
    managedPythonPath?: string;
  } = {}
): Promise<PythonInstallationReport> {
  const candidates = options.candidates ?? getPythonDiscoveryCandidates();
  const execFileImpl = options.execFileImpl ?? execFile;
  const hasJupyter =
    options.hasJupyter ??
    (async () => {
      return false;
    });

  const ready: PythonInstallation[] = [];
  const noJupyter: PythonInstallation[] = [];
  const unsupported: PythonInstallation[] = [];
  const probeFailed: PythonInstallation[] = [];
  const seenExecutables = new Set<string>();
  const seenProbeCommands = new Set<string>();

  for (const candidate of candidates) {
    const probeCommand = [candidate.command, ...candidate.argsPrefix].join(" ");
    if (seenProbeCommands.has(probeCommand)) {
      continue;
    }
    seenProbeCommands.add(probeCommand);

    const installation = await probePythonCandidate(candidate, execFileImpl, hasJupyter);
    if (
      installation.executable &&
      (installation.status === "ready" ||
        installation.status === "no-jupyter" ||
        installation.status === "unsupported")
    ) {
      if (seenExecutables.has(installation.executable)) {
        continue;
      }
      seenExecutables.add(installation.executable);
    }

    switch (installation.status) {
      case "ready":
        ready.push(installation);
        break;
      case "no-jupyter":
        noJupyter.push(installation);
        break;
      case "unsupported":
        unsupported.push(installation);
        break;
      case "probe-failed":
        probeFailed.push(installation);
        break;
    }
  }

  if (options.managedPythonPath) {
    const managedCandidate: PythonCandidate = {
      label: "Orion managed",
      command: options.managedPythonPath,
      argsPrefix: [],
    };
    if (!seenExecutables.has(options.managedPythonPath)) {
      const managedInstallation = await probePythonCandidate(
        managedCandidate,
        execFileImpl,
        hasJupyter
      );
      if (managedInstallation.status === "ready" && managedInstallation.runtime) {
        ready.push({
          ...managedInstallation,
          label: "Orion managed",
          managed: true,
        });
        seenExecutables.add(options.managedPythonPath);
      }
    }
  }

  const venvCreationRuntime = await discoverPythonRuntime(candidates, execFileImpl);

  return {
    ready,
    noJupyter,
    unsupported,
    probeFailed,
    venvCreationRuntime,
  };
}

/** Discovers all supported Python runtimes, deduplicated by executable path. */
export async function discoverAllPythonRuntimes(
  candidates = getPythonDiscoveryCandidates(),
  execFileImpl: ExecFileLike = execFile
): Promise<PythonRuntime[]> {
  const runtimes: PythonRuntime[] = [];
  const seenExecutables = new Set<string>();

  for (const candidate of candidates) {
    const runtime = await inspectPythonCandidate(candidate, execFileImpl);
    if (runtime && !seenExecutables.has(runtime.executable)) {
      seenExecutables.add(runtime.executable);
      runtimes.push(runtime);
    }
  }

  return runtimes;
}

/** Discovers the best supported Python runtime, preferring Python 3.9+. */
export async function discoverPythonRuntime(
  candidates = getPythonDiscoveryCandidates(),
  execFileImpl: ExecFileLike = execFile
): Promise<PythonRuntime | null> {
  const runtimes = await discoverAllPythonRuntimes(candidates, execFileImpl);

  return (
    runtimes.find((runtime) => runtime.support === "preferred") ??
    runtimes.find((runtime) => runtime.support === "legacy") ??
    null
  );
}

/** Selects package constraints for Orion's managed Jupyter environment. */
export function getManagedPackageSet(
  support: PythonRuntime["support"],
  orionVersion: string
): ManagedPackageSet {
  const jupyterServer =
    support === "legacy" ? "jupyter_server>=1.24,<2" : "jupyter_server>=2,<3";

  return {
    support,
    packages: [
      jupyterServer,
      "jupyter_server_terminals>=0.4,<1",
      "ipykernel>=6,<7",
      `orion-ui==${orionVersion}`,
    ],
  };
}

/** Builds the stdlib venv creation command for Orion's managed runtime. */
export function buildCreateVenvCommand(
  runtime: PythonRuntime,
  venvDirectory = resolveManagedVenvDirectory()
): CommandSpec {
  return {
    command: runtime.candidate.command,
    args: [...runtime.candidate.argsPrefix, "-m", "venv", venvDirectory],
  };
}

/** Builds the pip install command for Orion's managed runtime. */
export function buildInstallPackagesCommand(
  venvPythonPath: string,
  packageSet: ManagedPackageSet
): CommandSpec {
  return {
    command: venvPythonPath,
    args: ["-m", "pip", "install", "--upgrade", "pip", ...packageSet.packages],
  };
}

/** Installs or upgrades managed runtime packages in an existing venv. */
export async function syncManagedRuntimePackages(
  venvPythonPath: string,
  support: PythonRuntime["support"],
  orionVersion: string,
  execFileImpl: ExecFileLike = execFile
): Promise<void> {
  const packageSet = getManagedPackageSet(support, orionVersion);
  console.log(
    `Syncing Orion-managed runtime packages (${packageSet.packages.join(", ")})...`
  );
  const installPackages = buildInstallPackagesCommand(venvPythonPath, packageSet);
  await execFileImpl(installPackages.command, installPackages.args);
}

/** Creates or updates Orion's managed venv without touching global Python. */
export async function ensureManagedPythonEnvironment(
  runtime: PythonRuntime,
  orionVersion: string,
  execFileImpl: ExecFileLike = execFile
): Promise<string> {
  const runtimeDirectory = resolveOrionRuntimeDirectory();
  const venvDirectory = resolveManagedVenvDirectory();
  await mkdir(runtimeDirectory, { recursive: true });

  console.log(`Creating Orion-managed Python environment at ${venvDirectory}...`);
  const createVenv = buildCreateVenvCommand(runtime, venvDirectory);
  await execFileImpl(createVenv.command, createVenv.args);

  const venvPythonPath = resolveManagedVenvPythonPath(venvDirectory);
  console.log("Installing managed runtime packages... This may take a few minutes.");
  await syncManagedRuntimePackages(venvPythonPath, runtime.support, orionVersion, execFileImpl);

  console.log("Orion-managed Python environment is ready.");
  return venvPythonPath;
}
