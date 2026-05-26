// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  choiceForManagedRuntime,
  choiceFromReadyInstallation,
  findReadyInstallation,
  formatInstallationSummary,
  resolvePythonChoice,
  selectDefaultReadyInstallation,
} from "@/lib/cli/python-selection";
import type { PythonInstallationReport, PythonRuntime } from "@/lib/cli/python";

function makeRuntime(executable: string, label: string): PythonRuntime {
  return {
    candidate: { label, command: executable, argsPrefix: [] },
    executable,
    version: [3, 13, 5],
    support: "preferred",
  };
}

function makeReport(
  overrides: Partial<PythonInstallationReport> = {}
): PythonInstallationReport {
  return {
    ready: [],
    noJupyter: [],
    unsupported: [],
    probeFailed: [],
    venvCreationRuntime: makeRuntime("/usr/bin/python3", "python3"),
    ...overrides,
  };
}

describe("CLI Python selection", () => {
  it("formats installation summaries with reasons", () => {
    expect(
      formatInstallationSummary({
        status: "no-jupyter",
        label: "python3",
        executable: "/usr/bin/python3",
        version: [3, 9, 6],
        reason: "jupyter_server not installed",
      })
    ).toBe(
      "- /usr/bin/python3 (Python 3.9.6, python3) — jupyter_server not installed"
    );
  });

  it("selects PYTHON when it matches a ready installation", () => {
    const report = makeReport({
      ready: [
        {
          status: "ready",
          label: "Conda",
          executable: "/opt/anaconda3/bin/python",
          version: [3, 13, 5],
          runtime: makeRuntime("/opt/anaconda3/bin/python", "Conda"),
        },
        {
          status: "ready",
          label: "python3",
          executable: "/usr/bin/python3",
          version: [3, 9, 6],
          runtime: makeRuntime("/usr/bin/python3", "python3"),
        },
      ],
    });

    expect(
      selectDefaultReadyInstallation(report, {
        NODE_ENV: "test",
        PYTHON: "/opt/anaconda3/bin/python",
      })?.executable
    ).toBe("/opt/anaconda3/bin/python");
  });

  it("auto-selects the default ready runtime with --yes", async () => {
    const report = makeReport({
      ready: [
        {
          status: "ready",
          label: "Conda",
          executable: "/opt/anaconda3/bin/python",
          version: [3, 13, 5],
          runtime: makeRuntime("/opt/anaconda3/bin/python", "Conda"),
        },
      ],
    });

    const choice = await resolvePythonChoice(report, { assumeYes: true });
    expect(choice.kind).toBe("existing");
    expect(choice.runtime.executable).toBe("/opt/anaconda3/bin/python");
  });

  it("prompts to create managed runtime when none are ready", async () => {
    const report = makeReport({
      ready: [],
      noJupyter: [
        {
          status: "no-jupyter",
          label: "python3",
          executable: "/usr/bin/python3",
          version: [3, 9, 6],
          reason: "jupyter_server not installed",
        },
      ],
    });

    await expect(resolvePythonChoice(report, { assumeYes: false })).rejects.toThrow(
      "non-interactive"
    );

    const managedChoice = await resolvePythonChoice(report, { assumeYes: true });
    expect(managedChoice.kind).toBe("managed");
    expect(managedChoice.runtime.executable).toBe("/usr/bin/python3");
  });

  it("finds a saved ready installation by executable path", () => {
    const report = makeReport({
      ready: [
        {
          status: "ready",
          label: "Conda",
          executable: "/opt/anaconda3/bin/python",
          version: [3, 13, 5],
          runtime: makeRuntime("/opt/anaconda3/bin/python", "Conda"),
        },
      ],
    });

    expect(findReadyInstallation(report, "/opt/anaconda3/bin/python")?.label).toBe(
      "Conda"
    );
  });

  it("builds managed and ready choices", () => {
    const runtime = makeRuntime("/opt/anaconda3/bin/python", "Conda");
    const readyChoice = choiceFromReadyInstallation({
      status: "ready",
      label: "Conda",
      executable: runtime.executable,
      version: runtime.version,
      runtime,
    });
    expect(readyChoice.kind).toBe("existing");

    const managedChoice = choiceForManagedRuntime(makeReport());
    expect(managedChoice.kind).toBe("managed");
  });
});
