// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
} from "@/lib/cli/paths";
import {
  buildRestorePackagesCommand,
  ensureDesktopManagedVenv,
  probePythonMinorVersion,
  readVenvState,
  recordVenvPackageSnapshot,
  resolveDesktopVenvStatePath,
  snapshotVenvPackages,
  writeVenvState,
  type DesktopVenvState,
  type ExecFileLike,
} from "@/lib/desktop/python-runtime";

const BASE_PYTHON_DIRECTORY = "/Applications/Orion.app/Contents/Resources/runtime/python";

let tempDirectory: string;
let basePython: string;

/** Records every command a fake interpreter received, for behavioral assertions. */
interface ExecCall {
  command: string;
  args: string[];
}

interface FakePythonOptions {
  /** Version reported by the bundled base interpreter, or null to make it unusable. */
  baseVersion?: string | null;
  /** Version reported by a freshly created venv interpreter. */
  createdVersion?: string;
  /** Packages `pip list --local --format=json` reports. */
  installed?: { name: string; version: string }[];
  /** Package names whose `pip install` should fail. */
  failInstalls?: string[];
}

/**
 * Builds an execFile stand-in that emulates just enough of CPython: version
 * probes, `-m venv` (which materializes the venv interpreter on disk so later
 * probes succeed), `pip list`, and `pip install`.
 */
function createFakePython(options: FakePythonOptions = {}): {
  execFile: ExecFileLike;
  calls: ExecCall[];
} {
  const {
    baseVersion = "3.13",
    createdVersion = baseVersion ?? "3.13",
    installed = [],
    failInstalls = [],
  } = options;
  const calls: ExecCall[] = [];

  const execFile: ExecFileLike = async (command, args) => {
    calls.push({ command, args });

    if (args[0] === "-c") {
      if (command === basePython) {
        if (!baseVersion) {
          throw new Error("bundled interpreter is broken");
        }
        return { stdout: `${baseVersion}\n`, stderr: "" };
      }
      return { stdout: `${createdVersion}\n`, stderr: "" };
    }

    if (args[0] === "-m" && args[1] === "venv") {
      const venvDirectory = args[args.length - 1];
      const venvPython = resolveManagedVenvPythonPath(venvDirectory);
      await mkdir(path.dirname(venvPython), { recursive: true });
      await writeFile(venvPython, "#!/bin/sh\n", "utf8");
      return { stdout: "", stderr: "" };
    }

    if (args[0] === "-m" && args[1] === "pip" && args[2] === "list") {
      return { stdout: JSON.stringify(installed), stderr: "" };
    }

    if (args[0] === "-m" && args[1] === "pip" && args[2] === "install") {
      const specs = args.slice(3);
      const failing = specs.filter((spec) =>
        failInstalls.some((name) => spec.startsWith(`${name}==`))
      );
      if (failing.length > 0) {
        throw new Error(`pip could not install ${failing.join(", ")}`);
      }
      return { stdout: "", stderr: "" };
    }

    return { stdout: "", stderr: "" };
  };

  return { execFile, calls };
}

/** Creates a stand-in venv interpreter on disk so health probes find it. */
async function createExistingVenvPython(): Promise<string> {
  const venvPython = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
  await mkdir(path.dirname(venvPython), { recursive: true });
  await writeFile(venvPython, "#!/bin/sh\n", "utf8");
  return venvPython;
}

function createState(overrides: Partial<DesktopVenvState> = {}): DesktopVenvState {
  return {
    schema: 1,
    basePythonPath: basePython,
    basePythonVersion: "3.13",
    createdAt: "2026-01-01T00:00:00.000Z",
    packages: [],
    ...overrides,
  };
}

