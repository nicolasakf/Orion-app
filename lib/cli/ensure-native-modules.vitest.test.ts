// @vitest-environment node

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  isNativeModuleLoadError,
  resolveBetterSqlite3Directory,
  resolveNpmExecutable,
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
});
