// @vitest-environment node

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  buildNativeModuleEnv,
  ensureBundledNativeModules,
  isBuildToolchainError,
  isNativeModuleLoadError,
  isNodeSqliteAvailable,
  resolveBetterSqlite3Directory,
  resolveNpmExecutable,
  resolvePrebuildInstallScript,
} from "@/lib/cli/ensure-native-modules";

describe("ensure-native-modules", () => {
  it("resolves the bundled better-sqlite3 directory", () => {
    expect(resolveBetterSqlite3Directory("/tmp/orion-app")).toBe(
      join("/tmp/orion-app", "node_modules", "better-sqlite3")
    );
  });

  it("detects common native module load failures", () => {
    expect(
      isNativeModuleLoadError(
        "Error: better_sqlite3.node is not a valid Win32 application."
      )
    ).toBe(true);
    expect(isNativeModuleLoadError("Error: invalid ELF header")).toBe(true);
    expect(isNativeModuleLoadError("Error: not a valid Mach-O file")).toBe(true);
    expect(isNativeModuleLoadError("Error: ERR_DLOPEN_FAILED")).toBe(true);
    expect(isNativeModuleLoadError("Error: module not found")).toBe(false);
  });

  it("detects missing native build toolchain errors", () => {
    expect(isBuildToolchainError("gyp ERR! find VS")).toBe(true);
    expect(isBuildToolchainError("Could not find any Visual Studio installation")).toBe(
      true
    );
    expect(isBuildToolchainError("prebuild-install warn install No prebuilt binaries")).toBe(
      false
    );
  });

  it("falls back to npm on PATH when sibling npm is absent", () => {
    expect(resolveNpmExecutable("/tmp/orion-vitest-no-sibling-npm/node")).toBe(
      "npm"
    );
  });

  it("prefers npm next to the Node binary when present", () => {
    const dir = join(tmpdir(), `orion-npm-resolve-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const nodePath = join(dir, "node");
    const npmPath = join(dir, process.platform === "win32" ? "npm.cmd" : "npm");
    writeFileSync(npmPath, "");
    try {
      expect(resolveNpmExecutable(nodePath)).toBe(npmPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prepends the active Node binary and npm bins to PATH", () => {
    const appDirectory = "/tmp/orion-app";
    const nodeExecutable = join("/tmp", "portable-node", "node.exe");
    const env = buildNativeModuleEnv(nodeExecutable, appDirectory);
    const pathValue = env.PATH ?? "";

    expect(pathValue.startsWith(join("/tmp", "portable-node"))).toBe(true);
    expect(pathValue).toContain(join(appDirectory, "node_modules", ".bin"));
    expect(pathValue).toContain(
      join(appDirectory, "node_modules", "better-sqlite3", "node_modules", ".bin")
    );
    if (process.platform === "win32") {
      expect(env.Path).toBe(pathValue);
    }
  });

  it("resolves prebuild-install from the better-sqlite3 package tree", () => {
    const appDirectory = join(tmpdir(), `orion-prebuild-${process.pid}`);
    const prebuildDirectory = join(
      appDirectory,
      "node_modules",
      "better-sqlite3",
      "node_modules",
      "prebuild-install"
    );
    mkdirSync(prebuildDirectory, { recursive: true });
    const scriptPath = join(prebuildDirectory, "bin.js");
    writeFileSync(scriptPath, "");

    try {
      expect(resolvePrebuildInstallScript(appDirectory)).toBe(scriptPath);
    } finally {
      rmSync(appDirectory, { recursive: true, force: true });
    }
  });

  it("skips better-sqlite3 rebuild when node:sqlite is available", () => {
    if (!isNodeSqliteAvailable()) {
      return;
    }

    const appDirectory = join(tmpdir(), `orion-node-sqlite-skip-${process.pid}`);
    mkdirSync(join(appDirectory, "node_modules", "better-sqlite3"), {
      recursive: true,
    });
    writeFileSync(join(appDirectory, "server.js"), "module.exports = {};\n");

    try {
      expect(() => ensureBundledNativeModules(appDirectory)).not.toThrow();
      expect(process.env.ORION_CHAT_STORAGE_DEGRADED).toBeUndefined();
    } finally {
      delete process.env.ORION_CHAT_STORAGE_DEGRADED;
      rmSync(appDirectory, { recursive: true, force: true });
    }
  });
});
