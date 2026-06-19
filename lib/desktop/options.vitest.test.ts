// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseDesktopOptions } from "@/lib/desktop/options";

describe("desktop option parsing", () => {
  it("parses supported desktop flags and ignores unknown Electron flags", () => {
    expect(
      parseDesktopOptions([
        "/Applications/Orion.app/Contents/MacOS/Orion",
        "--pick-python",
        "--here",
        "--smoke",
        "--original-process-start-time=123",
      ])
    ).toEqual({
      appOnly: false,
      here: true,
      pickPython: true,
      smoke: true,
      useBundled: false,
    });
  });

  it("parses bundled and app-only flags", () => {
    expect(parseDesktopOptions(["--use-bundled", "--app-only"])).toMatchObject({
      appOnly: true,
      useBundled: true,
    });
  });
});

