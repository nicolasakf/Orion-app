import { execFile as execFileCallback } from "child_process";
import { mkdir } from "fs/promises";
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

/** Discovers the best supported Python runtime, preferring Python 3.9+. */
export async function discoverPythonRuntime(
  candidates = getPythonDiscoveryCandidates(),
  execFileImpl: ExecFileLike = execFile
): Promise<PythonRuntime | null> {
  const runtimes: PythonRuntime[] = [];
  for (const candidate of candidates) {
    const runtime = await inspectPythonCandidate(candidate, execFileImpl);
    if (runtime) {
      runtimes.push(runtime);
    }
  }

  return (
    runtimes.find((runtime) => runtime.support === "preferred") ??
    runtimes.find((runtime) => runtime.support === "legacy") ??
    null
  );
}

/** Selects package constraints for Orion's managed Jupyter environment. */
export function getManagedPackageSet(
  support: PythonRuntime["support"]
): ManagedPackageSet {
  if (support === "legacy") {
    return {
      support,
      packages: [
        "jupyter_server>=1.24,<2",
        "jupyter_server_terminals>=0.4,<1",
        "ipykernel>=6,<7",
      ],
    };
  }

  return {
    support,
    packages: [
      "jupyter_server>=2,<3",
      "jupyter_server_terminals>=0.4,<1",
      "ipykernel>=6,<7",
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

/** Creates or updates Orion's managed venv without touching global Python. */
export async function ensureManagedPythonEnvironment(
  runtime: PythonRuntime,
  execFileImpl: ExecFileLike = execFile
): Promise<string> {
  const runtimeDirectory = resolveOrionRuntimeDirectory();
  const venvDirectory = resolveManagedVenvDirectory();
  await mkdir(runtimeDirectory, { recursive: true });

  console.log(`Creating Orion-managed Python environment at ${venvDirectory}...`);
  const createVenv = buildCreateVenvCommand(runtime, venvDirectory);
  await execFileImpl(createVenv.command, createVenv.args);

  const venvPythonPath = resolveManagedVenvPythonPath(venvDirectory);
  const packageSet = getManagedPackageSet(runtime.support);
  console.log(
    `Installing Jupyter packages (${packageSet.packages.join(", ")})... This may take a few minutes.`
  );
  const installPackages = buildInstallPackagesCommand(venvPythonPath, packageSet);
  await execFileImpl(installPackages.command, installPackages.args);

  console.log("Orion-managed Python environment is ready.");
  return venvPythonPath;
}
