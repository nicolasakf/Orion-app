// @vitest-environment node

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
    expect(resolveNpmExecutable("/usr/local/bin/node")).toBe("npm");
  });
});
