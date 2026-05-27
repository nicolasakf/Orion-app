// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildCreateVenvCommand,
  buildInstallPackagesCommand,
  discoverAllPythonRuntimes,
  discoverPythonRuntime,
  getManagedPackageSet,
  getPythonDiscoveryCandidates,
  getPythonSupport,
  parsePythonVersion,
  type PythonCandidate,
} from "@/lib/cli/python";

describe("CLI Python runtime", () => {
  it("classifies Python versions for Orion support", () => {
    expect(parsePythonVersion("Python 3.11.8")).toEqual([3, 11, 8]);
    expect(getPythonSupport([3, 9, 0])).toBe("preferred");
    expect(getPythonSupport([3, 8, 18])).toBe("legacy");
    expect(getPythonSupport([3, 7, 17])).toBe("unsupported");
  });

  it("prefers Python 3.9+ over Python 3.8", async () => {
    const candidates: PythonCandidate[] = [
      { label: "legacy", command: "python3.8", argsPrefix: [] },
      { label: "preferred", command: "python3.11", argsPrefix: [] },
    ];

    const runtime = await discoverPythonRuntime(candidates, async (command) => {
      const version = command === "python3.8" ? [3, 8, 18] : [3, 11, 8];
      return {
        stdout: JSON.stringify({ executable: `/bin/${command}`, version }),
        stderr: "",
      };
    });

    expect(runtime?.candidate.label).toBe("preferred");
  });

  it("uses stdlib venv and pip commands, not uv", () => {
    const runtime = {
      candidate: { label: "python3", command: "python3", argsPrefix: [] },
      executable: "/usr/bin/python3",
      version: [3, 11, 8] as [number, number, number],
      support: "preferred" as const,
    };
    const packageSet = getManagedPackageSet(runtime.support, "0.6.2");

    expect(buildCreateVenvCommand(runtime, "/tmp/orion/venv")).toEqual({
      command: "python3",
      args: ["-m", "venv", "/tmp/orion/venv"],
    });
    expect(buildInstallPackagesCommand("/tmp/orion/venv/bin/python", packageSet)).toEqual({
      command: "/tmp/orion/venv/bin/python",
      args: ["-m", "pip", "install", "--upgrade", "pip", ...packageSet.packages],
    });
    expect(packageSet.packages.join(" ")).not.toContain("uv");
    expect(packageSet.packages).toContain("orion-ui==0.6.2");
  });

  it("uses legacy Jupyter pins for Python 3.8", () => {
    expect(getManagedPackageSet("legacy", "0.6.2").packages).toContain(
      "jupyter_server>=1.24,<2"
    );
    expect(getManagedPackageSet("legacy", "0.6.2").packages).toContain("orion-ui==0.6.2");
  });

  it("uses preferred Jupyter pins for Python 3.9+", () => {
    expect(getManagedPackageSet("preferred", "0.6.2").packages).toContain(
      "jupyter_server>=2,<3"
    );
  });

  it("uses Windows Python launcher candidates on Windows", () => {
    expect(
      getPythonDiscoveryCandidates("win32", { NODE_ENV: "test" }).map((candidate) => candidate.command)
    ).toEqual(["py", "python", "python3"]);
  });

  it("includes the active Conda interpreter when CONDA_PREFIX is set", () => {
    expect(
      getPythonDiscoveryCandidates("darwin", {
        NODE_ENV: "test",
        CONDA_PREFIX: "/opt/anaconda3",
      }).map((candidate) => candidate.command)
    ).toEqual([
      "/opt/anaconda3/bin/python",
      "python3",
      "python",
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
    ]);
  });

  it("deduplicates runtimes that resolve to the same executable", async () => {
    const candidates: PythonCandidate[] = [
      { label: "python3", command: "python3", argsPrefix: [] },
      { label: "python", command: "python", argsPrefix: [] },
    ];

    const runtimes = await discoverAllPythonRuntimes(candidates, async () => ({
      stdout: JSON.stringify({
        executable: "/opt/anaconda3/bin/python",
        version: [3, 13, 5],
      }),
      stderr: "",
    }));

    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]?.executable).toBe("/opt/anaconda3/bin/python");
  });
});
