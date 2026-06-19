// @vitest-environment node

import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  resolveDesktopAppDirectory,
  resolveDesktopNodeExecutable,
  resolveDesktopPythonExecutable,
  resolveDesktopRuntimePaths,
} from "@/lib/desktop/paths";

describe("desktop runtime paths", () => {
  it("resolves macOS resource paths", () => {
    const options = {
      platform: "darwin" as const,
      resourcesPath: "/Example/Orion.app/Contents/Resources",
      env: {},
    };

    expect(resolveDesktopAppDirectory(options)).toBe(
      "/Example/Orion.app/Contents/Resources/orion-app"
    );
    expect(resolveDesktopNodeExecutable(options)).toBe(
      "/Example/Orion.app/Contents/Resources/runtime/node/bin/node"
    );
    expect(resolveDesktopPythonExecutable(options)).toBe(
      "/Example/Orion.app/Contents/Resources/runtime/python/bin/python3"
    );
  });

  it("resolves Windows resource paths", () => {
    const options = {
      platform: "win32" as const,
      resourcesPath: "C:\\Program Files\\Orion\\resources",
      env: {},
    };

    expect(resolveDesktopRuntimePaths(options)).toEqual({
      resourcesDirectory: "C:\\Program Files\\Orion\\resources",
      appDirectory: "C:\\Program Files\\Orion\\resources\\orion-app",
      nodeExecutable: "C:\\Program Files\\Orion\\resources\\runtime\\node\\node.exe",
      pythonExecutable: "C:\\Program Files\\Orion\\resources\\runtime\\python\\python.exe",
    });
  });

  it("falls back to the versioned Python binary when python3 is a broken symlink", () => {
    const resourcesPath = mkdtempSync(path.join(tmpdir(), "orion-desktop-runtime-"));
    const binDir = path.join(resourcesPath, "runtime", "python", "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "python3.13"), "");
    symlinkSync("/tmp/orion-missing-python3.13", path.join(binDir, "python3"));

    expect(
      resolveDesktopPythonExecutable({
        platform: "darwin",
        resourcesPath,
        env: {},
      })
    ).toBe(path.join(binDir, "python3.13"));
  });

  it("honors explicit runtime overrides", () => {
    expect(
      resolveDesktopRuntimePaths({
        platform: "darwin",
        resourcesPath: "/ignored",
        env: {
          ORION_DESKTOP_RESOURCES_DIR: "/tmp/resources",
          ORION_APP_DIR: "/tmp/app",
          ORION_DESKTOP_NODE: "/tmp/node",
          ORION_DESKTOP_PYTHON: "/tmp/python",
        },
      })
    ).toEqual({
      resourcesDirectory: "/tmp/resources",
      appDirectory: "/tmp/app",
      nodeExecutable: "/tmp/node",
      pythonExecutable: "/tmp/python",
    });
  });

  it("uses npm's Node executable for local npx electron runs", () => {
    expect(
      resolveDesktopNodeExecutable({
        platform: "darwin",
        resourcesPath: "/Applications/Orion.app/Contents/Resources",
        env: {
          npm_node_execpath: "/opt/homebrew/bin/node",
        },
      })
    ).toBe("/opt/homebrew/bin/node");
  });
});