/** Returns whether the fake interpreter was asked to build a virtual environment. */
function createdVenv(calls: ExecCall[]): boolean {
  return calls.some((call) => call.args[0] === "-m" && call.args[1] === "venv");
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-python-runtime-"));
  process.env.ORION_HOME_DIR = tempDirectory;
  basePython = path.join(BASE_PYTHON_DIRECTORY, "bin", "python3");
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("managed venv state", () => {
  it("treats a missing state file as absent", async () => {
    await expect(readVenvState()).resolves.toBeNull();
  });

  it("treats malformed JSON as absent rather than throwing", async () => {
    await mkdir(path.dirname(resolveDesktopVenvStatePath()), { recursive: true });
    await writeFile(resolveDesktopVenvStatePath(), "{ not json", "utf8");
    await expect(readVenvState()).resolves.toBeNull();
  });

  it("rejects state that does not match the schema", async () => {
    await mkdir(path.dirname(resolveDesktopVenvStatePath()), { recursive: true });
    await writeFile(
      resolveDesktopVenvStatePath(),
      JSON.stringify({ schema: 2, basePythonPath: "/python" }),
      "utf8"
    );
    await expect(readVenvState()).resolves.toBeNull();
  });

  it("round-trips a written state", async () => {
    const state = createState({ packages: [{ name: "pandas", version: "2.2.3" }] });
    await writeVenvState(state);
    await expect(readVenvState()).resolves.toEqual(state);
  });
});

describe("interpreter probing", () => {
  it("returns null for an interpreter that does not exist", async () => {
    const { execFile } = createFakePython();
    await expect(
      probePythonMinorVersion(path.join(tempDirectory, "missing"), execFile)
    ).resolves.toBeNull();
  });

  it("returns null when the interpreter cannot run", async () => {
    const venvPython = await createExistingVenvPython();
    const execFile: ExecFileLike = async () => {
      throw new Error("dyld: library not found");
    };
    await expect(probePythonMinorVersion(venvPython, execFile)).resolves.toBeNull();
  });
});

describe("package snapshots", () => {
  it("excludes packages that python -m venv provisions itself", async () => {
    const venvPython = await createExistingVenvPython();
    const { execFile } = createFakePython({
      installed: [
        { name: "pip", version: "25.0" },
        { name: "setuptools", version: "80.0" },
        { name: "pandas", version: "2.2.3" },
      ],
    });

    await expect(snapshotVenvPackages(venvPython, execFile)).resolves.toEqual([
      { name: "pandas", version: "2.2.3" },
    ]);
  });

  it("returns nothing when pip output cannot be parsed", async () => {
    const venvPython = await createExistingVenvPython();
    const execFile: ExecFileLike = async () => ({ stdout: "not json", stderr: "" });
    await expect(snapshotVenvPackages(venvPython, execFile)).resolves.toEqual([]);
  });

  it("pins restored packages to their recorded versions", () => {
    expect(
      buildRestorePackagesCommand("/venv/bin/python", [
        { name: "pandas", version: "2.2.3" },
        { name: "polars", version: "1.9.0" },
      ])
    ).toEqual({
      command: "/venv/bin/python",
      args: ["-m", "pip", "install", "pandas==2.2.3", "polars==1.9.0"],
    });
  });

  it("does not record a snapshot before the environment is provisioned", async () => {
    const venvPython = await createExistingVenvPython();
    const { execFile } = createFakePython({
      installed: [{ name: "pandas", version: "2.2.3" }],
    });

    await recordVenvPackageSnapshot(venvPython, execFile);
    await expect(readVenvState()).resolves.toBeNull();
  });

  it("updates the recorded packages once state exists", async () => {
    const venvPython = await createExistingVenvPython();
    await writeVenvState(createState());
    const { execFile } = createFakePython({
      installed: [{ name: "pandas", version: "2.2.3" }],
    });

    await recordVenvPackageSnapshot(venvPython, execFile);
    await expect(readVenvState()).resolves.toMatchObject({
      packages: [{ name: "pandas", version: "2.2.3" }],
    });
  });
});

describe("ensureDesktopManagedVenv", () => {
  it("reuses a healthy environment without rebuilding it", async () => {
    const venvPython = await createExistingVenvPython();
    await writeVenvState(createState({ packages: [{ name: "pandas", version: "2.2.3" }] }));
    const { execFile, calls } = createFakePython();

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result).toEqual({
      pythonPath: venvPython,
      created: false,
      restoredPackages: [],
      failedPackages: [],
    });
    expect(createdVenv(calls)).toBe(false);
    // Reuse must not discard the restore list the repair path depends on.
    await expect(readVenvState()).resolves.toMatchObject({
      packages: [{ name: "pandas", version: "2.2.3" }],
    });
  });

  it("adopts a healthy environment that has no recorded state", async () => {
    const venvPython = await createExistingVenvPython();
    const { execFile, calls } = createFakePython();

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(false);
    expect(result.pythonPath).toBe(venvPython);
    expect(createdVenv(calls)).toBe(false);
    await expect(readVenvState()).resolves.toMatchObject({
      basePythonPath: basePython,
      basePythonVersion: "3.13",
    });
  });

  it("re-records state when the app moved but the environment still runs", async () => {
    await createExistingVenvPython();
    await writeVenvState(createState({ basePythonPath: "/Volumes/Old/python3" }));
    const { execFile, calls } = createFakePython();

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(false);
    expect(createdVenv(calls)).toBe(false);
    await expect(readVenvState()).resolves.toMatchObject({
      basePythonPath: basePython,
    });
  });

  it("creates the environment when it does not exist yet", async () => {
    const { execFile, calls } = createFakePython();

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(true);
    expect(result.pythonPath).toBe(
      resolveManagedVenvPythonPath(resolveManagedVenvDirectory())
    );
    expect(existsSync(result.pythonPath)).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.command === basePython &&
          call.args[0] === "-m" &&
          call.args[1] === "venv" &&
          call.args.includes("--system-site-packages")
      )
    ).toBe(true);
  });

  it("rebuilds and restores recorded packages when the interpreter cannot run", async () => {
    await createExistingVenvPython();
    await writeVenvState(
      createState({
        packages: [
          { name: "pandas", version: "2.2.3" },
          { name: "polars", version: "1.9.0" },
        ],
      })
    );

    let venvProbes = 0;
    const { execFile: fake } = createFakePython();
    const execFile: ExecFileLike = async (command, args) => {
      // The first venv probe fails, standing in for a dangling interpreter after
      // a Python minor bump; the rebuilt environment then answers normally.
      if (args[0] === "-c" && command !== basePython) {
        venvProbes += 1;
        if (venvProbes === 1) {
          throw new Error("dyld: python3.13 not found");
        }
      }
      return fake(command, args);
    };

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(true);
    expect(result.restoredPackages).toEqual(["pandas", "polars"]);
    expect(result.failedPackages).toEqual([]);
  });

  it("rebuilds when the environment reports a different Python minor version", async () => {
    await createExistingVenvPython();
    await writeVenvState(createState());
    const { execFile, calls } = createFakePython({
      baseVersion: "3.14",
      createdVersion: "3.13",
    });

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(true);
    expect(createdVenv(calls)).toBe(true);
    await expect(readVenvState()).resolves.toMatchObject({
      basePythonVersion: "3.14",
    });
  });

  it("reports packages it could not reinstall instead of failing the launch", async () => {
    await writeVenvState(
      createState({
        packages: [
          { name: "pandas", version: "2.2.3" },
          { name: "unavailable-package", version: "9.9.9" },
        ],
      })
    );
    const { execFile } = createFakePython({ failInstalls: ["unavailable-package"] });

    const result = await ensureDesktopManagedVenv(basePython, execFile);

    expect(result.created).toBe(true);
    expect(result.restoredPackages).toEqual(["pandas"]);
    expect(result.failedPackages).toEqual(["unavailable-package"]);
  });

  it("fails when the bundled interpreter cannot report a version", async () => {
    const { execFile } = createFakePython({ baseVersion: null });

    await expect(ensureDesktopManagedVenv(basePython, execFile)).rejects.toThrow(
      /did not report a usable version/
    );
  });
});
