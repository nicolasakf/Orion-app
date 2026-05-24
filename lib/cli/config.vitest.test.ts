// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearPythonPreference,
  describePythonPreference,
  savePythonPreference,
} from "@/lib/cli/python-selection";
import type { PythonInstallationReport, PythonRuntime } from "@/lib/cli/python";

let tempHome: string | null = null;

afterEach(async () => {
  if (tempHome) {
    await rm(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
});

async function withTempHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  tempHome = await mkdtemp(join(tmpdir(), "orion-config-test-"));
  const previous = process.env.ORION_HOME_DIR;
  process.env.ORION_HOME_DIR = tempHome;
  try {
    return await run(tempHome);
  } finally {
    if (previous === undefined) {
      delete process.env.ORION_HOME_DIR;
    } else {
      process.env.ORION_HOME_DIR = previous;
    }
  }
}

function makeRuntime(executable: string): PythonRuntime {
  return {
    candidate: { label: "Conda", command: executable, argsPrefix: [] },
    executable,
    version: [3, 13, 5],
    support: "preferred",
  };
}

describe("CLI config preferences", () => {
  it("clears a saved python preference file", async () => {
    await withTempHome(async (home) => {
      const preferencePath = join(home, "runtime", "python-preference.json");
      await mkdir(join(home, "runtime"), { recursive: true });
      await writeFile(
        preferencePath,
        `${JSON.stringify({ executable: "/opt/anaconda3/bin/python", kind: "existing", savedAt: "2026-01-01T00:00:00.000Z" })}\n`,
        "utf8"
      );

      expect(await clearPythonPreference(preferencePath)).toBe(true);
      await expect(readFile(preferencePath, "utf8")).rejects.toThrow();
    });
  });

  it("describes a ready saved preference", async () => {
    const report: PythonInstallationReport = {
      ready: [
        {
          status: "ready",
          label: "Conda",
          executable: "/opt/anaconda3/bin/python",
          version: [3, 13, 5],
          runtime: makeRuntime("/opt/anaconda3/bin/python"),
        },
      ],
      noJupyter: [],
      unsupported: [],
      probeFailed: [],
      venvCreationRuntime: makeRuntime("/usr/bin/python3"),
    };

    const described = await describePythonPreference(report, {
      executable: "/opt/anaconda3/bin/python",
      kind: "existing",
      savedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(described.status).toBe("ready");
    expect(described.installation?.executable).toBe("/opt/anaconda3/bin/python");
  });

  it("marks missing ready runtimes as stale", async () => {
    const report: PythonInstallationReport = {
      ready: [],
      noJupyter: [],
      unsupported: [],
      probeFailed: [],
      venvCreationRuntime: makeRuntime("/usr/bin/python3"),
    };

    const described = await describePythonPreference(report, {
      executable: "/opt/anaconda3/bin/python",
      kind: "existing",
      savedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(described.status).toBe("stale");
  });

  it("persists python preferences under the runtime directory", async () => {
    await withTempHome(async (home) => {
      await savePythonPreference({
        kind: "existing",
        runtime: makeRuntime("/opt/anaconda3/bin/python"),
      });

      const saved = JSON.parse(
        await readFile(join(home, "runtime", "python-preference.json"), "utf8")
      ) as { executable: string; kind: string };

      expect(saved.executable).toBe("/opt/anaconda3/bin/python");
      expect(saved.kind).toBe("existing");
    });
  });
});
