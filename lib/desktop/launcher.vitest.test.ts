// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  chooseDesktopJupyterMode,
  createBundledPythonEnvironment,
  createBundledDesktopJupyterHandoff,
  normalizeDesktopDevUrl,
  requiresPackagedAppRuntime,
} from "@/lib/desktop/launcher";
import type { CapabilityCheckResult, StartedJupyterServer } from "@/lib/cli/jupyter";

const baseOptions = {
  appOnly: false,
  here: false,
  pickPython: false,
  smoke: false,
  useBundled: false,
};

describe("desktop launcher policy", () => {
  it("prevents bundled Python from modifying the signed application bundle", () => {
    expect(createBundledPythonEnvironment({ PATH: "/usr/bin" })).toEqual({
      PATH: "/usr/bin",
      PYTHONDONTWRITEBYTECODE: "1",
    });
  });

  it("defaults to bundled Python when no saved existing preference is ready", () => {
    expect(chooseDesktopJupyterMode(baseOptions, false)).toBe("bundled");
  });

  it("uses a saved existing-Python preference before the bundled runtime", () => {
    expect(chooseDesktopJupyterMode(baseOptions, true)).toBe("saved-existing");
  });

  it("forces the Python picker when requested", () => {
    expect(
      chooseDesktopJupyterMode({ ...baseOptions, pickPython: true }, true)
    ).toBe("pick-python");
  });

  it("lets --use-bundled override a saved existing preference", () => {
    expect(
      chooseDesktopJupyterMode(
        { ...baseOptions, pickPython: true, useBundled: true },
        true
      )
    ).toBe("bundled");
  });

  it("writes bundled desktop handoffs as managed Jupyter connections", () => {
    const server: StartedJupyterServer = {
      process: {} as StartedJupyterServer["process"],
      baseUrl: "http://127.0.0.1:9000/",
      token: "token",
      pythonPath: "/Applications/Orion.app/Contents/Resources/runtime/python/bin/python3",
      dispose: () => undefined,
    };
    const capabilities: CapabilityCheckResult = {
      ok: true,
      jupyterVersion: "2.17.0",
      missing: [],
      capabilities: {
        kernelspecs: true,
        sessions: true,
        kernels: true,
        contents: true,
        terminals: true,
        sysInfo: true,
      },
    };

    expect(
      createBundledDesktopJupyterHandoff(server, capabilities, "/Users/taylor")
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:9000/",
      token: "token",
      source: "managed",
      pythonPath:
        "/Applications/Orion.app/Contents/Resources/runtime/python/bin/python3",
      rootDirectory: "/Users/taylor",
      jupyterVersion: "2.17.0",
    });
  });

  it("normalizes valid Electron dev URLs", () => {
    expect(normalizeDesktopDevUrl("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001/"
    );
  });

  it("rejects non-http Electron dev URLs", () => {
    expect(() => normalizeDesktopDevUrl("file:///tmp/index.html")).toThrow(
      "ORION_DESKTOP_DEV_URL must be an http(s) URL."
    );
  });

  it("does not require packaged app resources when a dev URL is provided", () => {
    expect(requiresPackagedAppRuntime("http://127.0.0.1:3001")).toBe(false);
    expect(requiresPackagedAppRuntime(undefined)).toBe(true);
  });
});
