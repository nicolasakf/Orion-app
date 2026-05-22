// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  resolveCachedAppDirectory,
  resolveJupyterConnectionFilePath,
  resolveManagedVenvDirectory,
  resolveOrionRuntimeDirectory,
} from "@/lib/cli/paths";

describe("CLI runtime paths", () => {
  it("uses USERPROFILE/.orion on Windows instead of LOCALAPPDATA", () => {
    const env = {
      USERPROFILE: "C:\\Users\\Taylor",
      LOCALAPPDATA: "C:\\Users\\Taylor\\AppData\\Local",
    };

    expect(resolveOrionRuntimeDirectory({ platform: "win32", env })).toBe(
      "C:\\Users\\Taylor\\.orion\\runtime"
    );
    expect(resolveManagedVenvDirectory({ platform: "win32", env })).toBe(
      "C:\\Users\\Taylor\\.orion\\runtime\\venv"
    );
    expect(resolveJupyterConnectionFilePath({ platform: "win32", env })).toBe(
      "C:\\Users\\Taylor\\.orion\\runtime\\jupyter-connection.json"
    );
  });

  it("uses ~/.orion app cache paths for POSIX platforms", () => {
    expect(
      resolveCachedAppDirectory("0.4.0", {
        platform: "darwin",
        env: {},
        homedir: "/Users/taylor",
      })
    ).toBe("/Users/taylor/.orion/app/0.4.0");
  });
});
